const router = require('express').Router();
const { query, withUser, resultSets } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap } = require('../middleware/errors');
const { toInt } = require('./util');

router.get('/expiring', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const out = await withUser(req.user.id, (c) => c.query('CALL sp_expiring_samples_report(?)', [toInt(req.query.days, 60)]));
  res.json(resultSets(out[0])[0] || []);
}));

router.get('/hospitals', allow('ADMIN', 'BANK_STAFF', 'DOCTOR'), wrap(async (req, res) => {
  res.json(await query('SELECT * FROM v_hospital_requests ORDER BY total_requests DESC, hospital_name'));
}));

router.get('/testing', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  res.json(await query(`SELECT * FROM v_sample_testing_status
                         WHERE pending_tests > 0 OR processing_status IN ('COLLECTED','PROCESSING','QUARANTINE')
                         ORDER BY collection_date`));
}));

router.post('/maintenance', allow('ADMIN'), wrap(async (req, res) => {
  const out = await withUser(req.user.id, (c) => c.query('CALL sp_daily_maintenance(1)'));
  const [rows] = resultSets(out[0]);
  res.json({ ...(rows && rows[0]), message: 'Maintenance run finished' });
}));

module.exports = router;
