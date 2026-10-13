-- =====================================================================
--  StemVault – 03_views.sql
-- =====================================================================
USE stemvault;

-- ---------------------------------------------------------------------
-- Available samples (anonymized: no donor name / contact)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_available_samples AS
SELECT s.sample_id,
       s.sample_type,
       d.blood_group,
       s.collection_date,
       s.expiry_date,
       DATEDIFF(s.expiry_date, CURDATE()) AS days_to_expiry,
       s.volume_ml,
       s.cd34_count,
       l.location_code,
       s.storage_position,
       h.hospital_id,
       h.hospital_name,
       h.city,
       h.district,
       h.state
  FROM stem_cell_sample s
  JOIN donor d            ON d.donor_id    = s.donor_id
  JOIN storage_location l ON l.location_id = s.location_id
  JOIN hospital h         ON h.hospital_id = l.hospital_id
 WHERE s.availability_status = 'AVAILABLE'
   AND (s.expiry_date IS NULL OR s.expiry_date >= CURDATE());

-- ---------------------------------------------------------------------
-- Patient transplant requests (one row per request)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_patient_requests AS
SELECT r.request_id,
       r.request_date,
       r.required_sample_type,
       r.min_hla_match,
       r.urgency,
       r.request_status,
       r.reviewed_at,
       r.review_remarks,
       ru.username          AS reviewed_by_username,
       p.patient_id,
       p.full_name          AS patient_name,
       p.blood_group        AS patient_blood_group,
       p.diagnosis,
       p.user_id            AS patient_user_id,
       doc.doctor_id,
       doc.full_name        AS doctor_name,
       doc.user_id          AS doctor_user_id,
       h.hospital_id,
       h.hospital_name,
       h.district,
       h.state,
       (SELECT COUNT(*) FROM request_sample rs
         WHERE rs.request_id = r.request_id AND rs.selection_status = 'CANDIDATE') AS candidate_count,
       (SELECT rs.sample_id FROM request_sample rs
         WHERE rs.request_id = r.request_id AND rs.selection_status = 'ALLOCATED' LIMIT 1) AS allocated_sample_id,
       t.transplant_id,
       t.transplant_date,
       t.transplant_status,
       t.outcome
  FROM transplant_request r
  JOIN patient  p   ON p.patient_id   = r.patient_id
  JOIN doctor   doc ON doc.doctor_id  = r.doctor_id
  JOIN hospital h   ON h.hospital_id  = doc.hospital_id
  LEFT JOIN `user` ru    ON ru.user_id    = r.reviewed_by
  LEFT JOIN transplant t ON t.request_id  = r.request_id;

-- ---------------------------------------------------------------------
-- Hospital / doctor request summary (aggregation + LEFT JOIN)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_hospital_requests AS
SELECT h.hospital_id,
       h.hospital_name,
       h.city,
       h.district,
       h.state,
       COUNT(DISTINCT doc.doctor_id)                                   AS doctor_count,
       COUNT(r.request_id)                                             AS total_requests,
       COALESCE(SUM(r.request_status = 'PENDING'), 0)                  AS pending_requests,
       COALESCE(SUM(r.request_status IN ('APPROVED','ALLOCATED')), 0)  AS active_requests,
       COALESCE(SUM(r.request_status = 'COMPLETED'), 0)                AS completed_requests,
       COALESCE(SUM(r.urgency = 'CRITICAL'
                    AND r.request_status IN ('PENDING','APPROVED','ALLOCATED')), 0) AS open_critical
  FROM hospital h
  LEFT JOIN doctor doc           ON doc.hospital_id = h.hospital_id
  LEFT JOIN transplant_request r ON r.doctor_id     = doc.doctor_id
 GROUP BY h.hospital_id, h.hospital_name, h.city, h.district, h.state;

-- ---------------------------------------------------------------------
-- Sample testing status (conditional aggregation per sample)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_sample_testing_status AS
SELECT s.sample_id,
       s.donor_id,
       s.sample_type,
       s.collection_date,
       s.processing_status,
       s.availability_status,
       COUNT(t.test_id)                                AS total_tests,
       COALESCE(SUM(t.test_status = 'PASSED'), 0)       AS passed_tests,
       COALESCE(SUM(t.test_status = 'FAILED'), 0)       AS failed_tests,
       COALESCE(SUM(t.test_status = 'PENDING'), 0)      AS pending_tests,
       MAX(t.test_date)                                AS last_test_date,
       fn_sample_tests_passed(s.sample_id)             AS mandatory_tests_passed
  FROM stem_cell_sample s
  LEFT JOIN sample_test t ON t.sample_id = s.sample_id
 GROUP BY s.sample_id, s.donor_id, s.sample_type, s.collection_date,
          s.processing_status, s.availability_status;

-- ---------------------------------------------------------------------
-- Storage occupancy (derived, never stored)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_storage_occupancy AS
SELECT l.location_id,
       l.location_code,
       l.storage_area,
       l.storage_type,
       l.capacity,
       l.current_status,
       h.hospital_id,
       h.hospital_name,
       h.district,
       h.state,
       COUNT(s.sample_id)                                  AS used_slots,
       l.capacity - COUNT(s.sample_id)                     AS free_slots,
       ROUND(100 * COUNT(s.sample_id) / l.capacity, 1)     AS occupancy_pct
  FROM storage_location l
  JOIN hospital h              ON h.hospital_id = l.hospital_id
  LEFT JOIN stem_cell_sample s ON s.location_id = l.location_id
 GROUP BY l.location_id, l.location_code, l.storage_area, l.storage_type, l.capacity,
          l.current_status, h.hospital_id, h.hospital_name, h.district, h.state;

-- ---------------------------------------------------------------------
-- Donor consent status (one row per donor)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_donor_consent_status AS
SELECT d.donor_id,
       d.full_name,
       d.blood_group,
       d.status,
       fn_has_active_consent(d.donor_id, 'COLLECTION')   AS has_collection,
       fn_has_active_consent(d.donor_id, 'STORAGE')      AS has_storage,
       fn_has_active_consent(d.donor_id, 'CLINICAL_USE') AS has_clinical_use,
       (SELECT COUNT(*) FROM stem_cell_sample s WHERE s.donor_id = d.donor_id) AS sample_count
  FROM donor d;

-- ---------------------------------------------------------------------
-- Transplant summary (multi-table join)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_transplant_summary AS
SELECT t.transplant_id,
       t.transplant_date,
       t.transplant_status,
       t.outcome,
       t.remarks,
       r.request_id,
       r.urgency,
       p.patient_id,
       p.full_name   AS patient_name,
       p.user_id     AS patient_user_id,
       p.diagnosis,
       doc.doctor_id,
       doc.full_name AS doctor_name,
       doc.user_id   AS doctor_user_id,
       h.hospital_name,
       h.district,
       h.state,
       s.sample_id,
       s.sample_type,
       dn.blood_group AS donor_blood_group,
       rs.hla_match_score,
       rs.search_tier
  FROM transplant t
  JOIN request_sample rs    ON rs.request_id = t.request_id AND rs.sample_id = t.sample_id
  JOIN transplant_request r ON r.request_id  = t.request_id
  JOIN patient p            ON p.patient_id  = r.patient_id
  JOIN doctor doc           ON doc.doctor_id = r.doctor_id
  JOIN hospital h           ON h.hospital_id = doc.hospital_id
  JOIN stem_cell_sample s   ON s.sample_id   = t.sample_id
  JOIN donor dn             ON dn.donor_id   = s.donor_id;

-- ---------------------------------------------------------------------
-- Candidates of every request with where the sample sits
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_request_candidates AS
SELECT rs.request_id,
       rs.sample_id,
       rs.hla_match_score,
       rs.search_tier,
       rs.selection_status,
       rs.allocation_date,
       s.sample_type,
       s.availability_status,
       s.expiry_date,
       s.cd34_count,
       dn.blood_group AS donor_blood_group,
       l.location_code,
       h.hospital_name,
       h.district,
       h.state
  FROM request_sample rs
  JOIN stem_cell_sample s      ON s.sample_id   = rs.sample_id
  JOIN donor dn                ON dn.donor_id   = s.donor_id
  LEFT JOIN storage_location l ON l.location_id = s.location_id
  LEFT JOIN hospital h         ON h.hospital_id = l.hospital_id;
