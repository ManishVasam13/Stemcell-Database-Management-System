const router = require('express').Router();
const { query, withUser } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const { nz } = require('./util');

async function ownCheck(user, requestId) {
  if (user.role !== 'DOCTOR') return;
  const [r] = await query('SELECT doctor_id FROM transplant_request WHERE request_id = ?', [requestId]);
  if (!r) throw httpError(404, 'Request not found');
  if (r.doctor_id !== user.doctorId) throw httpError(403, 'This transplant belongs to another doctor');
}

async function requestOf(transplantId) {
  const [t] = await query('SELECT request_id FROM transplant WHERE transplant_id = ?', [transplantId]);
  if (!t) throw httpError(404, 'Transplant not found');
  return t.request_id;
}

router.get('/', allow('ADMIN', 'BANK_STAFF', 'DOCTOR', 'PATIENT'), wrap(async (req, res) => {
  const where = [];
  const params = [];
  if (req.user.role === 'DOCTOR') { where.push('doctor_id = ?'); params.push(req.user.doctorId); }
  if (req.user.role === 'PATIENT') { where.push('patient_id = ?'); params.push(req.user.patientId); }
  if (req.query.status) { where.push('transplant_status = ?'); params.push(req.query.status); }
  res.json(await query(`SELECT * FROM v_transplant_summary ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                        ORDER BY FIELD(transplant_status,'SCHEDULED','COMPLETED','CANCELLED'), transplant_date DESC`, params));
}));

router.post('/', allow('ADMIN', 'BANK_STAFF', 'DOCTOR'), wrap(async (req, res) => {
  const { request_id, transplant_date, remarks } = req.body;
  await ownCheck(req.user, request_id);
  const id = await withUser(req.user.id, async (c) => {
    await c.query('CALL sp_schedule_transplant(?,?,?, @transplant_id)', [request_id, transplant_date, nz(remarks)]);
    const [[row]] = await c.query('SELECT @transplant_id AS id');
    return row.id;
  });
  res.status(201).json({ transplant_id: id, message: 'Transplant scheduled' });
}));

router.post('/:id/complete', allow('ADMIN', 'DOCTOR'), wrap(async (req, res) => {
  await ownCheck(req.user, await requestOf(req.params.id));
  await withUser(req.user.id, (c) => c.query('CALL sp_complete_transplant(?,?,?)', [req.params.id, nz(req.body.outcome), nz(req.body.remarks)]));
  res.json({ message: 'Transplant record updated' });
}));

router.post('/:id/cancel', allow('ADMIN', 'BANK_STAFF', 'DOCTOR'), wrap(async (req, res) => {
  await ownCheck(req.user, await requestOf(req.params.id));
  await withUser(req.user.id, (c) => c.query('CALL sp_cancel_transplant(?,?)', [req.params.id, nz(req.body.remarks)]));
  res.json({ message: 'Transplant cancelled; the sample stays allocated until released' });
}));

module.exports = router;
