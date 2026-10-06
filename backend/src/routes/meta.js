const router = require('express').Router();
const { query } = require('../config/db');
const { wrap } = require('../middleware/errors');

// states -> districts, built from registered hospitals (drives filters)
router.get('/geo', wrap(async (req, res) => {
  const rows = await query('SELECT DISTINCT state, district FROM hospital ORDER BY state, district');
  const geo = {};
  rows.forEach((r) => { (geo[r.state] = geo[r.state] || []).push(r.district); });
  res.json(geo);
}));

module.exports = router;
