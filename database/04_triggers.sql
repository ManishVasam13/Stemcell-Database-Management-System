-- =====================================================================
--  StemVault – 04_triggers.sql
--  Business rules that CHECK constraints cannot express, status
--  cascades, and automatic audit logging.
--
--  Audit user: the application sets  SET @app_user_id = <user_id>;
--  on its connection before writing. Triggers read that variable.
-- =====================================================================
USE stemvault;

DROP PROCEDURE IF EXISTS sp_write_audit;

DROP TRIGGER IF EXISTS trg_donor_bi;
DROP TRIGGER IF EXISTS trg_donor_bu;
DROP TRIGGER IF EXISTS trg_patient_bi;
DROP TRIGGER IF EXISTS trg_patient_bu;
DROP TRIGGER IF EXISTS trg_doctor_bi;
DROP TRIGGER IF EXISTS trg_doctor_bu;
DROP TRIGGER IF EXISTS trg_sample_bi;
DROP TRIGGER IF EXISTS trg_sample_bu;
DROP TRIGGER IF EXISTS trg_sample_ai;
DROP TRIGGER IF EXISTS trg_sample_au;
DROP TRIGGER IF EXISTS trg_sample_ad;
DROP TRIGGER IF EXISTS trg_test_bi;
DROP TRIGGER IF EXISTS trg_test_ai;
DROP TRIGGER IF EXISTS trg_test_au;
DROP TRIGGER IF EXISTS trg_consent_bi;
DROP TRIGGER IF EXISTS trg_consent_bu;
DROP TRIGGER IF EXISTS trg_consent_ai;
DROP TRIGGER IF EXISTS trg_consent_au;
DROP TRIGGER IF EXISTS trg_consent_ad;
DROP TRIGGER IF EXISTS trg_request_bi;
DROP TRIGGER IF EXISTS trg_request_bu;
DROP TRIGGER IF EXISTS trg_request_ai;
DROP TRIGGER IF EXISTS trg_request_au;
DROP TRIGGER IF EXISTS trg_request_ad;
DROP TRIGGER IF EXISTS trg_rs_bi;
DROP TRIGGER IF EXISTS trg_rs_bu;
DROP TRIGGER IF EXISTS trg_rs_ai;
DROP TRIGGER IF EXISTS trg_rs_au;
DROP TRIGGER IF EXISTS trg_rs_ad;
DROP TRIGGER IF EXISTS trg_transplant_bi;
DROP TRIGGER IF EXISTS trg_transplant_bu;
DROP TRIGGER IF EXISTS trg_transplant_ai;
DROP TRIGGER IF EXISTS trg_transplant_au;
DROP TRIGGER IF EXISTS trg_transplant_ad;
DROP TRIGGER IF EXISTS trg_audit_bu;
DROP TRIGGER IF EXISTS trg_audit_bd;

DELIMITER $$

-- ---------------------------------------------------------------------
-- Helper used by every audit trigger
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_write_audit(IN p_action VARCHAR(6), IN p_table VARCHAR(40),
                                IN p_record VARCHAR(40), IN p_old JSON, IN p_new JSON)
BEGIN
  INSERT INTO audit_log (user_id, action, table_name, record_id, old_value, new_value)
  VALUES (@app_user_id, p_action, p_table, p_record, p_old, p_new);
END$$

-- =====================================================================
-- Role consistency: a donor/patient/doctor row may only link to a user
-- account that has the matching role.
-- =====================================================================
CREATE TRIGGER trg_donor_bi BEFORE INSERT ON donor FOR EACH ROW
BEGIN
  IF NEW.user_id IS NOT NULL AND fn_user_role(NEW.user_id) <> 'DONOR' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linked user account must have role DONOR';
  END IF;
  IF NEW.date_of_birth > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Date of birth cannot be in the future';
  END IF;
END$$

CREATE TRIGGER trg_donor_bu BEFORE UPDATE ON donor FOR EACH ROW
BEGIN
  IF NEW.user_id IS NOT NULL AND NOT (NEW.user_id <=> OLD.user_id)
     AND fn_user_role(NEW.user_id) <> 'DONOR' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linked user account must have role DONOR';
  END IF;
END$$

CREATE TRIGGER trg_patient_bi BEFORE INSERT ON patient FOR EACH ROW
BEGIN
  IF NEW.user_id IS NOT NULL AND fn_user_role(NEW.user_id) <> 'PATIENT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linked user account must have role PATIENT';
  END IF;
  IF NEW.date_of_birth > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Date of birth cannot be in the future';
  END IF;
END$$

CREATE TRIGGER trg_patient_bu BEFORE UPDATE ON patient FOR EACH ROW
BEGIN
  IF NEW.user_id IS NOT NULL AND NOT (NEW.user_id <=> OLD.user_id)
     AND fn_user_role(NEW.user_id) <> 'PATIENT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linked user account must have role PATIENT';
  END IF;
END$$

CREATE TRIGGER trg_doctor_bi BEFORE INSERT ON doctor FOR EACH ROW
BEGIN
  IF fn_user_role(NEW.user_id) <> 'DOCTOR' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linked user account must have role DOCTOR';
  END IF;
  IF (SELECT status FROM hospital WHERE hospital_id = NEW.hospital_id) <> 'ACTIVE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Doctors can only be added to an ACTIVE hospital';
  END IF;
END$$

CREATE TRIGGER trg_doctor_bu BEFORE UPDATE ON doctor FOR EACH ROW
BEGIN
  IF NEW.user_id <> OLD.user_id AND fn_user_role(NEW.user_id) <> 'DOCTOR' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linked user account must have role DOCTOR';
  END IF;
END$$

-- =====================================================================
-- StemCellSample
-- =====================================================================
CREATE TRIGGER trg_sample_bi BEFORE INSERT ON stem_cell_sample FOR EACH ROW
BEGIN
  IF (SELECT status FROM donor WHERE donor_id = NEW.donor_id) <> 'ACTIVE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Samples can only be collected from an ACTIVE donor';
  END IF;
  IF fn_has_active_consent(NEW.donor_id, 'COLLECTION') = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donor has no active COLLECTION consent';
  END IF;
  IF NEW.collection_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Collection date cannot be in the future';
  END IF;
  IF NEW.processing_status IN ('RELEASED','REJECTED') OR NEW.availability_status <> 'NOT_AVAILABLE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A new sample must start as not available and not released';
  END IF;
  IF NEW.location_id IS NOT NULL THEN
    IF (SELECT current_status FROM storage_location WHERE location_id = NEW.location_id) <> 'OPERATIONAL' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Storage unit is not operational';
    END IF;
    IF fn_location_free_slots(NEW.location_id) <= 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Storage unit is full';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_sample_bu BEFORE UPDATE ON stem_cell_sample FOR EACH ROW
BEGIN
  DECLARE v_ok TINYINT DEFAULT 0;

  IF NEW.donor_id <> OLD.donor_id OR NEW.sample_type <> OLD.sample_type THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donor and sample type of a sample cannot be changed';
  END IF;

  -- a rejected sample is discarded and leaves storage automatically
  IF NEW.processing_status = 'REJECTED' AND OLD.processing_status <> 'REJECTED' THEN
    IF OLD.availability_status IN ('ALLOCATED','TRANSPLANTED') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An allocated or transplanted sample cannot be rejected';
    END IF;
    SET NEW.availability_status = 'DISCARDED';
  END IF;

  -- processing lifecycle: forward only
  IF NEW.processing_status <> OLD.processing_status THEN
    SET v_ok = CASE OLD.processing_status
      WHEN 'COLLECTED'  THEN NEW.processing_status IN ('PROCESSING','QUARANTINE','RELEASED','REJECTED')
      WHEN 'PROCESSING' THEN NEW.processing_status IN ('QUARANTINE','RELEASED','REJECTED')
      WHEN 'QUARANTINE' THEN NEW.processing_status IN ('RELEASED','REJECTED')
      WHEN 'RELEASED'   THEN NEW.processing_status IN ('REJECTED')
      ELSE 0 END;
    IF v_ok = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid processing status transition';
    END IF;
    IF NEW.processing_status = 'RELEASED' AND fn_sample_tests_passed(NEW.sample_id) = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'All mandatory tests must pass before release';
    END IF;
  END IF;

  -- availability lifecycle
  IF NEW.availability_status <> OLD.availability_status THEN
    SET v_ok = CASE OLD.availability_status
      WHEN 'NOT_AVAILABLE' THEN NEW.availability_status IN ('AVAILABLE','EXPIRED','DISCARDED')
      WHEN 'AVAILABLE'     THEN NEW.availability_status IN ('NOT_AVAILABLE','ALLOCATED','EXPIRED','DISCARDED')
      WHEN 'ALLOCATED'     THEN NEW.availability_status IN ('AVAILABLE','NOT_AVAILABLE','EXPIRED','TRANSPLANTED')
      WHEN 'EXPIRED'       THEN NEW.availability_status IN ('DISCARDED')
      ELSE 0 END;
    IF v_ok = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid availability status transition';
    END IF;

    IF NEW.availability_status = 'AVAILABLE' THEN
      IF NEW.expiry_date IS NOT NULL AND NEW.expiry_date < CURDATE() THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An expired sample cannot be made available';
      END IF;
      IF (SELECT status FROM donor WHERE donor_id = NEW.donor_id) <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donor is not ACTIVE';
      END IF;
      IF fn_has_active_consent(NEW.donor_id, 'STORAGE') = 0
         OR fn_has_active_consent(NEW.donor_id, 'CLINICAL_USE') = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donor needs active STORAGE and CLINICAL_USE consent';
      END IF;
    END IF;

    -- a transplanted or discarded unit leaves storage
    IF NEW.availability_status IN ('TRANSPLANTED','DISCARDED') THEN
      SET NEW.location_id = NULL, NEW.storage_position = NULL;
    END IF;
  END IF;

  -- moving into a storage unit: must be operational and have space
  IF NEW.location_id IS NOT NULL AND NOT (NEW.location_id <=> OLD.location_id) THEN
    IF (SELECT current_status FROM storage_location WHERE location_id = NEW.location_id) <> 'OPERATIONAL' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Storage unit is not operational';
    END IF;
    IF fn_location_free_slots(NEW.location_id) <= 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Storage unit is full';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_sample_ai AFTER INSERT ON stem_cell_sample FOR EACH ROW
  CALL sp_write_audit('INSERT', 'stem_cell_sample', NEW.sample_id, NULL,
    JSON_OBJECT('donor_id', NEW.donor_id, 'sample_type', NEW.sample_type,
                'collection_date', NEW.collection_date, 'volume_ml', NEW.volume_ml,
                'processing_status', NEW.processing_status,
                'availability_status', NEW.availability_status, 'expiry_date', NEW.expiry_date))$$

CREATE TRIGGER trg_sample_au AFTER UPDATE ON stem_cell_sample FOR EACH ROW
  CALL sp_write_audit('UPDATE', 'stem_cell_sample', NEW.sample_id,
    JSON_OBJECT('location_id', OLD.location_id, 'storage_position', OLD.storage_position,
                'processing_status', OLD.processing_status,
                'availability_status', OLD.availability_status, 'expiry_date', OLD.expiry_date),
    JSON_OBJECT('location_id', NEW.location_id, 'storage_position', NEW.storage_position,
                'processing_status', NEW.processing_status,
                'availability_status', NEW.availability_status, 'expiry_date', NEW.expiry_date))$$

CREATE TRIGGER trg_sample_ad AFTER DELETE ON stem_cell_sample FOR EACH ROW
  CALL sp_write_audit('DELETE', 'stem_cell_sample', OLD.sample_id,
    JSON_OBJECT('donor_id', OLD.donor_id, 'sample_type', OLD.sample_type,
                'availability_status', OLD.availability_status), NULL)$$

-- =====================================================================
-- SampleTest
-- =====================================================================
CREATE TRIGGER trg_test_bi BEFORE INSERT ON sample_test FOR EACH ROW
BEGIN
  IF fn_user_role(NEW.performed_by) NOT IN ('BANK_STAFF','ADMIN') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tests must be performed by bank staff';
  END IF;
  IF (SELECT availability_status FROM stem_cell_sample WHERE sample_id = NEW.sample_id)
       IN ('TRANSPLANTED','DISCARDED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot test a transplanted or discarded sample';
  END IF;
END$$

-- a failed mandatory test rejects the sample automatically
CREATE TRIGGER trg_test_ai AFTER INSERT ON sample_test FOR EACH ROW
BEGIN
  IF NEW.test_status = 'FAILED' AND NEW.test_type <> 'CD34_COUNT' THEN
    UPDATE stem_cell_sample SET processing_status = 'REJECTED'
     WHERE sample_id = NEW.sample_id
       AND processing_status <> 'REJECTED'
       AND availability_status IN ('NOT_AVAILABLE','AVAILABLE');
  END IF;
END$$

CREATE TRIGGER trg_test_au AFTER UPDATE ON sample_test FOR EACH ROW
BEGIN
  IF NEW.test_status = 'FAILED' AND OLD.test_status <> 'FAILED' AND NEW.test_type <> 'CD34_COUNT' THEN
    UPDATE stem_cell_sample SET processing_status = 'REJECTED'
     WHERE sample_id = NEW.sample_id
       AND processing_status <> 'REJECTED'
       AND availability_status IN ('NOT_AVAILABLE','AVAILABLE');
  END IF;
END$$

-- =====================================================================
-- Consent
-- =====================================================================
CREATE TRIGGER trg_consent_bi BEFORE INSERT ON consent FOR EACH ROW
BEGIN
  IF NEW.status <> 'ACTIVE' OR NEW.revoked_on IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A new consent must be ACTIVE';
  END IF;
  IF NEW.consent_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Consent date cannot be in the future';
  END IF;
END$$

CREATE TRIGGER trg_consent_bu BEFORE UPDATE ON consent FOR EACH ROW
BEGIN
  IF OLD.status IN ('REVOKED','EXPIRED') AND NEW.status = 'ACTIVE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A revoked or expired consent cannot be re-activated; record a new consent';
  END IF;
  IF NEW.donor_id <> OLD.donor_id OR NEW.consent_type <> OLD.consent_type THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donor and type of a consent cannot be changed';
  END IF;
END$$

CREATE TRIGGER trg_consent_ai AFTER INSERT ON consent FOR EACH ROW
  CALL sp_write_audit('INSERT', 'consent', NEW.consent_id, NULL,
    JSON_OBJECT('donor_id', NEW.donor_id, 'consent_type', NEW.consent_type,
                'consent_date', NEW.consent_date, 'valid_until', NEW.valid_until,
                'status', NEW.status))$$

-- losing STORAGE or CLINICAL_USE consent withdraws the donor's available samples
CREATE TRIGGER trg_consent_au AFTER UPDATE ON consent FOR EACH ROW
BEGIN
  IF NEW.status <> 'ACTIVE' AND OLD.status = 'ACTIVE'
     AND NEW.consent_type IN ('STORAGE','CLINICAL_USE')
     AND fn_has_active_consent(NEW.donor_id, NEW.consent_type) = 0 THEN
    UPDATE stem_cell_sample SET availability_status = 'NOT_AVAILABLE'
     WHERE donor_id = NEW.donor_id AND availability_status = 'AVAILABLE';
  END IF;
  CALL sp_write_audit('UPDATE', 'consent', NEW.consent_id,
    JSON_OBJECT('status', OLD.status, 'valid_until', OLD.valid_until, 'revoked_on', OLD.revoked_on),
    JSON_OBJECT('status', NEW.status, 'valid_until', NEW.valid_until, 'revoked_on', NEW.revoked_on,
                'revocation_reason', NEW.revocation_reason));
END$$

CREATE TRIGGER trg_consent_ad AFTER DELETE ON consent FOR EACH ROW
  CALL sp_write_audit('DELETE', 'consent', OLD.consent_id,
    JSON_OBJECT('donor_id', OLD.donor_id, 'consent_type', OLD.consent_type, 'status', OLD.status), NULL)$$

-- =====================================================================
-- TransplantRequest
-- =====================================================================
CREATE TRIGGER trg_request_bi BEFORE INSERT ON transplant_request FOR EACH ROW
BEGIN
  IF (SELECT status FROM patient WHERE patient_id = NEW.patient_id) <> 'ACTIVE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Patient is not ACTIVE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM doctor d JOIN hospital h ON h.hospital_id = d.hospital_id
                  WHERE d.doctor_id = NEW.doctor_id AND d.status = 'ACTIVE' AND h.status = 'ACTIVE') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Requesting doctor and hospital must be ACTIVE';
  END IF;
  IF NEW.request_status <> 'PENDING' OR NEW.reviewed_by IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A new request must start as PENDING and unreviewed';
  END IF;
  IF EXISTS (SELECT 1 FROM transplant_request
              WHERE patient_id = NEW.patient_id
                AND request_status IN ('PENDING','APPROVED','ALLOCATED')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Patient already has an open transplant request';
  END IF;
END$$

CREATE TRIGGER trg_request_bu BEFORE UPDATE ON transplant_request FOR EACH ROW
BEGIN
  DECLARE v_ok TINYINT DEFAULT 1;

  IF NEW.patient_id <> OLD.patient_id OR NEW.doctor_id <> OLD.doctor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Patient and doctor of a request cannot be changed';
  END IF;

  IF NEW.request_status <> OLD.request_status THEN
    SET v_ok = CASE OLD.request_status
      WHEN 'PENDING'   THEN NEW.request_status IN ('APPROVED','REJECTED','CANCELLED')
      WHEN 'APPROVED'  THEN NEW.request_status IN ('ALLOCATED','CANCELLED')
      WHEN 'ALLOCATED' THEN NEW.request_status IN ('APPROVED','COMPLETED')
      ELSE 0 END;
    IF v_ok = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid request status transition';
    END IF;
    IF OLD.request_status = 'PENDING' AND NEW.request_status IN ('APPROVED','REJECTED') THEN
      IF NEW.reviewed_by IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviewer is required to approve or reject';
      END IF;
      IF NEW.reviewed_at IS NULL THEN
        SET NEW.reviewed_at = NOW();
      END IF;
    END IF;
  END IF;

  IF NEW.reviewed_by IS NOT NULL AND NOT (NEW.reviewed_by <=> OLD.reviewed_by)
     AND fn_user_role(NEW.reviewed_by) NOT IN ('ADMIN','BANK_STAFF') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only ADMIN or BANK_STAFF can review requests';
  END IF;
END$$

CREATE TRIGGER trg_request_ai AFTER INSERT ON transplant_request FOR EACH ROW
  CALL sp_write_audit('INSERT', 'transplant_request', NEW.request_id, NULL,
    JSON_OBJECT('patient_id', NEW.patient_id, 'doctor_id', NEW.doctor_id,
                'required_sample_type', NEW.required_sample_type, 'min_hla_match', NEW.min_hla_match,
                'urgency', NEW.urgency, 'request_status', NEW.request_status))$$

CREATE TRIGGER trg_request_au AFTER UPDATE ON transplant_request FOR EACH ROW
  CALL sp_write_audit('UPDATE', 'transplant_request', NEW.request_id,
    JSON_OBJECT('request_status', OLD.request_status, 'urgency', OLD.urgency,
                'reviewed_by', OLD.reviewed_by, 'review_remarks', OLD.review_remarks),
    JSON_OBJECT('request_status', NEW.request_status, 'urgency', NEW.urgency,
                'reviewed_by', NEW.reviewed_by, 'review_remarks', NEW.review_remarks))$$

CREATE TRIGGER trg_request_ad AFTER DELETE ON transplant_request FOR EACH ROW
  CALL sp_write_audit('DELETE', 'transplant_request', OLD.request_id,
    JSON_OBJECT('patient_id', OLD.patient_id, 'request_status', OLD.request_status), NULL)$$

-- =====================================================================
-- RequestSample (candidate / allocation)
-- =====================================================================
CREATE TRIGGER trg_rs_bi BEFORE INSERT ON request_sample FOR EACH ROW
BEGIN
  DECLARE v_req_status VARCHAR(10);
  DECLARE v_req_type   VARCHAR(12);
  DECLARE v_min_hla    TINYINT;

  SELECT request_status, required_sample_type, min_hla_match
    INTO v_req_status, v_req_type, v_min_hla
    FROM transplant_request WHERE request_id = NEW.request_id;

  IF v_req_status <> 'APPROVED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Candidates can only be added to an APPROVED request';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM stem_cell_sample
                  WHERE sample_id = NEW.sample_id
                    AND availability_status = 'AVAILABLE'
                    AND sample_type = v_req_type
                    AND (expiry_date IS NULL OR expiry_date >= CURDATE())) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sample is not available, expired, or of the wrong type';
  END IF;
  IF NEW.hla_match_score < v_min_hla THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'HLA match score is below the request minimum';
  END IF;
  IF NEW.selection_status <> 'CANDIDATE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A new candidate row must start as CANDIDATE';
  END IF;
END$$

-- prevents allocation of an unavailable sample, and double allocation
CREATE TRIGGER trg_rs_bu BEFORE UPDATE ON request_sample FOR EACH ROW
BEGIN
  DECLARE v_ok TINYINT DEFAULT 1;

  IF NEW.request_id <> OLD.request_id OR NEW.sample_id <> OLD.sample_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Candidate keys cannot be changed';
  END IF;

  IF NEW.selection_status <> OLD.selection_status THEN
    SET v_ok = CASE OLD.selection_status
      WHEN 'CANDIDATE' THEN NEW.selection_status IN ('ALLOCATED','REJECTED')
      WHEN 'ALLOCATED' THEN NEW.selection_status IN ('RELEASED')
      ELSE 0 END;
    IF v_ok = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid candidate status transition';
    END IF;

    IF NEW.selection_status = 'ALLOCATED' THEN
      IF (SELECT request_status FROM transplant_request WHERE request_id = NEW.request_id) <> 'APPROVED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request must be APPROVED and not yet allocated';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM stem_cell_sample
                      WHERE sample_id = NEW.sample_id
                        AND availability_status = 'AVAILABLE'
                        AND (expiry_date IS NULL OR expiry_date >= CURDATE())) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot allocate: sample is not available';
      END IF;
      SET NEW.allocation_date = NOW();
    END IF;

    IF NEW.selection_status = 'RELEASED' AND EXISTS (
         SELECT 1 FROM transplant WHERE request_id = NEW.request_id AND sample_id = NEW.sample_id
            AND transplant_status IN ('SCHEDULED','COMPLETED')) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancel the scheduled transplant before releasing the sample';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_rs_ai AFTER INSERT ON request_sample FOR EACH ROW
  CALL sp_write_audit('INSERT', 'request_sample', CONCAT(NEW.request_id, ':', NEW.sample_id), NULL,
    JSON_OBJECT('hla_match_score', NEW.hla_match_score, 'search_tier', NEW.search_tier,
                'selection_status', NEW.selection_status))$$

-- status cascade: allocation locks the sample and the request
CREATE TRIGGER trg_rs_au AFTER UPDATE ON request_sample FOR EACH ROW
BEGIN
  DECLARE v_donor INT UNSIGNED;
  DECLARE v_expiry DATE;

  IF NEW.selection_status = 'ALLOCATED' AND OLD.selection_status <> 'ALLOCATED' THEN
    UPDATE stem_cell_sample   SET availability_status = 'ALLOCATED' WHERE sample_id  = NEW.sample_id;
    UPDATE transplant_request SET request_status      = 'ALLOCATED' WHERE request_id = NEW.request_id;
  END IF;

  IF NEW.selection_status = 'RELEASED' AND OLD.selection_status = 'ALLOCATED' THEN
    SELECT donor_id, expiry_date INTO v_donor, v_expiry
      FROM stem_cell_sample WHERE sample_id = NEW.sample_id;
    UPDATE stem_cell_sample
       SET availability_status = CASE
             WHEN v_expiry IS NOT NULL AND v_expiry < CURDATE() THEN 'EXPIRED'
             WHEN fn_has_active_consent(v_donor, 'STORAGE') = 0
               OR fn_has_active_consent(v_donor, 'CLINICAL_USE') = 0 THEN 'NOT_AVAILABLE'
             ELSE 'AVAILABLE' END
     WHERE sample_id = NEW.sample_id AND availability_status = 'ALLOCATED';
    UPDATE transplant_request SET request_status = 'APPROVED'
     WHERE request_id = NEW.request_id AND request_status = 'ALLOCATED';
  END IF;

  CALL sp_write_audit('UPDATE', 'request_sample', CONCAT(NEW.request_id, ':', NEW.sample_id),
    JSON_OBJECT('selection_status', OLD.selection_status, 'allocation_date', OLD.allocation_date),
    JSON_OBJECT('selection_status', NEW.selection_status, 'allocation_date', NEW.allocation_date));
END$$

CREATE TRIGGER trg_rs_ad AFTER DELETE ON request_sample FOR EACH ROW
  CALL sp_write_audit('DELETE', 'request_sample', CONCAT(OLD.request_id, ':', OLD.sample_id),
    JSON_OBJECT('hla_match_score', OLD.hla_match_score, 'selection_status', OLD.selection_status), NULL)$$

-- =====================================================================
-- Transplant
-- =====================================================================
CREATE TRIGGER trg_transplant_bi BEFORE INSERT ON transplant FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM request_sample
                  WHERE request_id = NEW.request_id AND sample_id = NEW.sample_id
                    AND selection_status = 'ALLOCATED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transplant requires the sample to be ALLOCATED to this request';
  END IF;
  IF NEW.transplant_date < (SELECT DATE(request_date) FROM transplant_request WHERE request_id = NEW.request_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transplant date cannot be before the request date';
  END IF;
  IF NEW.transplant_status <> 'SCHEDULED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A new transplant must start as SCHEDULED';
  END IF;
END$$

CREATE TRIGGER trg_transplant_bu BEFORE UPDATE ON transplant FOR EACH ROW
BEGIN
  DECLARE v_ok TINYINT DEFAULT 1;
  IF NEW.request_id <> OLD.request_id OR NEW.sample_id <> OLD.sample_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request and sample of a transplant cannot be changed';
  END IF;
  IF NEW.transplant_status <> OLD.transplant_status THEN
    SET v_ok = CASE OLD.transplant_status
      WHEN 'SCHEDULED' THEN NEW.transplant_status IN ('COMPLETED','CANCELLED')
      WHEN 'CANCELLED' THEN NEW.transplant_status IN ('SCHEDULED')
      ELSE 0 END;
    IF v_ok = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid transplant status transition';
    END IF;
    IF NEW.transplant_status = 'COMPLETED' AND NEW.transplant_date > CURDATE() THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A transplant dated in the future cannot be completed';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_transplant_ai AFTER INSERT ON transplant FOR EACH ROW
  CALL sp_write_audit('INSERT', 'transplant', NEW.transplant_id, NULL,
    JSON_OBJECT('request_id', NEW.request_id, 'sample_id', NEW.sample_id,
                'transplant_date', NEW.transplant_date, 'transplant_status', NEW.transplant_status))$$

-- completion consumes the sample and closes the request
CREATE TRIGGER trg_transplant_au AFTER UPDATE ON transplant FOR EACH ROW
BEGIN
  IF NEW.transplant_status = 'COMPLETED' AND OLD.transplant_status <> 'COMPLETED' THEN
    UPDATE stem_cell_sample   SET availability_status = 'TRANSPLANTED' WHERE sample_id  = NEW.sample_id;
    UPDATE transplant_request SET request_status      = 'COMPLETED'    WHERE request_id = NEW.request_id;
  END IF;
  CALL sp_write_audit('UPDATE', 'transplant', NEW.transplant_id,
    JSON_OBJECT('transplant_status', OLD.transplant_status, 'outcome', OLD.outcome,
                'transplant_date', OLD.transplant_date),
    JSON_OBJECT('transplant_status', NEW.transplant_status, 'outcome', NEW.outcome,
                'transplant_date', NEW.transplant_date, 'remarks', NEW.remarks));
END$$

CREATE TRIGGER trg_transplant_ad AFTER DELETE ON transplant FOR EACH ROW
  CALL sp_write_audit('DELETE', 'transplant', OLD.transplant_id,
    JSON_OBJECT('request_id', OLD.request_id, 'sample_id', OLD.sample_id,
                'transplant_status', OLD.transplant_status), NULL)$$

-- =====================================================================
-- AuditLog is append-only
-- =====================================================================
CREATE TRIGGER trg_audit_bu BEFORE UPDATE ON audit_log FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit log is append-only: updates are not allowed'$$

CREATE TRIGGER trg_audit_bd BEFORE DELETE ON audit_log FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit log is append-only: deletes are not allowed'$$

DELIMITER ;
