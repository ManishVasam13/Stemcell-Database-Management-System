const router = require('express').Router();
const { withUser } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap } = require('../middleware/errors');
const { nz } = require('./util');

// add a repeat / extra test
router.post('/', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const b = req.body;
  const [r] = await withUser(req.user.id, (c) => c.query(
    `INSERT INTO sample_test (sample_id, test_type, test_date, result, test_status, remarks, performed_by)
     VALUES (?, ?, COALESCE(?, NOW()), ?, COALESCE(?, 'PENDING'), ?, ?)`,
    [b.sample_id, b.test_type, nz(b.test_date), nz(b.result), nz(b.test_status), nz(b.remarks), req.user.id]));
  res.status(201).json({ test_id: r.insertId, message: 'Test recorded' });
}));

// record a result (a FAILED mandatory test rejects the sample via trigger)
router.patch('/:id', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const { test_status, result, remarks } = req.body;
  await withUser(req.user.id, (c) => c.query('CALL sp_record_test_result(?,?,?,?)', [req.params.id, test_status, nz(result), nz(remarks)]));
  res.json({ message: test_status === 'FAILED' ? 'Result saved. The sample was rejected because a mandatory test failed.' : 'Result saved' });
}));

module.exports = router;
