const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query, transaction, withUser } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const { nz } = require('./util');

router.get('/', allow('ADMIN', 'BANK_STAFF', 'DOCTOR'), wrap(async (req, res) => {
  const { q, hospital_id } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('(d.full_name LIKE ? OR d.specialization LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (hospital_id) { where.push('d.hospital_id = ?'); params.push(hospital_id); }
  const rows = await query(`
    SELECT d.*, u.username, u.status AS account_status, h.hospital_name, h.district, h.state,
           (SELECT COUNT(*) FROM transplant_request r WHERE r.doctor_id = d.doctor_id) AS request_count
      FROM doctor d
      JOIN \`user\` u  ON u.user_id = d.user_id
      JOIN hospital h ON h.hospital_id = d.hospital_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY d.full_name`, params);
  res.json(rows);
}));

// user account + doctor profile are created in ONE application-level transaction
router.post('/', allow('ADMIN'), wrap(async (req, res) => {
  const b = req.body;
  if (!b.username || !b.password) throw httpError(400, 'Username and password are required for the doctor login');
  const hash = await bcrypt.hash(b.password, 10);
  const doctorId = await transaction(req.user.id, async (c) => {
    const [u] = await c.query("INSERT INTO `user` (username, password_hash, role) VALUES (?, ?, 'DOCTOR')", [b.username, hash]);
    const [d] = await c.query(
      `INSERT INTO doctor (user_id, hospital_id, full_name, specialization, medical_reg_no, phone, email)
       VALUES (?,?,?,?,?,?,?)`,
      [u.insertId, b.hospital_id, b.full_name, b.specialization, b.medical_reg_no, b.phone, nz(b.email)]);
    return d.insertId;
  });
  res.status(201).json({ doctor_id: doctorId, message: 'Doctor added' });
}));

router.put('/:id', allow('ADMIN'), wrap(async (req, res) => {
  const fields = ['hospital_id', 'full_name', 'specialization', 'medical_reg_no', 'phone', 'email', 'status'];
  const sets = fields.filter((f) => req.body[f] !== undefined);
  if (!sets.length) throw httpError(400, 'Nothing to update');
  await withUser(req.user.id, (c) => c.query(
    `UPDATE doctor SET ${sets.map((f) => `${f} = ?`).join(', ')} WHERE doctor_id = ?`,
    [...sets.map((f) => nz(req.body[f])), req.params.id]));
  res.json({ message: 'Doctor updated' });
}));

module.exports = router;
