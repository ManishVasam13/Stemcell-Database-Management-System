const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query, withUser } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const { nz, hlaValues } = require('./util');

router.get('/', allow('ADMIN', 'BANK_STAFF', 'DOCTOR'), wrap(async (req, res) => {
  const { q, status, blood_group } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('(p.full_name LIKE ? OR p.diagnosis LIKE ? OR p.patient_id = ?)'); params.push(`${q}%`, `%${q}%`, Number(q) || 0); }
  if (status) { where.push('p.status = ?'); params.push(status); }
  if (blood_group) { where.push('p.blood_group = ?'); params.push(blood_group); }
  const rows = await query(`
    SELECT p.patient_id, p.full_name, p.gender, p.blood_group, fn_age(p.date_of_birth) AS age, p.diagnosis,
           p.phone, p.registration_date, p.status, (p.hla_a_1 IS NOT NULL) AS hla_typed,
           (SELECT r.request_status FROM transplant_request r WHERE r.patient_id = p.patient_id
             ORDER BY r.request_date DESC LIMIT 1) AS latest_request_status,
           (SELECT r.request_id FROM transplant_request r WHERE r.patient_id = p.patient_id
             AND r.request_status IN ('PENDING','APPROVED','ALLOCATED') LIMIT 1) AS open_request_id
      FROM patient p
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY p.registration_date DESC, p.patient_id DESC`, params);
  res.json(rows);
}));

router.get('/:id', allow('ADMIN', 'BANK_STAFF', 'DOCTOR'), wrap(async (req, res) => {
  const [patient] = await query(`SELECT p.*, fn_age(p.date_of_birth) AS age, u.username
                                   FROM patient p LEFT JOIN \`user\` u ON u.user_id = p.user_id WHERE p.patient_id = ?`, [req.params.id]);
  if (!patient) throw httpError(404, 'Patient not found');
  const requests = await query('SELECT * FROM v_patient_requests WHERE patient_id = ? ORDER BY request_date DESC', [req.params.id]);
  res.json({ ...patient, requests });
}));

router.post('/', allow('ADMIN', 'DOCTOR'), wrap(async (req, res) => {
  const b = req.body;
  const hash = b.username ? await bcrypt.hash(b.password || 'StemVault@123', 10) : null;
  const patientId = await withUser(req.user.id, async (c) => {
    await c.query('CALL sp_register_patient(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, @patient_id)',
      [b.full_name, b.date_of_birth, b.gender, b.blood_group, b.diagnosis, b.phone, nz(b.email), nz(b.address),
        ...hlaValues(b), nz(b.username), hash]);
    const [[row]] = await c.query('SELECT @patient_id AS id');
    return row.id;
  });
  res.status(201).json({ patient_id: patientId, message: 'Patient registered' });
}));

router.put('/:id', allow('ADMIN', 'DOCTOR'), wrap(async (req, res) => {
  const fields = ['full_name', 'date_of_birth', 'gender', 'blood_group', 'diagnosis', 'phone', 'email', 'address', 'status',
    'hla_a_1', 'hla_a_2', 'hla_b_1', 'hla_b_2', 'hla_drb1_1', 'hla_drb1_2'];
  const sets = fields.filter((f) => req.body[f] !== undefined);
  if (!sets.length) throw httpError(400, 'Nothing to update');
  await withUser(req.user.id, (c) => c.query(
    `UPDATE patient SET ${sets.map((f) => `${f} = ?`).join(', ')} WHERE patient_id = ?`,
    [...sets.map((f) => nz(req.body[f])), req.params.id]));
  res.json({ message: 'Patient updated' });
}));

module.exports = router;
