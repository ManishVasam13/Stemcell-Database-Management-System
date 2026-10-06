const router = require('express').Router();
const { query, withUser, resultSets } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const { nz } = require('./util');

// full inventory (staff)
router.get('/', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const { availability_status, processing_status, sample_type, state, q } = req.query;
  const where = [];
  const params = [];
  if (availability_status) { where.push('s.availability_status = ?'); params.push(availability_status); }
  if (processing_status) { where.push('s.processing_status = ?'); params.push(processing_status); }
  if (sample_type) { where.push('s.sample_type = ?'); params.push(sample_type); }
  if (state) { where.push('h.state = ?'); params.push(state); }
  if (q) { where.push('(s.sample_id = ? OR l.location_code LIKE ? OR d.full_name LIKE ?)'); params.push(Number(q) || 0, `%${q}%`, `${q}%`); }
  const rows = await query(`
    SELECT s.sample_id, s.donor_id, d.full_name AS donor_name, d.blood_group, s.sample_type, s.collection_date,
           s.volume_ml, s.cd34_count, s.processing_status, s.availability_status, s.expiry_date,
           DATEDIFF(s.expiry_date, CURDATE()) AS days_to_expiry,
           l.location_code, s.storage_position, h.hospital_name, h.district, h.state
      FROM stem_cell_sample s
      JOIN donor d ON d.donor_id = s.donor_id
      LEFT JOIN storage_location l ON l.location_id = s.location_id
      LEFT JOIN hospital h ON h.hospital_id = l.hospital_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY s.sample_id DESC`, params);
  res.json(rows);
}));

// anonymized availability (doctors see this, never donor identity)
router.get('/available', allow('ADMIN', 'BANK_STAFF', 'DOCTOR'), wrap(async (req, res) => {
  const { sample_type, state, district, blood_group } = req.query;
  const where = [];
  const params = [];
  if (sample_type) { where.push('sample_type = ?'); params.push(sample_type); }
  if (state) { where.push('state = ?'); params.push(state); }
  if (district) { where.push('district = ?'); params.push(district); }
  if (blood_group) { where.push('blood_group = ?'); params.push(blood_group); }
  const rows = await query(`SELECT * FROM v_available_samples ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                             ORDER BY state, district, sample_type`, params);
  const summary = await query(`SELECT state, district, sample_type, COUNT(*) AS units FROM v_available_samples
                                GROUP BY state, district, sample_type ORDER BY state, district`);
  res.json({ rows, summary });
}));

router.get('/:id', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const [sample] = await query(`
    SELECT s.*, d.full_name AS donor_name, d.blood_group, d.status AS donor_status,
           l.location_code, l.storage_type, h.hospital_name, h.district, h.state,
           t.total_tests, t.passed_tests, t.failed_tests, t.pending_tests, t.mandatory_tests_passed,
           fn_has_active_consent(s.donor_id, 'STORAGE') AS has_storage_consent,
           fn_has_active_consent(s.donor_id, 'CLINICAL_USE') AS has_clinical_consent
      FROM stem_cell_sample s
      JOIN donor d ON d.donor_id = s.donor_id
      JOIN v_sample_testing_status t ON t.sample_id = s.sample_id
      LEFT JOIN storage_location l ON l.location_id = s.location_id
      LEFT JOIN hospital h ON h.hospital_id = l.hospital_id
     WHERE s.sample_id = ?`, [req.params.id]);
  if (!sample) throw httpError(404, 'Sample not found');
  const tests = await query(`SELECT t.*, u.username AS performed_by_username FROM sample_test t
                               JOIN \`user\` u ON u.user_id = t.performed_by
                              WHERE t.sample_id = ? ORDER BY t.test_date DESC, t.test_id DESC`, [req.params.id]);
  const candidacies = await query(`SELECT rs.*, r.request_status, p.full_name AS patient_name
                                     FROM request_sample rs
                                     JOIN transplant_request r ON r.request_id = rs.request_id
                                     JOIN patient p ON p.patient_id = r.patient_id
                                    WHERE rs.sample_id = ?`, [req.params.id]);
  const history = await query(`SELECT a.action_time, a.action, a.old_value, a.new_value, u.username
                                 FROM audit_log a LEFT JOIN \`user\` u ON u.user_id = a.user_id
                                WHERE a.table_name = 'stem_cell_sample' AND a.record_id = ?
                                ORDER BY a.audit_id DESC`, [String(req.params.id)]);
  res.json({ ...sample, tests, candidacies, history });
}));

// sp_register_sample: sample + five PENDING tests in one transaction
router.post('/', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const b = req.body;
  const id = await withUser(req.user.id, async (c) => {
    await c.query('CALL sp_register_sample(?,?,?,?,?,?, @sample_id)',
      [b.donor_id, b.sample_type, b.collection_date, b.volume_ml, nz(b.expiry_date), req.user.id]);
    const [[row]] = await c.query('SELECT @sample_id AS id');
    return row.id;
  });
  res.status(201).json({ sample_id: id, message: 'Sample registered; five tests are pending' });
}));

// sp_release_sample: locks the storage unit, checks tests/consent/capacity
router.post('/:id/release', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const { location_id, storage_position } = req.body;
  if (!location_id || !storage_position) throw httpError(400, 'Choose a storage unit and enter a position');
  const out = await withUser(req.user.id, (c) => c.query('CALL sp_release_sample(?,?,?)', [req.params.id, location_id, storage_position]));
  const [rows] = resultSets(out[0]);
  res.json({ sample: rows && rows[0], message: rows && rows[0].availability_status === 'AVAILABLE'
    ? 'Sample released and available for matching'
    : 'Sample stored, but not available: donor consent for storage or clinical use is missing' });
}));

router.post('/:id/discard', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const [s] = await query('SELECT availability_status FROM stem_cell_sample WHERE sample_id = ?', [req.params.id]);
  if (!s) throw httpError(404, 'Sample not found');
  await withUser(req.user.id, (c) => (s.availability_status === 'EXPIRED'
    ? c.query("UPDATE stem_cell_sample SET availability_status = 'DISCARDED' WHERE sample_id = ?", [req.params.id])
    : c.query("UPDATE stem_cell_sample SET processing_status = 'REJECTED' WHERE sample_id = ?", [req.params.id])));
  res.json({ message: 'Sample discarded' });
}));

module.exports = router;
