-- =====================================================================
--  StemVault – 08_demo_queries.sql
--  Viva / lab demonstration of every required concept (sections A–M).
--  Run section by section in MySQL Workbench. Statements marked
--  "EXPECTED ERROR" are meant to fail and show a rule being enforced.
-- =====================================================================
USE stemvault;
SET @app_user_id = 2;   -- actions below are audited as staff.kavya

-- =====================================================================
-- A. BASIC SQL: INSERT, SELECT, UPDATE, DELETE
-- =====================================================================
INSERT INTO hospital (hospital_name, registration_no, address_line, city, district, state,
                      pincode, phone, email, registered_on)
VALUES ('Demo Lakeside Hospital', 'TN-HSP-9999', '1 Lake Road', 'Chennai', 'Chennai',
        'Tamil Nadu', '600028', '04400000000', 'demo@lakeside.example.in', CURDATE());

SELECT hospital_id, hospital_name, district, state, status
  FROM hospital WHERE registration_no = 'TN-HSP-9999';

UPDATE hospital SET phone = '04411112222' WHERE registration_no = 'TN-HSP-9999';

DELETE FROM hospital WHERE registration_no = 'TN-HSP-9999';   -- no doctors/storage, so allowed

-- =====================================================================
-- B. FILTERING: WHERE, AND/OR, BETWEEN, IN, LIKE, IS NULL
-- =====================================================================
-- donors aged 25–40 with O or B positive blood
SELECT donor_id, full_name, blood_group, fn_age(date_of_birth) AS age
  FROM donor
 WHERE blood_group IN ('O+', 'B+')
   AND fn_age(date_of_birth) BETWEEN 25 AND 40;

-- donors whose name starts with 'A' or who have no e-mail on file
SELECT donor_id, full_name, email FROM donor
 WHERE full_name LIKE 'A%' OR email IS NULL;

-- cord-blood units with no expiry (cryopreserved indefinitely)
SELECT sample_id, sample_type, collection_date FROM stem_cell_sample
 WHERE sample_type = 'CORD_BLOOD' AND expiry_date IS NULL AND availability_status = 'AVAILABLE';

-- patients not yet HLA-typed
SELECT patient_id, full_name, diagnosis FROM patient WHERE hla_a_1 IS NULL;

-- =====================================================================
-- C. JOINS
-- =====================================================================
-- INNER JOIN: doctors with their hospital
SELECT d.full_name, d.specialization, h.hospital_name, h.state
  FROM doctor d
 INNER JOIN hospital h ON h.hospital_id = d.hospital_id;

-- LEFT JOIN: every hospital, even those with no storage units
SELECT h.hospital_name, l.location_code, l.capacity
  FROM hospital h
  LEFT JOIN storage_location l ON l.hospital_id = h.hospital_id
 ORDER BY h.hospital_name;

-- RIGHT JOIN: every user account and the doctor profile (if any) behind it
SELECT u.username, u.role, d.full_name AS doctor_name
  FROM doctor d
 RIGHT JOIN `user` u ON u.user_id = d.user_id
 WHERE u.role IN ('DOCTOR', 'ADMIN');

-- SELF JOIN: pairs of hospitals in the same district (candidate local partners)
SELECT h1.hospital_name AS hospital_a, h2.hospital_name AS hospital_b, h1.district
  FROM hospital h1
  JOIN hospital h2 ON h1.state = h2.state AND h1.district = h2.district
                  AND h1.hospital_id < h2.hospital_id;

-- SELF JOIN: donors sharing the same HLA-A pair (possible related donors)
SELECT d1.donor_id, d1.full_name, d2.donor_id AS other_donor, d2.full_name AS other_name,
       d1.hla_a_1, d1.hla_a_2
  FROM donor d1
  JOIN donor d2 ON d1.hla_a_1 = d2.hla_a_1 AND d1.hla_a_2 = d2.hla_a_2
               AND d1.donor_id < d2.donor_id
 LIMIT 10;

-- =====================================================================
-- D. AGGREGATION: COUNT, SUM, AVG, MIN, MAX, GROUP BY, HAVING
-- =====================================================================
-- available inventory per state and sample type
SELECT h.state, s.sample_type,
       COUNT(*)              AS units,
       SUM(s.volume_ml)      AS total_volume_ml,
       ROUND(AVG(s.cd34_count), 2) AS avg_cd34,
       MIN(s.collection_date) AS oldest_unit,
       MAX(s.collection_date) AS newest_unit
  FROM stem_cell_sample s
  JOIN storage_location l ON l.location_id = s.location_id
  JOIN hospital h         ON h.hospital_id = l.hospital_id
 WHERE s.availability_status = 'AVAILABLE'
 GROUP BY h.state, s.sample_type
 ORDER BY h.state, s.sample_type;

-- storage units more than 5% full (HAVING filters groups)
SELECT l.location_code, l.capacity, COUNT(s.sample_id) AS used
  FROM storage_location l
  LEFT JOIN stem_cell_sample s ON s.location_id = l.location_id
 GROUP BY l.location_id, l.location_code, l.capacity
HAVING COUNT(s.sample_id) > 0.05 * l.capacity;

-- donors who gave more than one sample
SELECT donor_id, COUNT(*) AS samples FROM stem_cell_sample
 GROUP BY donor_id HAVING COUNT(*) > 1;

-- =====================================================================
-- E. ADVANCED: subqueries, correlated subqueries, EXISTS, NOT EXISTS, UNION
-- =====================================================================
-- subquery: samples larger than the overall average volume
SELECT sample_id, sample_type, volume_ml FROM stem_cell_sample
 WHERE volume_ml > (SELECT AVG(volume_ml) FROM stem_cell_sample);

-- correlated subquery: samples above the average volume OF THEIR OWN TYPE
SELECT s.sample_id, s.sample_type, s.volume_ml
  FROM stem_cell_sample s
 WHERE s.volume_ml > (SELECT AVG(s2.volume_ml) FROM stem_cell_sample s2
                       WHERE s2.sample_type = s.sample_type);

-- EXISTS: donors who have at least one available unit
SELECT d.donor_id, d.full_name FROM donor d
 WHERE EXISTS (SELECT 1 FROM stem_cell_sample s
                WHERE s.donor_id = d.donor_id AND s.availability_status = 'AVAILABLE');

-- NOT EXISTS: approved requests that still have no candidate
SELECT r.request_id, r.required_sample_type, r.urgency FROM transplant_request r
 WHERE r.request_status = 'APPROVED'
   AND NOT EXISTS (SELECT 1 FROM request_sample rs WHERE rs.request_id = r.request_id);

-- UNION: one contact list of everyone who can log in as donor or patient
SELECT 'DONOR' AS person_type, d.full_name, u.username FROM donor d JOIN `user` u ON u.user_id = d.user_id
UNION
SELECT 'PATIENT', p.full_name, u.username FROM patient p JOIN `user` u ON u.user_id = p.user_id
ORDER BY person_type, full_name;

-- =====================================================================
-- F. CONSTRAINTS in action
-- =====================================================================
-- DEFAULT: status, registration_date and created_at are filled automatically
INSERT INTO `user` (username, password_hash, role) VALUES ('demo.default', 'x', 'BANK_STAFF');
SELECT username, status, created_at FROM `user` WHERE username = 'demo.default';
DELETE FROM `user` WHERE username = 'demo.default';

-- EXPECTED ERROR (PRIMARY KEY / UNIQUE): duplicate username
-- INSERT INTO `user` (username, password_hash, role) VALUES ('admin', 'x', 'ADMIN');

-- EXPECTED ERROR (CHECK chk_donor_bg): invalid blood group
-- INSERT INTO donor (full_name, date_of_birth, gender, blood_group, phone) VALUES ('Test', '1990-01-01', 'M', 'C+', '9000000000');

-- EXPECTED ERROR (CHECK chk_hospital_pincode): pincode must be 6 digits
-- UPDATE hospital SET pincode = '12345' WHERE hospital_id = 1;

-- EXPECTED ERROR (FOREIGN KEY): test result for a sample that does not exist
-- INSERT INTO sample_test (sample_id, test_type, test_date, performed_by) VALUES (99999, 'STERILITY', NOW(), 2);

-- EXPECTED ERROR (FOREIGN KEY, ON DELETE RESTRICT): hospital with doctors
-- DELETE FROM hospital WHERE hospital_id = 1;

-- EXPECTED ERROR (NOT NULL): diagnosis is required
-- INSERT INTO patient (full_name, date_of_birth, gender, blood_group, phone) VALUES ('Test', '2000-01-01', 'F', 'O+', '9000000001');

-- =====================================================================
-- G. VIEWS
-- =====================================================================
SELECT * FROM v_available_samples ORDER BY state, district LIMIT 15;
SELECT * FROM v_patient_requests ORDER BY FIELD(urgency, 'CRITICAL', 'URGENT', 'ROUTINE'), request_date;
SELECT * FROM v_hospital_requests ORDER BY total_requests DESC;
SELECT * FROM v_sample_testing_status WHERE mandatory_tests_passed = 0;
SELECT * FROM v_storage_occupancy ORDER BY occupancy_pct DESC;
SELECT * FROM v_transplant_summary;

-- =====================================================================
-- H. STORED PROCEDURES (full workflow on a fresh request)
-- =====================================================================
-- H1. register a donor sample (creates 5 PENDING tests in one transaction)
CALL sp_register_sample(14, 'CORD_BLOOD', CURDATE() - INTERVAL 2 DAY, 85.5, NULL, 2, @new_sample);
SELECT @new_sample AS new_sample_id;
SELECT test_id, test_type, test_status FROM sample_test WHERE sample_id = @new_sample;

-- H2. the TIERED SEARCH for pending request 9 (Chennai): preview only
CALL sp_find_candidates(9, 0);

-- H3. review, shortlist, allocate
CALL sp_review_request(9, 2, 'APPROVED', 'Critical case, proceed');
CALL sp_find_candidates(9, 1);
SELECT * FROM v_request_candidates WHERE request_id = 9;

-- =====================================================================
-- I. FUNCTIONS
-- =====================================================================
SELECT fn_count_available_samples(NULL)          AS all_available,
       fn_count_available_samples('CORD_BLOOD')  AS cord_blood_available,
       fn_count_available_samples('PBSC')        AS pbsc_available;

-- HLA score of every available cord-blood unit against patient of request 9
SELECT s.sample_id, fn_sample_match_score(9, s.sample_id) AS hla_score,
       fn_search_tier(9, s.sample_id) AS tier
  FROM stem_cell_sample s
 WHERE s.availability_status = 'AVAILABLE' AND s.sample_type = 'CORD_BLOOD'
 ORDER BY hla_score DESC LIMIT 8;

SELECT fn_locus_match('A*02:01', 'A*24:02', 'A*24:02', 'A*02:01') AS both_alleles_match;  -- 2

-- =====================================================================
-- J. TRIGGERS
-- =====================================================================
-- J1. allocation cascades: sample -> ALLOCATED, request -> ALLOCATED
SET @best = (SELECT sample_id FROM request_sample WHERE request_id = 9
              ORDER BY hla_match_score DESC LIMIT 1);
CALL sp_allocate_sample(9, @best);
SELECT sample_id, availability_status FROM stem_cell_sample WHERE sample_id = @best;
SELECT request_id, request_status FROM transplant_request WHERE request_id = 9;

-- J2. every change was written to the audit log automatically
SELECT audit_id, user_id, action, table_name, record_id, old_value, new_value
  FROM audit_log ORDER BY audit_id DESC LIMIT 6;

-- EXPECTED ERROR (trigger trg_rs_bu): allocating a unit that is not available
-- CALL sp_allocate_sample(1, @best);

-- EXPECTED ERROR (trigger trg_request_bu): COMPLETED -> PENDING is not a valid transition
-- UPDATE transplant_request SET request_status = 'PENDING' WHERE request_id = 7;

-- EXPECTED ERROR (trigger trg_audit_bd): audit log is append-only
-- DELETE FROM audit_log WHERE audit_id = 1;

-- EXPECTED ERROR (trigger trg_sample_bu): release before tests pass
-- CALL sp_release_sample(@new_sample, 2, 'R09-B09-S09');

-- J3. a failed infectious screen rejects and discards the unit automatically
CALL sp_record_test_result((SELECT test_id FROM sample_test WHERE sample_id = @new_sample
                            AND test_type = 'INFECTIOUS_SCREEN'), 'FAILED', 'HCV reactive', 'Confirmed');
SELECT sample_id, processing_status, availability_status FROM stem_cell_sample WHERE sample_id = @new_sample;

-- =====================================================================
-- K. TRANSACTIONS
-- =====================================================================
-- K1. schedule and complete inside procedures that COMMIT or ROLLBACK as a unit
CALL sp_schedule_transplant(9, CURDATE(), 'Demo transplant', @tx);
CALL sp_complete_transplant(@tx, 'PENDING', 'Day 0 infusion completed');
SELECT * FROM v_transplant_summary WHERE transplant_id = @tx;

-- K2. manual transaction with ROLLBACK: nothing is kept
START TRANSACTION;
  UPDATE storage_location SET current_status = 'MAINTENANCE' WHERE location_id = 1;
  SELECT location_code, current_status FROM storage_location WHERE location_id = 1;
ROLLBACK;
SELECT location_code, current_status FROM storage_location WHERE location_id = 1;  -- OPERATIONAL again

-- K3. SAVEPOINT: keep the first change, undo the second
START TRANSACTION;
  UPDATE doctor SET status = 'ON_LEAVE' WHERE doctor_id = 13;
  SAVEPOINT after_leave;
  UPDATE doctor SET status = 'INACTIVE' WHERE doctor_id = 12;
  ROLLBACK TO SAVEPOINT after_leave;
COMMIT;
SELECT doctor_id, status FROM doctor WHERE doctor_id IN (12, 13);
UPDATE doctor SET status = 'ACTIVE' WHERE doctor_id = 13;

-- K4. concurrency (open two Workbench tabs):
--   Tab 1: START TRANSACTION; SELECT * FROM stem_cell_sample WHERE sample_id = 1 FOR UPDATE;
--   Tab 2: CALL sp_allocate_sample(1, 1);   -- waits for Tab 1's lock
--   Tab 1: COMMIT;                         -- Tab 2 continues

-- CURSOR (inside a procedure) and scheduled EVENT
CALL sp_expiring_samples_report(60);
CALL sp_daily_maintenance(1);
SHOW EVENTS;

-- =====================================================================
-- L. INDEXES
-- =====================================================================
SHOW INDEX FROM stem_cell_sample;
EXPLAIN SELECT * FROM stem_cell_sample
 WHERE availability_status = 'AVAILABLE' AND sample_type = 'PBSC';        -- uses idx_sample_avail
EXPLAIN SELECT * FROM hospital WHERE state = 'Tamil Nadu' AND district = 'Chennai';   -- uses idx_hospital_geo
EXPLAIN SELECT * FROM hospital WHERE district = 'Chennai';               -- cannot use it (not leftmost column)
EXPLAIN SELECT * FROM donor WHERE full_name LIKE 'Pri%';                 -- prefix LIKE uses idx_donor_name
EXPLAIN SELECT * FROM donor WHERE full_name LIKE '%Iyer';                -- leading wildcard: full scan

-- =====================================================================
-- M. SECURITY (run 07_security.sql first)
-- =====================================================================
SHOW GRANTS FOR 'staff.kavya'@'localhost' USING sv_bank_staff;
SHOW GRANTS FOR 'dr.ananya'@'localhost' USING sv_doctor;
-- Log in as donor.karthik and run:  SELECT * FROM stemvault.v_my_donor_samples;
-- Log in as dr.ananya and run:      SELECT * FROM stemvault.donor;   -- denied

SET @app_user_id = NULL;
