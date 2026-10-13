const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');

async function profileFor(user) {
  const p = { id: user.user_id, username: user.username, role: user.role };
  if (user.role === 'DOCTOR') {
    const [d] = await query(
      `SELECT d.doctor_id, d.full_name, d.hospital_id, h.hospital_name, h.district, h.state
         FROM doctor d JOIN hospital h ON h.hospital_id = d.hospital_id WHERE d.user_id = ?`, [user.user_id]);
    if (d) Object.assign(p, { doctorId: d.doctor_id, name: d.full_name, hospitalId: d.hospital_id,
      hospitalName: d.hospital_name, district: d.district, state: d.state });
  } else if (user.role === 'DONOR') {
    const [d] = await query('SELECT donor_id, full_name FROM donor WHERE user_id = ?', [user.user_id]);
    if (d) Object.assign(p, { donorId: d.donor_id, name: d.full_name });
  } else if (user.role === 'PATIENT') {
    const [x] = await query('SELECT patient_id, full_name FROM patient WHERE user_id = ?', [user.user_id]);
    if (x) Object.assign(p, { patientId: x.patient_id, name: x.full_name });
  }
  return p;
}

router.post('/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw httpError(400, 'Enter your username and password');
  const [user] = await query('SELECT * FROM `user` WHERE username = ?', [username]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw httpError(401, 'Username or password is incorrect');
  }
  if (user.status !== 'ACTIVE') throw httpError(403, `This account is ${user.status.toLowerCase()}. Contact the administrator.`);
  const profile = await profileFor(user);
  const token = jwt.sign(profile, process.env.JWT_SECRET || 'dev-secret', { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
  res.json({ token, user: profile });
}));

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

router.post('/change-password', authenticate, wrap(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 8) throw httpError(400, 'New password must be at least 8 characters');
  const [user] = await query('SELECT password_hash FROM `user` WHERE user_id = ?', [req.user.id]);
  if (!user || !(await bcrypt.compare(current_password || '', user.password_hash))) throw httpError(400, 'Current password is incorrect');
  await query('UPDATE `user` SET password_hash = ? WHERE user_id = ?', [await bcrypt.hash(new_password, 10), req.user.id]);
  res.json({ message: 'Password changed' });
}));

module.exports = router;
