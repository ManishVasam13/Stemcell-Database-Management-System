const router = require('express').Router();
const { query, withUser } = require('../config/db');
const { allow } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const { nz } = require('./util');

router.post('/', allow('ADMIN', 'BANK_STAFF'), wrap(async (req, res) => {
  const b = req.body;
  const [r] = await withUser(req.user.id, (c) => c.query(
    'INSERT INTO consent (donor_id, consent_type, consent_date, valid_until) VALUES (?, ?, COALESCE(?, CURDATE()), ?)',
    [b.donor_id, b.consent_type, nz(b.consent_date), nz(b.valid_until)]));
  res.status(201).json({ consent_id: r.insertId, message: 'Consent recorded' });
}));

// staff/admin can revoke any consent; a donor can revoke only their own
router.post('/:id/revoke', allow('ADMIN', 'BANK_STAFF', 'DONOR'), wrap(async (req, res) => {
  const [consent] = await query('SELECT donor_id FROM consent WHERE consent_id = ?', [req.params.id]);
  if (!consent) throw httpError(404, 'Consent not found');
  if (req.user.role === 'DONOR' && consent.donor_id !== req.user.donorId) throw httpError(403, 'You can only revoke your own consent');
  const reason = nz(req.body.reason) || (req.user.role === 'DONOR' ? 'Revoked by donor' : null);
  await withUser(req.user.id, (c) => c.query('CALL sp_revoke_consent(?, ?)', [req.params.id, reason]));
  res.json({ message: 'Consent revoked' });
}));

module.exports = router;
