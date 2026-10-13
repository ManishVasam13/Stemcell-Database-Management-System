-- =====================================================================
--  StemVault – 05_procedures.sql
--  Workflow procedures (with transactions), tiered search,
--  a cursor-based report, and a scheduled maintenance event.
-- =====================================================================
USE stemvault;

DROP PROCEDURE IF EXISTS sp_register_donor;
DROP PROCEDURE IF EXISTS sp_register_patient;
DROP PROCEDURE IF EXISTS sp_register_sample;
DROP PROCEDURE IF EXISTS sp_record_test_result;
DROP PROCEDURE IF EXISTS sp_release_sample;
DROP PROCEDURE IF EXISTS sp_revoke_consent;
DROP PROCEDURE IF EXISTS sp_submit_request;
DROP PROCEDURE IF EXISTS sp_review_request;
DROP PROCEDURE IF EXISTS sp_find_candidates;
DROP PROCEDURE IF EXISTS sp_allocate_sample;
DROP PROCEDURE IF EXISTS sp_release_allocation;
DROP PROCEDURE IF EXISTS sp_schedule_transplant;
DROP PROCEDURE IF EXISTS sp_complete_transplant;
DROP PROCEDURE IF EXISTS sp_cancel_transplant;
DROP PROCEDURE IF EXISTS sp_cancel_request;
DROP PROCEDURE IF EXISTS sp_expiring_samples_report;
DROP PROCEDURE IF EXISTS sp_daily_maintenance;
DROP EVENT IF EXISTS ev_daily_maintenance;

DELIMITER $$

-- ---------------------------------------------------------------------
-- Register a donor (+ optional login) and record COLLECTION consent.
-- TRANSACTION: all three inserts succeed or none do.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_register_donor(
  IN p_full_name VARCHAR(100), IN p_dob DATE, IN p_gender CHAR(1), IN p_blood_group VARCHAR(3),
  IN p_phone VARCHAR(15), IN p_email VARCHAR(100), IN p_address VARCHAR(255),
  IN p_hla_a_1 VARCHAR(12), IN p_hla_a_2 VARCHAR(12), IN p_hla_b_1 VARCHAR(12),
  IN p_hla_b_2 VARCHAR(12), IN p_hla_drb1_1 VARCHAR(12), IN p_hla_drb1_2 VARCHAR(12),
  IN p_username VARCHAR(50), IN p_password_hash VARCHAR(255),
  OUT p_donor_id INT UNSIGNED)
BEGIN
  DECLARE v_user_id INT UNSIGNED DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF fn_age(p_dob) < 18 OR fn_age(p_dob) > 60 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donor must be between 18 and 60 years old';
  END IF;

  START TRANSACTION;
    IF p_username IS NOT NULL THEN
      INSERT INTO `user` (username, password_hash, role) VALUES (p_username, p_password_hash, 'DONOR');
      SET v_user_id = LAST_INSERT_ID();
    END IF;

    INSERT INTO donor (user_id, full_name, date_of_birth, gender, blood_group,
                       hla_a_1, hla_a_2, hla_b_1, hla_b_2, hla_drb1_1, hla_drb1_2,
                       phone, email, address)
    VALUES (v_user_id, p_full_name, p_dob, p_gender, p_blood_group,
            p_hla_a_1, p_hla_a_2, p_hla_b_1, p_hla_b_2, p_hla_drb1_1, p_hla_drb1_2,
            p_phone, p_email, p_address);
    SET p_donor_id = LAST_INSERT_ID();

    INSERT INTO consent (donor_id, consent_type, consent_date) VALUES (p_donor_id, 'COLLECTION', CURDATE());
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- Register a patient (+ optional login). TRANSACTION.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_register_patient(
  IN p_full_name VARCHAR(100), IN p_dob DATE, IN p_gender CHAR(1), IN p_blood_group VARCHAR(3),
  IN p_diagnosis VARCHAR(150), IN p_phone VARCHAR(15), IN p_email VARCHAR(100), IN p_address VARCHAR(255),
  IN p_hla_a_1 VARCHAR(12), IN p_hla_a_2 VARCHAR(12), IN p_hla_b_1 VARCHAR(12),
  IN p_hla_b_2 VARCHAR(12), IN p_hla_drb1_1 VARCHAR(12), IN p_hla_drb1_2 VARCHAR(12),
  IN p_username VARCHAR(50), IN p_password_hash VARCHAR(255),
  OUT p_patient_id INT UNSIGNED)
BEGIN
  DECLARE v_user_id INT UNSIGNED DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
    IF p_username IS NOT NULL THEN
      INSERT INTO `user` (username, password_hash, role) VALUES (p_username, p_password_hash, 'PATIENT');
      SET v_user_id = LAST_INSERT_ID();
    END IF;

    INSERT INTO patient (user_id, full_name, date_of_birth, gender, blood_group,
                         hla_a_1, hla_a_2, hla_b_1, hla_b_2, hla_drb1_1, hla_drb1_2,
                         diagnosis, phone, email, address)
    VALUES (v_user_id, p_full_name, p_dob, p_gender, p_blood_group,
            p_hla_a_1, p_hla_a_2, p_hla_b_1, p_hla_b_2, p_hla_drb1_1, p_hla_drb1_2,
            p_diagnosis, p_phone, p_email, p_address);
    SET p_patient_id = LAST_INSERT_ID();
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- Register a collected sample and create its mandatory PENDING tests.
-- TRANSACTION.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_register_sample(
  IN p_donor_id INT UNSIGNED, IN p_sample_type VARCHAR(12), IN p_collection_date DATE,
  IN p_volume_ml DECIMAL(6,2), IN p_expiry_date DATE, IN p_staff_user_id INT UNSIGNED,
  OUT p_sample_id INT UNSIGNED)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
    INSERT INTO stem_cell_sample (donor_id, sample_type, collection_date, volume_ml,
                                  processing_status, expiry_date)
    VALUES (p_donor_id, p_sample_type, p_collection_date, p_volume_ml, 'PROCESSING', p_expiry_date);
    SET p_sample_id = LAST_INSERT_ID();

    INSERT INTO sample_test (sample_id, test_type, test_date, performed_by)
    VALUES (p_sample_id, 'HLA_TYPING',        NOW(), p_staff_user_id),
           (p_sample_id, 'INFECTIOUS_SCREEN', NOW(), p_staff_user_id),
           (p_sample_id, 'STERILITY',         NOW(), p_staff_user_id),
           (p_sample_id, 'VIABILITY',         NOW(), p_staff_user_id),
           (p_sample_id, 'CD34_COUNT',        NOW(), p_staff_user_id);

    UPDATE stem_cell_sample SET processing_status = 'QUARANTINE' WHERE sample_id = p_sample_id;
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- Record the result of a pending test.
-- A FAILED mandatory test rejects the sample (trigger trg_test_au).
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_record_test_result(
  IN p_test_id INT UNSIGNED, IN p_status VARCHAR(12), IN p_result VARCHAR(255),
  IN p_remarks VARCHAR(255))
BEGIN
  DECLARE v_type VARCHAR(20);
  DECLARE v_sample INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
    SELECT test_type, sample_id INTO v_type, v_sample FROM sample_test WHERE test_id = p_test_id FOR UPDATE;
    IF v_type IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Test not found';
    END IF;

    UPDATE sample_test SET test_status = p_status, result = p_result, remarks = p_remarks
     WHERE test_id = p_test_id;

    -- keep the sample's CD34 value in step with a passed CD34 count
    IF v_type = 'CD34_COUNT' AND p_status = 'PASSED' AND p_result REGEXP '^[0-9]+(\\.[0-9]+)?$' THEN
      UPDATE stem_cell_sample SET cd34_count = CAST(p_result AS DECIMAL(8,2)) WHERE sample_id = v_sample;
    END IF;
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- Release a tested sample into a storage slot.
-- TRANSACTION + row lock on the storage unit so two staff cannot fill
-- the last slot at the same time.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_release_sample(
  IN p_sample_id INT UNSIGNED, IN p_location_id INT UNSIGNED, IN p_position VARCHAR(20))
BEGIN
  DECLARE v_donor INT UNSIGNED;
  DECLARE v_capacity INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
    SELECT capacity INTO v_capacity FROM storage_location WHERE location_id = p_location_id FOR UPDATE;
    IF v_capacity IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Storage unit not found';
    END IF;

    SELECT donor_id INTO v_donor FROM stem_cell_sample WHERE sample_id = p_sample_id FOR UPDATE;
    IF v_donor IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sample not found';
    END IF;

    UPDATE stem_cell_sample
       SET processing_status   = 'RELEASED',
           location_id         = p_location_id,
           storage_position    = p_position,
           availability_status = IF(fn_has_active_consent(v_donor, 'STORAGE')
                                    AND fn_has_active_consent(v_donor, 'CLINICAL_USE'),
                                    'AVAILABLE', 'NOT_AVAILABLE')
     WHERE sample_id = p_sample_id;
  COMMIT;

  SELECT sample_id, processing_status, availability_status, location_id, storage_position
    FROM stem_cell_sample WHERE sample_id = p_sample_id;
END$$

-- ---------------------------------------------------------------------
-- Revoke a consent (trigger withdraws available samples if needed)
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_revoke_consent(IN p_consent_id INT UNSIGNED, IN p_reason VARCHAR(255))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM consent WHERE consent_id = p_consent_id AND status = 'ACTIVE') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an ACTIVE consent can be revoked';
  END IF;
  UPDATE consent
     SET status = 'REVOKED', revoked_on = CURDATE(), revocation_reason = p_reason
   WHERE consent_id = p_consent_id;
END$$

-- ---------------------------------------------------------------------
-- Submit a transplant request
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_submit_request(
  IN p_patient_id INT UNSIGNED, IN p_doctor_id INT UNSIGNED, IN p_sample_type VARCHAR(12),
  IN p_min_hla_match TINYINT UNSIGNED, IN p_urgency VARCHAR(8), OUT p_request_id INT UNSIGNED)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM patient WHERE patient_id = p_patient_id AND hla_a_1 IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Patient must be HLA-typed before a request is submitted';
  END IF;
  INSERT INTO transplant_request (patient_id, doctor_id, required_sample_type, min_hla_match, urgency)
  VALUES (p_patient_id, p_doctor_id, p_sample_type, COALESCE(p_min_hla_match, 4), COALESCE(p_urgency, 'ROUTINE'));
  SET p_request_id = LAST_INSERT_ID();
END$$

-- ---------------------------------------------------------------------
-- Approve or reject a pending request
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_review_request(
  IN p_request_id INT UNSIGNED, IN p_reviewer_id INT UNSIGNED,
  IN p_decision VARCHAR(10), IN p_remarks VARCHAR(255))
BEGIN
  IF p_decision NOT IN ('APPROVED','REJECTED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Decision must be APPROVED or REJECTED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM transplant_request WHERE request_id = p_request_id AND request_status = 'PENDING') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a PENDING request can be reviewed';
  END IF;
  UPDATE transplant_request
     SET request_status = p_decision, reviewed_by = p_reviewer_id,
         reviewed_at = NOW(), review_remarks = p_remarks
   WHERE request_id = p_request_id;
END$$

-- ---------------------------------------------------------------------
-- TIERED SEARCH
-- Finds compatible samples for a request, looking first in the
-- requesting hospital's district, then its state, then all of India.
-- Only the nearest non-empty tier is returned.
--
-- Result set 1: count and best score in every tier (which tier was used)
-- Result set 2: candidates in the chosen tier, best HLA match first
-- p_save = 1 stores those candidates in request_sample (APPROVED requests)
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_find_candidates(IN p_request_id INT UNSIGNED, IN p_save TINYINT)
BEGIN
  DECLARE v_status, v_type VARCHAR(12);
  DECLARE v_min TINYINT;
  DECLARE v_patient INT UNSIGNED;
  DECLARE v_state, v_district VARCHAR(60);
  DECLARE v_best TINYINT;

  SELECT r.request_status, r.required_sample_type, r.min_hla_match, r.patient_id, h.state, h.district
    INTO v_status, v_type, v_min, v_patient, v_state, v_district
    FROM transplant_request r
    JOIN doctor d   ON d.doctor_id   = r.doctor_id
    JOIN hospital h ON h.hospital_id = d.hospital_id
   WHERE r.request_id = p_request_id;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request not found';
  END IF;
  IF v_status NOT IN ('PENDING','APPROVED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Search is only available for PENDING or APPROVED requests';
  END IF;
  IF p_save = 1 AND v_status <> 'APPROVED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Approve the request before shortlisting candidates';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_candidates;
  CREATE TEMPORARY TABLE tmp_candidates AS
  SELECT s.sample_id,
         s.sample_type,
         dn.blood_group                                AS donor_blood_group,
         (dn.blood_group = p.blood_group)              AS abo_identical,
         fn_hla_match_score(v_patient, s.donor_id)     AS hla_match_score,
         CASE WHEN h.state = v_state AND h.district = v_district THEN 'SAME_DISTRICT'
              WHEN h.state = v_state THEN 'SAME_STATE'
              ELSE 'NATIONAL' END                      AS search_tier,
         s.collection_date,
         s.expiry_date,
         s.volume_ml,
         s.cd34_count,
         l.location_code,
         h.hospital_name,
         h.city,
         h.district,
         h.state,
         rs.selection_status                           AS existing_status
    FROM stem_cell_sample s
    JOIN donor dn           ON dn.donor_id   = s.donor_id
    JOIN storage_location l ON l.location_id = s.location_id
    JOIN hospital h         ON h.hospital_id = l.hospital_id
    JOIN patient p          ON p.patient_id  = v_patient
    LEFT JOIN request_sample rs ON rs.request_id = p_request_id AND rs.sample_id = s.sample_id
   WHERE s.availability_status = 'AVAILABLE'
     AND s.sample_type = v_type
     AND (s.expiry_date IS NULL OR s.expiry_date >= CURDATE())
     AND l.current_status = 'OPERATIONAL'
     AND h.status = 'ACTIVE'
     AND fn_has_active_consent(s.donor_id, 'CLINICAL_USE') = 1
     AND (rs.selection_status IS NULL OR rs.selection_status = 'CANDIDATE')
     AND fn_hla_match_score(v_patient, s.donor_id) >= v_min;

  SELECT MIN(fn_tier_rank(search_tier)) INTO v_best FROM tmp_candidates;

  -- result set 1: tier summary (UNION of constant rows + LEFT JOIN)
  SELECT t.tier                         AS search_tier,
         t.tier_rank,
         COALESCE(c.sample_count, 0)    AS sample_count,
         c.best_score,
         (t.tier_rank <=> v_best)       AS is_selected_tier
    FROM (SELECT 'SAME_DISTRICT' AS tier, 1 AS tier_rank
          UNION ALL SELECT 'SAME_STATE', 2
          UNION ALL SELECT 'NATIONAL',   3) t
    LEFT JOIN (SELECT search_tier, COUNT(*) AS sample_count, MAX(hla_match_score) AS best_score
                 FROM tmp_candidates GROUP BY search_tier) c
           ON c.search_tier = t.tier
   ORDER BY t.tier_rank;

  IF p_save = 1 AND v_best IS NOT NULL THEN
    INSERT INTO request_sample (request_id, sample_id, hla_match_score, search_tier)
    SELECT p_request_id, sample_id, hla_match_score, search_tier
      FROM tmp_candidates
     WHERE fn_tier_rank(search_tier) = v_best AND existing_status IS NULL;
    UPDATE tmp_candidates SET existing_status = 'CANDIDATE'
     WHERE fn_tier_rank(search_tier) = v_best AND existing_status IS NULL;
  END IF;

  -- result set 2: candidates in the nearest non-empty tier
  SELECT * FROM tmp_candidates
   WHERE fn_tier_rank(search_tier) = v_best
   ORDER BY hla_match_score DESC, abo_identical DESC, cd34_count DESC, expiry_date IS NULL, expiry_date;

  DROP TEMPORARY TABLE IF EXISTS tmp_candidates;
END$$

-- ---------------------------------------------------------------------
-- ALLOCATE a sample to a request.
-- TRANSACTION with SELECT ... FOR UPDATE on both rows: two coordinators
-- cannot allocate the same unit, and a request cannot get two units.
-- Triggers then move sample -> ALLOCATED and request -> ALLOCATED.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_allocate_sample(IN p_request_id INT UNSIGNED, IN p_sample_id INT UNSIGNED)
BEGIN
  DECLARE v_req_status VARCHAR(10);
  DECLARE v_req_type, v_s_type VARCHAR(12);
  DECLARE v_min, v_score TINYINT;
  DECLARE v_patient, v_donor INT UNSIGNED;
  DECLARE v_s_status VARCHAR(13);
  DECLARE v_expiry DATE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
    SELECT request_status, required_sample_type, min_hla_match, patient_id
      INTO v_req_status, v_req_type, v_min, v_patient
      FROM transplant_request WHERE request_id = p_request_id FOR UPDATE;
    IF v_req_status IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request not found';
    END IF;
    IF v_req_status <> 'APPROVED' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request must be APPROVED and not already allocated';
    END IF;

    SELECT availability_status, sample_type, donor_id, expiry_date
      INTO v_s_status, v_s_type, v_donor, v_expiry
      FROM stem_cell_sample WHERE sample_id = p_sample_id FOR UPDATE;
    IF v_s_status IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sample not found';
    END IF;
    IF v_s_status <> 'AVAILABLE' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sample is not available for allocation';
    END IF;
    IF v_s_type <> v_req_type THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sample type does not match the request';
    END IF;

    SET v_score = fn_hla_match_score(v_patient, v_donor);
    IF v_score IS NULL OR v_score < v_min THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'HLA match is below the request minimum';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM request_sample WHERE request_id = p_request_id AND sample_id = p_sample_id) THEN
      INSERT INTO request_sample (request_id, sample_id, hla_match_score, search_tier)
      VALUES (p_request_id, p_sample_id, v_score, fn_search_tier(p_request_id, p_sample_id));
    END IF;

    UPDATE request_sample SET selection_status = 'ALLOCATED'
     WHERE request_id = p_request_id AND sample_id = p_sample_id;
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- Release an allocation (sample back to the pool, request back to APPROVED)
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_release_allocation(IN p_request_id INT UNSIGNED)
BEGIN
  DECLARE v_sample INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
    SELECT sample_id INTO v_sample FROM request_sample
     WHERE request_id = p_request_id AND selection_status = 'ALLOCATED' FOR UPDATE;
    IF v_sample IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This request has no allocated sample';
    END IF;

    -- a cancelled transplant row would block a future transplant (UNIQUE request_id)
    DELETE FROM transplant
     WHERE request_id = p_request_id AND sample_id = v_sample AND transplant_status = 'CANCELLED';

    UPDATE request_sample SET selection_status = 'RELEASED'
     WHERE request_id = p_request_id AND sample_id = v_sample;
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- Schedule (or reschedule a cancelled) transplant for the allocated unit
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_schedule_transplant(
  IN p_request_id INT UNSIGNED, IN p_date DATE, IN p_remarks VARCHAR(255),
  OUT p_transplant_id INT UNSIGNED)
BEGIN
  DECLARE v_sample INT UNSIGNED;
  DECLARE v_existing INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
    SELECT sample_id INTO v_sample FROM request_sample
     WHERE request_id = p_request_id AND selection_status = 'ALLOCATED' FOR UPDATE;
    IF v_sample IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Allocate a sample before scheduling the transplant';
    END IF;

    SELECT transplant_id INTO v_existing FROM transplant WHERE request_id = p_request_id FOR UPDATE;

    IF v_existing IS NULL THEN
      INSERT INTO transplant (request_id, sample_id, transplant_date, remarks)
      VALUES (p_request_id, v_sample, p_date, p_remarks);
      SET p_transplant_id = LAST_INSERT_ID();
    ELSE
      UPDATE transplant SET transplant_status = 'SCHEDULED', transplant_date = p_date, remarks = p_remarks
       WHERE transplant_id = v_existing AND transplant_status = 'CANCELLED';
      IF ROW_COUNT() = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A transplant is already scheduled or completed for this request';
      END IF;
      SET p_transplant_id = v_existing;
    END IF;
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- COMPLETE a transplant.
-- TRANSACTION: transplant -> COMPLETED, and (via trigger)
-- sample -> TRANSPLANTED (leaves storage), request -> COMPLETED.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_complete_transplant(
  IN p_transplant_id INT UNSIGNED, IN p_outcome VARCHAR(13), IN p_remarks VARCHAR(255))
BEGIN
  DECLARE v_status VARCHAR(9);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
    SELECT transplant_status INTO v_status FROM transplant WHERE transplant_id = p_transplant_id FOR UPDATE;
    IF v_status IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transplant not found';
    END IF;

    IF v_status = 'SCHEDULED' THEN
      UPDATE transplant
         SET transplant_status = 'COMPLETED', outcome = COALESCE(p_outcome, 'PENDING'),
             remarks = COALESCE(p_remarks, remarks)
       WHERE transplant_id = p_transplant_id;
    ELSEIF v_status = 'COMPLETED' THEN
      -- follow-up: record the engraftment outcome later
      UPDATE transplant SET outcome = p_outcome, remarks = COALESCE(p_remarks, remarks)
       WHERE transplant_id = p_transplant_id;
    ELSE
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A cancelled transplant cannot be completed';
    END IF;
  COMMIT;
END$$

CREATE PROCEDURE sp_cancel_transplant(IN p_transplant_id INT UNSIGNED, IN p_remarks VARCHAR(255))
BEGIN
  UPDATE transplant SET transplant_status = 'CANCELLED', remarks = p_remarks
   WHERE transplant_id = p_transplant_id AND transplant_status = 'SCHEDULED';
  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a SCHEDULED transplant can be cancelled';
  END IF;
END$$

-- ---------------------------------------------------------------------
-- Cancel a request: cancel its transplant, release its sample, reject
-- remaining candidates, close the request. One TRANSACTION.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_cancel_request(IN p_request_id INT UNSIGNED, IN p_remarks VARCHAR(255))
BEGIN
  DECLARE v_status VARCHAR(10);
  DECLARE v_sample INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
    SELECT request_status INTO v_status FROM transplant_request WHERE request_id = p_request_id FOR UPDATE;
    IF v_status IS NULL OR v_status NOT IN ('PENDING','APPROVED','ALLOCATED') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an open request can be cancelled';
    END IF;

    IF v_status = 'ALLOCATED' THEN
      UPDATE transplant SET transplant_status = 'CANCELLED', remarks = p_remarks
       WHERE request_id = p_request_id AND transplant_status = 'SCHEDULED';
      SELECT sample_id INTO v_sample FROM request_sample
       WHERE request_id = p_request_id AND selection_status = 'ALLOCATED';
      UPDATE request_sample SET selection_status = 'RELEASED'
       WHERE request_id = p_request_id AND sample_id = v_sample;
    END IF;

    UPDATE request_sample SET selection_status = 'REJECTED'
     WHERE request_id = p_request_id AND selection_status = 'CANDIDATE';

    UPDATE transplant_request SET request_status = 'CANCELLED',
           review_remarks = COALESCE(p_remarks, review_remarks)
     WHERE request_id = p_request_id;
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- CURSOR demo: available samples expiring within p_days, classified
-- row by row into an action priority.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_expiring_samples_report(IN p_days INT)
BEGIN
  DECLARE v_done TINYINT DEFAULT 0;
  DECLARE v_sample INT UNSIGNED;
  DECLARE v_type VARCHAR(12);
  DECLARE v_hospital VARCHAR(150);
  DECLARE v_days INT;

  DECLARE cur_expiring CURSOR FOR
    SELECT sample_id, sample_type, hospital_name, days_to_expiry
      FROM v_available_samples
     WHERE days_to_expiry BETWEEN 0 AND p_days
     ORDER BY days_to_expiry;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  DROP TEMPORARY TABLE IF EXISTS tmp_expiry_report;
  CREATE TEMPORARY TABLE tmp_expiry_report (
    sample_id INT UNSIGNED, sample_type VARCHAR(12), hospital_name VARCHAR(150),
    days_left INT, priority VARCHAR(10), action_note VARCHAR(80));

  OPEN cur_expiring;
  read_loop: LOOP
    FETCH cur_expiring INTO v_sample, v_type, v_hospital, v_days;
    IF v_done = 1 THEN LEAVE read_loop; END IF;

    INSERT INTO tmp_expiry_report VALUES (
      v_sample, v_type, v_hospital, v_days,
      CASE WHEN v_days <= 7 THEN 'IMMEDIATE' WHEN v_days <= 30 THEN 'HIGH' ELSE 'PLANNED' END,
      CASE WHEN v_days <= 7 THEN 'Offer to open requests now or plan disposal'
           WHEN v_days <= 30 THEN 'Prioritise in matching this month'
           ELSE 'Review at next inventory meeting' END);
  END LOOP;
  CLOSE cur_expiring;

  SELECT * FROM tmp_expiry_report;
  DROP TEMPORARY TABLE IF EXISTS tmp_expiry_report;
END$$

-- ---------------------------------------------------------------------
-- Daily maintenance: expire samples and consents whose date has passed
-- p_report = 1 returns the counts (use 0 from the scheduled event)
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_daily_maintenance(IN p_report TINYINT)
BEGIN
  DECLARE v_samples, v_consents INT DEFAULT 0;

  UPDATE stem_cell_sample SET availability_status = 'EXPIRED'
   WHERE availability_status IN ('NOT_AVAILABLE','AVAILABLE')
     AND expiry_date IS NOT NULL AND expiry_date < CURDATE();
  SET v_samples = ROW_COUNT();

  UPDATE consent SET status = 'EXPIRED'
   WHERE status = 'ACTIVE' AND valid_until IS NOT NULL AND valid_until < CURDATE();
  SET v_consents = ROW_COUNT();

  IF p_report = 1 THEN
    SELECT v_samples AS samples_expired, v_consents AS consents_expired;
  END IF;
END$$

DELIMITER ;

-- Runs every night at 01:00 (requires event_scheduler = ON, the MySQL 8 default)
CREATE EVENT ev_daily_maintenance
  ON SCHEDULE EVERY 1 DAY STARTS (CURRENT_DATE + INTERVAL 1 DAY + INTERVAL 1 HOUR)
  DO CALL sp_daily_maintenance(0);
