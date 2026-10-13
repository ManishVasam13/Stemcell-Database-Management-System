const router = require('express').Router();
const { query } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');

router.get('/donor', allow('DONOR'), wrap(async (req, res) => {
  const [donor] = await query(`SELECT donor_id, full_name, blood_group, gender, date_of_birth, fn_age(date_of_birth) AS age,
                                      phone, email, registration_date, status, (hla_a_1 IS NOT NULL) AS hla_typed
                                 FROM donor WHERE donor_id = ?`, [req.user.donorId]);
  if (!donor) throw httpError(404, 'No donor profile is linked to this account');
  // donors see what happened to their units, never who received them
  const samples = await query(`SELECT sample_id, sample_type, collection_date, processing_status, availability_status, expiry_date
                                 FROM stem_cell_sample WHERE donor_id = ? ORDER BY collection_date DESC`, [req.user.donorId]);
  const consents = await query('SELECT * FROM consent WHERE donor_id = ? ORDER BY consent_date DESC, consent_id DESC', [req.user.donorId]);
  res.json({ donor, samples, consents });
}));

router.get('/patient', allow('PATIENT'), wrap(async (req, res) => {
  const [patient] = await query(`SELECT patient_id, full_name, blood_group, gender, fn_age(date_of_birth) AS age, diagnosis,
                                        registration_date, status, (hla_a_1 IS NOT NULL) AS hla_typed
                                   FROM patient WHERE patient_id = ?`, [req.user.patientId]);
  if (!patient) throw httpError(404, 'No patient profile is linked to this account');
  const requests = await query(`SELECT request_id, request_date, required_sample_type, urgency, request_status, reviewed_at,
                                       doctor_name, hospital_name, district, state, allocated_sample_id IS NOT NULL AS unit_found,
                                       transplant_date, transplant_status, outcome
                                  FROM v_patient_requests WHERE patient_id = ? ORDER BY request_date DESC`, [req.user.patientId]);
  res.json({ patient, requests });
}));

module.exports = router;
