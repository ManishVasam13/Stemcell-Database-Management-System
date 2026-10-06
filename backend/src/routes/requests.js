const router = require('express').Router();
const { query, withUser, resultSets } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const { nz } = require('./util');

async function loadRequest(id, user) {
  const [r] = await query('SELECT * FROM v_patient_requests WHERE request_id = ?', [id]);
  if (!r) throw httpError(404, 'Request not found');
  if (user.role === 'DOCTOR' && r.doctor_id !== user.doctorId) throw httpError(403, 'This request belongs to another doctor');
  if (user.role === 'PATIENT' && r.patient_id !== user.patientId) throw httpError(403, 'This request belongs to another patient');
  return r;
}

router.get('/', allow('ADMIN', 'BANK_STAFF', 'DOCTOR', 'PATIENT'), wrap(async (req, res) => {
  const { status, urgency, q } = req.query;
  const where = [];
  const params = [];
  if (req.user.role === 'DOCTOR') { where.push('doctor_id = ?'); params.push(req.user.doctorId); }
  if (req.user.role === 'PATIENT') { where.push('patient_id = ?'); params.push(req.user.patientId); }
  if (status) { where.push('request_status = ?'); params.push(status); }
  if (urgency) { where.push('urgency = ?'); params.push(urgency); }
  if (q) { where.push('(patient_name LIKE ? OR hospital_name LIKE ? OR request_id = ?)'); params.push(`${q}%`, `%${q}%`, Number(q) || 0); }
  res.json(await query(`SELECT * FROM v_patient_requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                        ORDER BY FIELD(request_status,'PENDING','APPROVED','ALLOCATED','COMPLETED','REJECTED','CANCELLED'),
                                 FIELD(urgency,'CRITICAL','URGENT','ROUTINE'), request_date DESC`, params));
}));

router.get('/:id', allow('ADMIN', 'BANK_STAFF', 'DOCTOR', 'PATIENT'), wrap(async (req, res) => {
  const r = await loadRequest(req.params.id, req.user);
  const [patient] = await query(`SELECT patient_id, full_name, blood_group, fn_age(date_of_birth) AS age, gender, diagnosis,
                                        hla_a_1, hla_a_2, hla_b_1, hla_b_2, hla_drb1_1, hla_drb1_2
                                   FROM patient WHERE patient_id = ?`, [r.patient_id]);
  const candidates = req.user.role === 'PATIENT' ? [] : await query(
    `SELECT * FROM v_request_candidates WHERE request_id = ?
      ORDER BY FIELD(selection_status,'ALLOCATED','CANDIDATE','RELEASED','REJECTED'), hla_match_score DESC`, [req.params.id]);
  const history = req.user.role === 'PATIENT' ? [] : await query(
    `SELECT a.action_time, a.action, a.old_value, a.new_value, u.username FROM audit_log a
       LEFT JOIN \`user\` u ON u.user_id = a.user_id
      WHERE a.table_name = 'transplant_request' AND a.record_id = ? ORDER BY a.audit_id`, [String(req.params.id)]);
  res.json({ ...r, patient, candidates, history });
}));

router.post('/', allow('ADMIN', 'DOCTOR'), wrap(async (req, res) => {
  const b = req.body;
  const doctorId = req.user.role === 'DOCTOR' ? req.user.doctorId : b.doctor_id;
  if (!doctorId) throw httpError(400, 'Choose the requesting doctor');
  const id = await withUser(req.user.id, async (c) => {
    await c.query('CALL sp_submit_request(?,?,?,?,?, @request_id)',
      [b.patient_id, doctorId, b.required_sample_type, nz(b.min_hla_match), nz(b.urgency)]);
    const [[row]] = await c.query('SELECT @request_id AS id');
    return row.id;
  });
  res.status(201).json({ request_id: id, message: 'Request submitted for review' });
}));

router.post('/:id/review', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const { decision, remarks } = req.body;
  await withUser(req.user.id, (c) => c.query('CALL sp_review_request(?,?,?,?)', [req.params.id, req.user.id, decision, nz(remarks)]));
  res.json({ message: decision === 'APPROVED' ? 'Request approved' : 'Request rejected' });
}));

// tiered search: district -> state -> India
async function search(req, save) {
  const out = await withUser(req.user.id, (c) => c.query('CALL sp_find_candidates(?, ?)', [req.params.id, save ? 1 : 0]));
  const [tiers, candidates] = resultSets(out[0]);
  const selected = (tiers || []).find((t) => t.is_selected_tier === 1);
  return { tiers: tiers || [], candidates: candidates || [], selectedTier: selected ? selected.search_tier : null };
}

router.post('/:id/search', allow('ADMIN', 'BANK_STAFF', 'DOCTOR'), wrap(async (req, res) => {
  await loadRequest(req.params.id, req.user);
  res.json(await search(req, false));
}));

router.post('/:id/shortlist', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const result = await search(req, true);
  res.json({ ...result, message: result.candidates.length ? `${result.candidates.length} candidate(s) shortlisted` : 'No compatible samples to shortlist' });
}));

router.post('/:id/allocate', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  if (!req.body.sample_id) throw httpError(400, 'Choose a sample to allocate');
  await withUser(req.user.id, (c) => c.query('CALL sp_allocate_sample(?, ?)', [req.params.id, req.body.sample_id]));
  res.json({ message: `Sample ${req.body.sample_id} allocated` });
}));

router.post('/:id/release', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  await withUser(req.user.id, (c) => c.query('CALL sp_release_allocation(?)', [req.params.id]));
  res.json({ message: 'Allocation released; the sample is back in the pool' });
}));

router.post('/:id/candidates/:sampleId/reject', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const [r] = await withUser(req.user.id, (c) => c.query(
    "UPDATE request_sample SET selection_status = 'REJECTED' WHERE request_id = ? AND sample_id = ? AND selection_status = 'CANDIDATE'",
    [req.params.id, req.params.sampleId]));
  if (!r.affectedRows) throw httpError(400, 'Only a shortlisted candidate can be removed');
  res.json({ message: 'Candidate removed from the shortlist' });
}));

router.post('/:id/cancel', allow('ADMIN', 'BANK_STAFF', 'DOCTOR'), wrap(async (req, res) => {
  await loadRequest(req.params.id, req.user);
  await withUser(req.user.id, (c) => c.query('CALL sp_cancel_request(?, ?)', [req.params.id, nz(req.body.remarks)]));
  res.json({ message: 'Request cancelled' });
}));

module.exports = router;
