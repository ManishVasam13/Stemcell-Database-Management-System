-- =====================================================================
--  StemVault – 07_security.sql
--  Database-level authorization: roles, least-privilege grants,
--  column-level privileges and row-level "my data" views.
--  Run as root (or any account with CREATE ROLE / CREATE USER / GRANT).
-- =====================================================================
USE stemvault;

-- ---------------------------------------------------------------------
-- Row-level security views
-- MySQL has no row-level security, so these views filter by the MySQL
-- account that is connected: USER() returns 'username@host' of the
-- session, and the part before '@' must equal user.username.
-- (SQL SECURITY DEFINER: the caller needs no rights on the base tables.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE SQL SECURITY DEFINER VIEW v_my_donor_samples AS
SELECT s.sample_id, s.sample_type, s.collection_date, s.processing_status,
       s.availability_status, s.expiry_date
  FROM stem_cell_sample s
  JOIN donor d  ON d.donor_id = s.donor_id
  JOIN `user` u ON u.user_id  = d.user_id
 WHERE u.username = SUBSTRING_INDEX(USER(), '@', 1);

CREATE OR REPLACE SQL SECURITY DEFINER VIEW v_my_donor_consents AS
SELECT c.consent_id, c.consent_type, c.consent_date, c.valid_until, c.revoked_on, c.status
  FROM consent c
  JOIN donor d  ON d.donor_id = c.donor_id
  JOIN `user` u ON u.user_id  = d.user_id
 WHERE u.username = SUBSTRING_INDEX(USER(), '@', 1);

CREATE OR REPLACE SQL SECURITY DEFINER VIEW v_my_patient_requests AS
SELECT r.request_id, r.request_date, r.required_sample_type, r.urgency, r.request_status,
       doc.full_name AS doctor_name, h.hospital_name,
       t.transplant_date, t.transplant_status, t.outcome
  FROM transplant_request r
  JOIN patient p  ON p.patient_id  = r.patient_id
  JOIN `user` u   ON u.user_id     = p.user_id
  JOIN doctor doc ON doc.doctor_id = r.doctor_id
  JOIN hospital h ON h.hospital_id = doc.hospital_id
  LEFT JOIN transplant t ON t.request_id = r.request_id
 WHERE u.username = SUBSTRING_INDEX(USER(), '@', 1);

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
DROP ROLE IF EXISTS sv_admin, sv_bank_staff, sv_doctor, sv_donor, sv_patient, sv_app;
CREATE ROLE sv_admin, sv_bank_staff, sv_doctor, sv_donor, sv_patient, sv_app;

-- ADMIN: full data access; audit_log is protected by its triggers
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON stemvault.* TO sv_admin;

-- BANK_STAFF: donors, consents, samples, tests, storage; reviews requests
GRANT SELECT ON stemvault.hospital           TO sv_bank_staff;
GRANT SELECT ON stemvault.doctor             TO sv_bank_staff;
GRANT SELECT ON stemvault.patient            TO sv_bank_staff;
GRANT SELECT ON stemvault.request_sample     TO sv_bank_staff;
GRANT SELECT ON stemvault.transplant         TO sv_bank_staff;
GRANT SELECT, INSERT, UPDATE ON stemvault.donor            TO sv_bank_staff;
GRANT SELECT, INSERT, UPDATE ON stemvault.consent          TO sv_bank_staff;
GRANT SELECT, INSERT, UPDATE ON stemvault.stem_cell_sample TO sv_bank_staff;
GRANT SELECT, INSERT, UPDATE ON stemvault.sample_test      TO sv_bank_staff;
GRANT SELECT, INSERT, UPDATE ON stemvault.storage_location TO sv_bank_staff;
-- column-level privilege: staff may only change the review columns of a request
GRANT SELECT, UPDATE (request_status, reviewed_by, reviewed_at, review_remarks)
      ON stemvault.transplant_request TO sv_bank_staff;
GRANT SELECT ON stemvault.v_available_samples      TO sv_bank_staff;
GRANT SELECT ON stemvault.v_sample_testing_status  TO sv_bank_staff;
GRANT SELECT ON stemvault.v_storage_occupancy      TO sv_bank_staff;
GRANT SELECT ON stemvault.v_donor_consent_status   TO sv_bank_staff;
GRANT SELECT ON stemvault.v_patient_requests       TO sv_bank_staff;
GRANT SELECT ON stemvault.v_request_candidates     TO sv_bank_staff;
GRANT EXECUTE ON PROCEDURE stemvault.sp_register_donor          TO sv_bank_staff;
GRANT EXECUTE ON PROCEDURE stemvault.sp_register_sample         TO sv_bank_staff;
GRANT EXECUTE ON PROCEDURE stemvault.sp_record_test_result      TO sv_bank_staff;
GRANT EXECUTE ON PROCEDURE stemvault.sp_release_sample          TO sv_bank_staff;
GRANT EXECUTE ON PROCEDURE stemvault.sp_revoke_consent          TO sv_bank_staff;
GRANT EXECUTE ON PROCEDURE stemvault.sp_review_request          TO sv_bank_staff;
GRANT EXECUTE ON PROCEDURE stemvault.sp_find_candidates         TO sv_bank_staff;
GRANT EXECUTE ON PROCEDURE stemvault.sp_allocate_sample         TO sv_bank_staff;
GRANT EXECUTE ON PROCEDURE stemvault.sp_release_allocation      TO sv_bank_staff;
GRANT EXECUTE ON PROCEDURE stemvault.sp_expiring_samples_report TO sv_bank_staff;

-- DOCTOR: patients and requests; sees samples only through the anonymized view
GRANT SELECT ON stemvault.hospital TO sv_doctor;
GRANT SELECT ON stemvault.doctor   TO sv_doctor;
GRANT SELECT, INSERT, UPDATE ON stemvault.patient TO sv_doctor;
GRANT SELECT ON stemvault.v_available_samples  TO sv_doctor;
GRANT SELECT ON stemvault.v_patient_requests   TO sv_doctor;
GRANT SELECT ON stemvault.v_request_candidates TO sv_doctor;
GRANT SELECT ON stemvault.v_transplant_summary TO sv_doctor;
GRANT SELECT ON stemvault.v_hospital_requests  TO sv_doctor;
GRANT EXECUTE ON PROCEDURE stemvault.sp_register_patient    TO sv_doctor;
GRANT EXECUTE ON PROCEDURE stemvault.sp_submit_request      TO sv_doctor;
GRANT EXECUTE ON PROCEDURE stemvault.sp_find_candidates     TO sv_doctor;
GRANT EXECUTE ON PROCEDURE stemvault.sp_schedule_transplant TO sv_doctor;
GRANT EXECUTE ON PROCEDURE stemvault.sp_complete_transplant TO sv_doctor;
GRANT EXECUTE ON PROCEDURE stemvault.sp_cancel_transplant   TO sv_doctor;
GRANT EXECUTE ON PROCEDURE stemvault.sp_cancel_request      TO sv_doctor;

-- DONOR and PATIENT: only their own rows, through the views above
GRANT SELECT ON stemvault.v_my_donor_samples    TO sv_donor;
GRANT SELECT ON stemvault.v_my_donor_consents   TO sv_donor;
GRANT SELECT ON stemvault.v_my_patient_requests TO sv_patient;

-- APPLICATION account used by the Node.js backend (least privilege):
-- no DROP/ALTER, audit_log is insert/select only, deletes only where the
-- workflow needs them.
GRANT SELECT, INSERT, UPDATE ON stemvault.`user`             TO sv_app;
GRANT SELECT, INSERT, UPDATE ON stemvault.donor              TO sv_app;
GRANT SELECT, INSERT, UPDATE ON stemvault.patient            TO sv_app;
GRANT SELECT, INSERT, UPDATE ON stemvault.hospital           TO sv_app;
GRANT SELECT, INSERT, UPDATE ON stemvault.doctor             TO sv_app;
GRANT SELECT, INSERT, UPDATE ON stemvault.storage_location   TO sv_app;
GRANT SELECT, INSERT, UPDATE ON stemvault.stem_cell_sample   TO sv_app;
GRANT SELECT, INSERT, UPDATE ON stemvault.sample_test        TO sv_app;
GRANT SELECT, INSERT, UPDATE ON stemvault.consent            TO sv_app;
GRANT SELECT, INSERT, UPDATE ON stemvault.transplant_request TO sv_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON stemvault.request_sample TO sv_app;
GRANT SELECT, INSERT, UPDATE ON stemvault.transplant         TO sv_app;
GRANT SELECT, INSERT         ON stemvault.audit_log          TO sv_app;
GRANT SELECT ON stemvault.v_available_samples     TO sv_app;
GRANT SELECT ON stemvault.v_patient_requests      TO sv_app;
GRANT SELECT ON stemvault.v_hospital_requests     TO sv_app;
GRANT SELECT ON stemvault.v_sample_testing_status TO sv_app;
GRANT SELECT ON stemvault.v_storage_occupancy     TO sv_app;
GRANT SELECT ON stemvault.v_donor_consent_status  TO sv_app;
GRANT SELECT ON stemvault.v_transplant_summary    TO sv_app;
GRANT SELECT ON stemvault.v_request_candidates    TO sv_app;
GRANT EXECUTE ON stemvault.* TO sv_app;
-- temporary tables used inside sp_find_candidates / sp_expiring_samples_report
GRANT CREATE TEMPORARY TABLES ON stemvault.* TO sv_app;

-- ---------------------------------------------------------------------
-- Accounts (demo). Change these passwords outside a classroom.
-- MySQL account names match app usernames so the row-level views work.
-- ---------------------------------------------------------------------
DROP USER IF EXISTS 'stemvault_app'@'localhost', 'staff.kavya'@'localhost', 'dr.ananya'@'localhost',
                    'donor.karthik'@'localhost', 'patient.meena'@'localhost', 'sv_admin_user'@'localhost';

CREATE USER 'stemvault_app'@'localhost' IDENTIFIED BY 'StemVault@App123';
CREATE USER 'sv_admin_user'@'localhost' IDENTIFIED BY 'StemVault@123';
CREATE USER 'staff.kavya'@'localhost'   IDENTIFIED BY 'StemVault@123';
CREATE USER 'dr.ananya'@'localhost'     IDENTIFIED BY 'StemVault@123';
CREATE USER 'donor.karthik'@'localhost' IDENTIFIED BY 'StemVault@123';
CREATE USER 'patient.meena'@'localhost' IDENTIFIED BY 'StemVault@123';

GRANT sv_app        TO 'stemvault_app'@'localhost';
GRANT sv_admin      TO 'sv_admin_user'@'localhost';
GRANT sv_bank_staff TO 'staff.kavya'@'localhost';
GRANT sv_doctor     TO 'dr.ananya'@'localhost';
GRANT sv_donor      TO 'donor.karthik'@'localhost';
GRANT sv_patient    TO 'patient.meena'@'localhost';

SET DEFAULT ROLE ALL TO 'stemvault_app'@'localhost', 'sv_admin_user'@'localhost', 'staff.kavya'@'localhost',
                        'dr.ananya'@'localhost', 'donor.karthik'@'localhost', 'patient.meena'@'localhost';

-- Try it:
--   mysql -u donor.karthik -p   ->  SELECT * FROM stemvault.v_my_donor_samples;   (only his units)
--   mysql -u dr.ananya -p       ->  SELECT * FROM stemvault.donor;                 (ERROR 1142: denied)
--   SHOW GRANTS FOR 'staff.kavya'@'localhost' USING sv_bank_staff;
