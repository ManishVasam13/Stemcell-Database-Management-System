-- =====================================================================
--  StemVault – 02_functions.sql
--  Stored functions used by views, triggers and procedures.
-- =====================================================================
USE stemvault;

DROP FUNCTION IF EXISTS fn_age;
DROP FUNCTION IF EXISTS fn_user_role;
DROP FUNCTION IF EXISTS fn_locus_match;
DROP FUNCTION IF EXISTS fn_hla_match_score;
DROP FUNCTION IF EXISTS fn_sample_match_score;
DROP FUNCTION IF EXISTS fn_search_tier;
DROP FUNCTION IF EXISTS fn_tier_rank;
DROP FUNCTION IF EXISTS fn_count_available_samples;
DROP FUNCTION IF EXISTS fn_has_active_consent;
DROP FUNCTION IF EXISTS fn_sample_tests_passed;
DROP FUNCTION IF EXISTS fn_location_free_slots;

DELIMITER $$

-- Age in completed years (uses today's date, so it cannot live in a CHECK)
CREATE FUNCTION fn_age(p_dob DATE)
RETURNS INT
NOT DETERMINISTIC NO SQL
BEGIN
  RETURN TIMESTAMPDIFF(YEAR, p_dob, CURDATE());
END$$

-- Role of a user account (NULL if the user does not exist)
CREATE FUNCTION fn_user_role(p_user_id INT UNSIGNED)
RETURNS VARCHAR(12)
NOT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE v_role VARCHAR(12);
  SELECT role INTO v_role FROM `user` WHERE user_id = p_user_id;
  RETURN v_role;
END$$

-- Matched alleles at one HLA locus (0, 1 or 2).
-- Each person has two alleles per locus; order does not matter,
-- so try both pairings and keep the better one.
CREATE FUNCTION fn_locus_match(p1 VARCHAR(12), p2 VARCHAR(12), d1 VARCHAR(12), d2 VARCHAR(12))
RETURNS TINYINT
DETERMINISTIC NO SQL
BEGIN
  IF p1 IS NULL OR p2 IS NULL OR d1 IS NULL OR d2 IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN GREATEST((p1 = d1) + (p2 = d2), (p1 = d2) + (p2 = d1));
END$$

-- HLA match score between a patient and a donor: 0..6 (A, B, DRB1 x 2)
-- NULL when either person has not been HLA-typed.
CREATE FUNCTION fn_hla_match_score(p_patient_id INT UNSIGNED, p_donor_id INT UNSIGNED)
RETURNS TINYINT
NOT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE v_score TINYINT;
  SELECT fn_locus_match(p.hla_a_1,    p.hla_a_2,    d.hla_a_1,    d.hla_a_2)
       + fn_locus_match(p.hla_b_1,    p.hla_b_2,    d.hla_b_1,    d.hla_b_2)
       + fn_locus_match(p.hla_drb1_1, p.hla_drb1_2, d.hla_drb1_1, d.hla_drb1_2)
    INTO v_score
    FROM patient p, donor d
   WHERE p.patient_id = p_patient_id AND d.donor_id = p_donor_id;
  RETURN v_score;
END$$

-- Match score of a sample for a request (request -> patient, sample -> donor)
CREATE FUNCTION fn_sample_match_score(p_request_id INT UNSIGNED, p_sample_id INT UNSIGNED)
RETURNS TINYINT
NOT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE v_patient INT UNSIGNED;
  DECLARE v_donor   INT UNSIGNED;
  SELECT patient_id INTO v_patient FROM transplant_request WHERE request_id = p_request_id;
  SELECT donor_id   INTO v_donor   FROM stem_cell_sample   WHERE sample_id  = p_sample_id;
  RETURN fn_hla_match_score(v_patient, v_donor);
END$$

-- Location tier of a stored sample relative to the requesting hospital.
-- Requesting hospital = request -> doctor -> hospital
-- Sample hospital     = sample -> storage_location -> hospital
-- District names repeat across states, so SAME_DISTRICT also requires the same state.
CREATE FUNCTION fn_search_tier(p_request_id INT UNSIGNED, p_sample_id INT UNSIGNED)
RETURNS VARCHAR(13)
NOT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE v_req_state, v_req_district, v_s_state, v_s_district VARCHAR(60);

  SELECT h.state, h.district INTO v_req_state, v_req_district
    FROM transplant_request r
    JOIN doctor   d ON d.doctor_id   = r.doctor_id
    JOIN hospital h ON h.hospital_id = d.hospital_id
   WHERE r.request_id = p_request_id;

  SELECT h.state, h.district INTO v_s_state, v_s_district
    FROM stem_cell_sample s
    JOIN storage_location l ON l.location_id = s.location_id
    JOIN hospital h         ON h.hospital_id = l.hospital_id
   WHERE s.sample_id = p_sample_id;

  IF v_s_state IS NULL OR v_req_state IS NULL THEN
    RETURN NULL;
  ELSEIF v_s_state = v_req_state AND v_s_district = v_req_district THEN
    RETURN 'SAME_DISTRICT';
  ELSEIF v_s_state = v_req_state THEN
    RETURN 'SAME_STATE';
  END IF;
  RETURN 'NATIONAL';
END$$

-- Numeric order of tiers (1 = nearest), used for sorting and fallback
CREATE FUNCTION fn_tier_rank(p_tier VARCHAR(13))
RETURNS TINYINT
DETERMINISTIC NO SQL
BEGIN
  RETURN CASE p_tier WHEN 'SAME_DISTRICT' THEN 1 WHEN 'SAME_STATE' THEN 2
                     WHEN 'NATIONAL' THEN 3 ELSE 9 END;
END$$

-- Number of usable samples (AVAILABLE and not expired); NULL type = all types
CREATE FUNCTION fn_count_available_samples(p_sample_type VARCHAR(12))
RETURNS INT
NOT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE v_count INT;
  SELECT COUNT(*) INTO v_count
    FROM stem_cell_sample
   WHERE availability_status = 'AVAILABLE'
     AND (expiry_date IS NULL OR expiry_date >= CURDATE())
     AND (p_sample_type IS NULL OR sample_type = p_sample_type);
  RETURN v_count;
END$$

-- 1 if the donor currently holds an ACTIVE, unexpired consent of the given type
CREATE FUNCTION fn_has_active_consent(p_donor_id INT UNSIGNED, p_type VARCHAR(12))
RETURNS TINYINT
NOT DETERMINISTIC READS SQL DATA
BEGIN
  RETURN EXISTS (SELECT 1 FROM consent
                  WHERE donor_id = p_donor_id
                    AND consent_type = p_type
                    AND status = 'ACTIVE'
                    AND (valid_until IS NULL OR valid_until >= CURDATE()));
END$$

-- 1 if the LATEST result of every mandatory test type is PASSED
-- (correlated subquery picks the latest test of each type)
CREATE FUNCTION fn_sample_tests_passed(p_sample_id INT UNSIGNED)
RETURNS TINYINT
NOT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE v_passed INT;
  SELECT COUNT(DISTINCT t.test_type) INTO v_passed
    FROM sample_test t
   WHERE t.sample_id = p_sample_id
     AND t.test_type IN ('HLA_TYPING','INFECTIOUS_SCREEN','STERILITY','VIABILITY')
     AND t.test_status = 'PASSED'
     AND t.test_date = (SELECT MAX(t2.test_date) FROM sample_test t2
                         WHERE t2.sample_id = t.sample_id AND t2.test_type = t.test_type);
  RETURN v_passed = 4;
END$$

-- Free slots in a storage unit (occupancy is derived, never stored)
CREATE FUNCTION fn_location_free_slots(p_location_id INT UNSIGNED)
RETURNS INT
NOT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE v_capacity INT;
  DECLARE v_used INT;
  SELECT capacity INTO v_capacity FROM storage_location WHERE location_id = p_location_id;
  SELECT COUNT(*) INTO v_used FROM stem_cell_sample WHERE location_id = p_location_id;
  RETURN v_capacity - v_used;
END$$

DELIMITER ;
