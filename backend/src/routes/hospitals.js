const router = require('express').Router();
const { query, withUser } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const { nz } = require('./util');

const FIELDS = ['hospital_name', 'registration_no', 'address_line', 'city', 'district', 'state', 'pincode', 'phone', 'email', 'registered_on', 'status'];

router.get('/', allow('ADMIN', 'BANK_STAFF', 'DOCTOR'), wrap(async (req, res) => {
  const { q, state, status } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('(h.hospital_name LIKE ? OR h.city LIKE ? OR h.registration_no LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (state) { where.push('h.state = ?'); params.push(state); }
  if (status) { where.push('h.status = ?'); params.push(status); }
  const rows = await query(`
    SELECT h.*, v.doctor_count, v.total_requests, v.active_requests, v.completed_requests,
           (SELECT COUNT(*) FROM storage_location l WHERE l.hospital_id = h.hospital_id) AS storage_units,
           (SELECT COUNT(*) FROM v_available_samples a WHERE a.hospital_id = h.hospital_id) AS available_samples
      FROM hospital h JOIN v_hospital_requests v ON v.hospital_id = h.hospital_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY h.state, h.district, h.hospital_name`, params);
  res.json(rows);
}));

router.get('/:id', allow('ADMIN', 'BANK_STAFF', 'DOCTOR'), wrap(async (req, res) => {
  const [hospital] = await query('SELECT * FROM hospital WHERE hospital_id = ?', [req.params.id]);
  if (!hospital) throw httpError(404, 'Hospital not found');
  const doctors = await query('SELECT doctor_id, full_name, specialization, status FROM doctor WHERE hospital_id = ?', [req.params.id]);
  const storage = await query('SELECT * FROM v_storage_occupancy WHERE hospital_id = ?', [req.params.id]);
  res.json({ ...hospital, doctors, storage });
}));

router.post('/', allow('ADMIN'), wrap(async (req, res) => {
  const b = req.body;
  const result = await withUser(req.user.id, (c) => c.query(
    `INSERT INTO hospital (hospital_name, registration_no, address_line, city, district, state, pincode, phone, email, registered_on)
     VALUES (?,?,?,?,?,?,?,?,?, COALESCE(?, CURDATE()))`,
    [b.hospital_name, b.registration_no, b.address_line, b.city, b.district, b.state, b.pincode, b.phone, b.email, nz(b.registered_on)]));
  res.status(201).json({ hospital_id: result[0].insertId, message: 'Hospital added' });
}));

router.put('/:id', allow('ADMIN'), wrap(async (req, res) => {
  const sets = FIELDS.filter((f) => req.body[f] !== undefined);
  if (!sets.length) throw httpError(400, 'Nothing to update');
  await withUser(req.user.id, (c) => c.query(
    `UPDATE hospital SET ${sets.map((f) => `${f} = ?`).join(', ')} WHERE hospital_id = ?`,
    [...sets.map((f) => nz(req.body[f])), req.params.id]));
  res.json({ message: 'Hospital updated' });
}));

module.exports = router;
