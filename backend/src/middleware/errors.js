// Translate MySQL errors into clear API responses.
const FRIENDLY = {
  uq_user_username: 'That username is already taken',
  uq_donor_identity: 'A donor with the same name, date of birth and phone already exists',
  uq_patient_identity: 'A patient with the same name, date of birth and phone already exists',
  uq_donor_email: 'That e-mail is already used by another donor',
  uq_patient_email: 'That e-mail is already used by another patient',
  uq_hospital_regno: 'A hospital with that registration number already exists',
  uq_hospital_email: 'A hospital with that e-mail already exists',
  uq_doctor_regno: 'A doctor with that medical registration number already exists',
  uq_doctor_email: 'That e-mail is already used by another doctor',
  uq_storage_code: 'That storage location code already exists',
  uq_sample_slot: 'That storage position is already occupied',
  uq_consent_natural: 'This consent type was already recorded for the donor on that date',
  uq_test_natural: 'That test was already recorded at the same time',
  uq_transplant_request: 'This request already has a transplant',
  chk_user_username_len: 'Username must be at least 4 characters',
  chk_donor_reg_after_dob: 'Registration date cannot be before the date of birth',
  chk_patient_reg_after_dob: 'Registration date cannot be before the date of birth',
  chk_donor_hla_complete: 'Enter all six HLA alleles, or leave all of them empty',
  chk_patient_hla_complete: 'Enter all six HLA alleles, or leave all of them empty',
  chk_hospital_pincode: 'Pincode must be 6 digits and cannot start with 0',
  chk_storage_capacity: 'Capacity must be greater than zero',
  chk_sample_volume: 'Volume must be greater than zero',
  chk_sample_expiry: 'Expiry date must be after the collection date',
  chk_consent_valid: 'Valid-until date must be after the consent date',
  chk_request_min_hla: 'Minimum HLA match must be between 0 and 6',
  chk_test_result_required: 'Enter a result when the test is not pending',
  chk_rs_score: 'HLA score must be between 0 and 6',
};

function constraintName(message = '') {
  const m = message.match(/(?:constraint|key) '(?:[\w]+\.)?([\w]+)'/i);
  return m ? m[1] : null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const name = constraintName(err.sqlMessage || err.message);
  const known = name && FRIENDLY[name];

  if (err.sqlState === '45000') return res.status(400).json({ error: err.sqlMessage }); // SIGNAL from triggers/procedures
  switch (err.errno) {
    case 3819: return res.status(400).json({ error: known || `Value rejected by rule ${name}` });
    case 1062: return res.status(409).json({ error: known || 'That value already exists' });
    case 1451: return res.status(409).json({ error: 'This record is still referenced by other records and cannot be removed' });
    case 1452: return res.status(400).json({ error: 'A referenced record does not exist' });
    case 1048:
    case 1364: return res.status(400).json({ error: 'A required field is missing' });
    case 1292:
    case 1366: return res.status(400).json({ error: 'One of the values has the wrong format' });
    case 1142:
    case 1143:
    case 1370: return res.status(403).json({ error: 'The database account used by the API lacks permission for this action' });
    default: break;
  }
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Check the API console.' });
}

/** wrap async route handlers so thrown errors reach errorHandler */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = { errorHandler, wrap, httpError };
