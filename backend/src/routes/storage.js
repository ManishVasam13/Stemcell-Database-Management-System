const router = require('express').Router();
const { query, withUser } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');

router.get('/', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  res.json(await query('SELECT * FROM v_storage_occupancy ORDER BY state, district, location_code'));
}));

router.get('/:id/samples', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  res.json(await query(`
    SELECT s.sample_id, s.sample_type, s.storage_position, s.availability_status, s.expiry_date, d.blood_group
      FROM stem_cell_sample s JOIN donor d ON d.donor_id = s.donor_id
     WHERE s.location_id = ? ORDER BY s.storage_position`, [req.params.id]));
}));

router.post('/', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const b = req.body;
  const [r] = await withUser(req.user.id, (c) => c.query(
    'INSERT INTO storage_location (hospital_id, location_code, storage_area, storage_type, capacity) VALUES (?,?,?,?,?)',
    [b.hospital_id, b.location_code, b.storage_area, b.storage_type, b.capacity]));
  res.status(201).json({ location_id: r.insertId, message: 'Storage unit added' });
}));

router.put('/:id', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const fields = ['storage_area', 'storage_type', 'capacity', 'current_status'];
  const sets = fields.filter((f) => req.body[f] !== undefined && req.body[f] !== '');
  if (!sets.length) throw httpError(400, 'Nothing to update');
  if (req.body.capacity !== undefined) {
    const [occ] = await query('SELECT used_slots FROM v_storage_occupancy WHERE location_id = ?', [req.params.id]);
    if (occ && Number(req.body.capacity) < occ.used_slots) throw httpError(400, `Capacity cannot be below the ${occ.used_slots} units already stored`);
  }
  await withUser(req.user.id, (c) => c.query(
    `UPDATE storage_location SET ${sets.map((f) => `${f} = ?`).join(', ')} WHERE location_id = ?`,
    [...sets.map((f) => req.body[f]), req.params.id]));
  res.json({ message: 'Storage unit updated' });
}));

module.exports = router;
