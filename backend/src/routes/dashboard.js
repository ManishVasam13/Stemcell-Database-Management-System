const router = require('express').Router();
const { query } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap } = require('../middleware/errors');

router.get('/', allow('ADMIN', 'BANK_STAFF', 'DOCTOR'), wrap(async (req, res) => {
  const isDoctor = req.user.role === 'DOCTOR';
  const reqFilter = isDoctor ? 'WHERE doctor_id = ?' : '';
  const reqParams = isDoctor ? [req.user.doctorId] : [];

  const [kpi] = await query(`
    SELECT fn_count_available_samples(NULL)                                    AS available_samples,
           (SELECT COUNT(*) FROM donor WHERE status = 'ACTIVE')                AS active_donors,
           (SELECT COUNT(*) FROM patient WHERE status = 'ACTIVE')              AS active_patients,
           (SELECT COUNT(*) FROM hospital WHERE status = 'ACTIVE')             AS active_hospitals,
           (SELECT COUNT(*) FROM v_available_samples WHERE days_to_expiry BETWEEN 0 AND 60) AS expiring_60d,
           (SELECT COUNT(*) FROM stem_cell_sample WHERE processing_status IN ('COLLECTED','PROCESSING','QUARANTINE')) AS in_testing,
           (SELECT ROUND(100 * SUM(used_slots) / SUM(capacity), 1) FROM v_storage_occupancy
             WHERE current_status = 'OPERATIONAL')                              AS storage_used_pct`);

  const byType = await query(`SELECT sample_type, COUNT(*) AS units FROM v_available_samples GROUP BY sample_type ORDER BY sample_type`);
  const byState = await query(`SELECT state, COUNT(*) AS units FROM v_available_samples GROUP BY state ORDER BY units DESC`);
  const byStatus = await query(`SELECT request_status, COUNT(*) AS n FROM transplant_request ${reqFilter} GROUP BY request_status`, reqParams);
  const outcomes = await query(`SELECT outcome, COUNT(*) AS n FROM v_transplant_summary
                                 WHERE transplant_status = 'COMPLETED' ${isDoctor ? 'AND doctor_id = ?' : ''} GROUP BY outcome`, reqParams);
  const queue = await query(`
    SELECT request_id, patient_name, hospital_name, district, state, required_sample_type, urgency, request_status, request_date
      FROM v_patient_requests
     WHERE request_status IN ('PENDING','APPROVED','ALLOCATED') ${isDoctor ? 'AND doctor_id = ?' : ''}
     ORDER BY FIELD(urgency, 'CRITICAL','URGENT','ROUTINE'), request_date LIMIT 8`, reqParams);
  const expiring = isDoctor ? [] : await query(`
    SELECT sample_id, sample_type, hospital_name, state, expiry_date, days_to_expiry
      FROM v_available_samples WHERE days_to_expiry BETWEEN 0 AND 60 ORDER BY days_to_expiry LIMIT 6`);
  const activity = req.user.role === 'DOCTOR' ? [] : await query(`
    SELECT a.audit_id, a.action, a.table_name, a.record_id, a.action_time, u.username
      FROM audit_log a LEFT JOIN \`user\` u ON u.user_id = a.user_id
     ORDER BY a.audit_id DESC LIMIT 8`);

  res.json({ kpi, byType, byState, byStatus, outcomes, queue, expiring, activity });
}));

module.exports = router;
