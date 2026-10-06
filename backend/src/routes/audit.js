const router = require('express').Router();
const { query } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap } = require('../middleware/errors');
const { toInt } = require('./util');

router.get('/', allow('ADMIN'), wrap(async (req, res) => {
  const { table_name, action, username, record_id } = req.query;
  const limit = Math.min(toInt(req.query.limit, 50), 200);
  const offset = toInt(req.query.offset, 0);
  const where = [];
  const params = [];
  if (table_name) { where.push('a.table_name = ?'); params.push(table_name); }
  if (action) { where.push('a.action = ?'); params.push(action); }
  if (record_id) { where.push('a.record_id = ?'); params.push(record_id); }
  if (username) { where.push('u.username = ?'); params.push(username); }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await query(`SELECT a.*, u.username, u.role FROM audit_log a LEFT JOIN \`user\` u ON u.user_id = a.user_id
                             ${clause} ORDER BY a.audit_id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM audit_log a LEFT JOIN \`user\` u ON u.user_id = a.user_id ${clause}`, params);
  res.json({ rows, total, limit, offset });
}));

module.exports = router;
