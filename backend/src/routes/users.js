const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');

router.get('/', allow('ADMIN'), wrap(async (req, res) => {
  const { role, q } = req.query;
  const where = [];
  const params = [];
  if (role) { where.push('u.role = ?'); params.push(role); }
  if (q) { where.push('u.username LIKE ?'); params.push(`%${q}%`); }
  // LEFT JOINs: an account may or may not have a profile behind it
  const rows = await query(`
    SELECT u.user_id, u.username, u.role, u.status, u.created_at,
           COALESCE(d.full_name, p.full_name, doc.full_name) AS linked_name
      FROM \`user\` u
      LEFT JOIN donor d    ON d.user_id = u.user_id
      LEFT JOIN patient p  ON p.user_id = u.user_id
      LEFT JOIN doctor doc ON doc.user_id = u.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY FIELD(u.role, 'ADMIN','BANK_STAFF','DOCTOR','DONOR','PATIENT'), u.username`, params);
  res.json(rows);
}));

router.post('/', allow('ADMIN'), wrap(async (req, res) => {
  const { username, password, role } = req.body;
  if (!['ADMIN', 'BANK_STAFF'].includes(role)) throw httpError(400, 'Create doctors, donors and patients from their own pages');
  if (!password || password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
  const r = await query('INSERT INTO `user` (username, password_hash, role) VALUES (?,?,?)', [username, await bcrypt.hash(password, 10), role]);
  res.status(201).json({ user_id: r.insertId, message: 'Account created' });
}));

router.patch('/:id/status', allow('ADMIN'), wrap(async (req, res) => {
  if (Number(req.params.id) === req.user.id) throw httpError(400, 'You cannot change the status of your own account');
  await query('UPDATE `user` SET status = ? WHERE user_id = ?', [req.body.status, req.params.id]);
  res.json({ message: 'Account status updated' });
}));

module.exports = router;
