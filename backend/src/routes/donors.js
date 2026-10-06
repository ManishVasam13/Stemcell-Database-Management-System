const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query, withUser } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const { nz, hlaValues } = require('./util');

router.get('/', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const { q, blood_group, status } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('(d.full_name LIKE ? OR d.phone LIKE ? OR d.donor_id = ?)'); params.push(`${q}%`, `%${q}%`, Number(q) || 0); }
  if (blood_group) { where.push('d.blood_group = ?'); params.push(blood_group); }
  if (status) { where.push('d.status = ?'); params.push(status); }
  const rows = await query(`
    SELECT d.donor_id, d.full_name, d.gender, d.blood_group, d.date_of_birth, fn_age(d.date_of_birth) AS age,
           d.phone, d.registration_date, d.status, (d.hla_a_1 IS NOT NULL) AS hla_typed,
           c.has_collection, c.has_storage, c.has_clinical_use, c.sample_count,
           (SELECT COUNT(*) FROM stem_cell_sample s WHERE s.donor_id = d.donor_id AND s.availability_status = 'AVAILABLE') AS available_samples
      FROM donor d JOIN v_donor_consent_status c ON c.donor_id = d.donor_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY d.registration_date DESC, d.donor_id DESC`, params);
  res.json(rows);
}));

router.get('/:id', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const [donor] = await query(`SELECT d.*, fn_age(d.date_of_birth) AS age, u.username
                                 FROM donor d LEFT JOIN \`user\` u ON u.user_id = d.user_id WHERE d.donor_id = ?`, [req.params.id]);
  if (!donor) throw httpError(404, 'Donor not found');
  const consents = await query('SELECT * FROM consent WHERE donor_id = ? ORDER BY consent_date DESC, consent_id DESC', [req.params.id]);
  const samples = await query(`
    SELECT s.sample_id, s.sample_type, s.collection_date, s.volume_ml, s.cd34_count, s.processing_status,
           s.availability_status, s.expiry_date, l.location_code, s.storage_position, h.hospital_name
      FROM stem_cell_sample s
      LEFT JOIN storage_location l ON l.location_id = s.location_id
      LEFT JOIN hospital h ON h.hospital_id = l.hospital_id
     WHERE s.donor_id = ? ORDER BY s.collection_date DESC`, [req.params.id]);
  const [flags] = await query('SELECT has_collection, has_storage, has_clinical_use FROM v_donor_consent_status WHERE donor_id = ?', [req.params.id]);
  res.json({ ...donor, consents, samples, consentFlags: flags });
}));

// sp_register_donor: login (optional) + donor + COLLECTION consent in one transaction
router.post('/', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const b = req.body;
  const hash = b.username ? await bcrypt.hash(b.password || 'StemVault@123', 10) : null;
  const donorId = await withUser(req.user.id, async (c) => {
    await c.query('CALL sp_register_donor(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, @donor_id)',
      [b.full_name, b.date_of_birth, b.gender, b.blood_group, b.phone, nz(b.email), nz(b.address),
        ...hlaValues(b), nz(b.username), hash]);
    const [[row]] = await c.query('SELECT @donor_id AS id');
    return row.id;
  });
  res.status(201).json({ donor_id: donorId, message: 'Donor registered with collection consent' });
}));

router.put('/:id', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const fields = ['full_name', 'date_of_birth', 'gender', 'blood_group', 'phone', 'email', 'address', 'status',
    'hla_a_1', 'hla_a_2', 'hla_b_1', 'hla_b_2', 'hla_drb1_1', 'hla_drb1_2'];
  const sets = fields.filter((f) => req.body[f] !== undefined);
  if (!sets.length) throw httpError(400, 'Nothing to update');
  await withUser(req.user.id, (c) => c.query(
    `UPDATE donor SET ${sets.map((f) => `${f} = ?`).join(', ')} WHERE donor_id = ?`,
    [...sets.map((f) => nz(req.body[f])), req.params.id]));
  res.json({ message: 'Donor updated' });
}));

module.exports = router;
