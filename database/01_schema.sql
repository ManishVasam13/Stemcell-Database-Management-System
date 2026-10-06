-- =====================================================================
--  StemVault – Stem Cell Bank Management System
--  01_schema.sql : database, 13 tables, keys, constraints, indexes
--  Target: MySQL 8.0.16+ (CHECK constraints enforced)
--
--  Physical table names are lowercase snake_case so the scripts behave
--  the same on Windows (case-insensitive) and Linux (case-sensitive):
--    User -> `user`, StemCellSample -> stem_cell_sample, ...
-- =====================================================================

DROP DATABASE IF EXISTS stemvault;
CREATE DATABASE stemvault CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE stemvault;

-- ---------------------------------------------------------------------
-- 1. User : login identity + role
-- ---------------------------------------------------------------------
CREATE TABLE `user` (
  user_id        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  username       VARCHAR(50)   NOT NULL,
  password_hash  VARCHAR(255)  NOT NULL,
  role           VARCHAR(12)   NOT NULL,
  status         VARCHAR(10)   NOT NULL DEFAULT 'ACTIVE',
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_user PRIMARY KEY (user_id),
  CONSTRAINT uq_user_username UNIQUE (username),
  CONSTRAINT chk_user_username_len CHECK (CHAR_LENGTH(username) >= 4),
  CONSTRAINT chk_user_role   CHECK (role IN ('ADMIN','BANK_STAFF','DOCTOR','DONOR','PATIENT')),
  CONSTRAINT chk_user_status CHECK (status IN ('ACTIVE','INACTIVE','LOCKED'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. Donor
-- ---------------------------------------------------------------------
CREATE TABLE donor (
  donor_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NULL,
  full_name         VARCHAR(100) NOT NULL,
  date_of_birth     DATE         NOT NULL,
  gender            CHAR(1)      NOT NULL,
  blood_group       VARCHAR(3)   NOT NULL,
  hla_a_1           VARCHAR(12)  NULL,
  hla_a_2           VARCHAR(12)  NULL,
  hla_b_1           VARCHAR(12)  NULL,
  hla_b_2           VARCHAR(12)  NULL,
  hla_drb1_1        VARCHAR(12)  NULL,
  hla_drb1_2        VARCHAR(12)  NULL,
  phone             VARCHAR(15)  NOT NULL,
  email             VARCHAR(100) NULL,
  address           VARCHAR(255) NULL,
  registration_date DATE         NOT NULL DEFAULT (CURRENT_DATE),
  status            VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT pk_donor PRIMARY KEY (donor_id),
  CONSTRAINT uq_donor_user  UNIQUE (user_id),
  CONSTRAINT uq_donor_email UNIQUE (email),
  CONSTRAINT uq_donor_identity UNIQUE (full_name, date_of_birth, phone),
  CONSTRAINT fk_donor_user FOREIGN KEY (user_id) REFERENCES `user`(user_id)
      ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_donor_gender CHECK (gender IN ('M','F','O')),
  CONSTRAINT chk_donor_bg CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  CONSTRAINT chk_donor_status CHECK (status IN ('ACTIVE','DEFERRED','WITHDRAWN')),
  CONSTRAINT chk_donor_reg_after_dob CHECK (registration_date >= date_of_birth),
  CONSTRAINT chk_donor_hla_complete CHECK (
      (hla_a_1 IS NULL AND hla_a_2 IS NULL AND hla_b_1 IS NULL AND hla_b_2 IS NULL
        AND hla_drb1_1 IS NULL AND hla_drb1_2 IS NULL)
   OR (hla_a_1 IS NOT NULL AND hla_a_2 IS NOT NULL AND hla_b_1 IS NOT NULL AND hla_b_2 IS NOT NULL
        AND hla_drb1_1 IS NOT NULL AND hla_drb1_2 IS NOT NULL))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. Patient
-- ---------------------------------------------------------------------
CREATE TABLE patient (
  patient_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NULL,
  full_name         VARCHAR(100) NOT NULL,
  date_of_birth     DATE         NOT NULL,
  gender            CHAR(1)      NOT NULL,
  blood_group       VARCHAR(3)   NOT NULL,
  hla_a_1           VARCHAR(12)  NULL,
  hla_a_2           VARCHAR(12)  NULL,
  hla_b_1           VARCHAR(12)  NULL,
  hla_b_2           VARCHAR(12)  NULL,
  hla_drb1_1        VARCHAR(12)  NULL,
  hla_drb1_2        VARCHAR(12)  NULL,
  diagnosis         VARCHAR(150) NOT NULL,
  phone             VARCHAR(15)  NOT NULL,
  email             VARCHAR(100) NULL,
  address           VARCHAR(255) NULL,
  registration_date DATE         NOT NULL DEFAULT (CURRENT_DATE),
  status            VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT pk_patient PRIMARY KEY (patient_id),
  CONSTRAINT uq_patient_user  UNIQUE (user_id),
  CONSTRAINT uq_patient_email UNIQUE (email),
  CONSTRAINT uq_patient_identity UNIQUE (full_name, date_of_birth, phone),
  CONSTRAINT fk_patient_user FOREIGN KEY (user_id) REFERENCES `user`(user_id)
      ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_patient_gender CHECK (gender IN ('M','F','O')),
  CONSTRAINT chk_patient_bg CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  CONSTRAINT chk_patient_status CHECK (status IN ('ACTIVE','INACTIVE','DECEASED')),
  CONSTRAINT chk_patient_reg_after_dob CHECK (registration_date >= date_of_birth),
  CONSTRAINT chk_patient_hla_complete CHECK (
      (hla_a_1 IS NULL AND hla_a_2 IS NULL AND hla_b_1 IS NULL AND hla_b_2 IS NULL
        AND hla_drb1_1 IS NULL AND hla_drb1_2 IS NULL)
   OR (hla_a_1 IS NOT NULL AND hla_a_2 IS NOT NULL AND hla_b_1 IS NOT NULL AND hla_b_2 IS NOT NULL
        AND hla_drb1_1 IS NOT NULL AND hla_drb1_2 IS NOT NULL))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. Hospital (also the geographic anchor: district / state)
-- ---------------------------------------------------------------------
CREATE TABLE hospital (
  hospital_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hospital_name   VARCHAR(150) NOT NULL,
  registration_no VARCHAR(30)  NOT NULL,
  address_line    VARCHAR(255) NOT NULL,
  city            VARCHAR(60)  NOT NULL,
  district        VARCHAR(60)  NOT NULL,
  state           VARCHAR(60)  NOT NULL,
  pincode         CHAR(6)      NOT NULL,
  phone           VARCHAR(15)  NOT NULL,
  email           VARCHAR(100) NOT NULL,
  registered_on   DATE         NOT NULL,
  status          VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT pk_hospital PRIMARY KEY (hospital_id),
  CONSTRAINT uq_hospital_regno UNIQUE (registration_no),
  CONSTRAINT uq_hospital_email UNIQUE (email),
  CONSTRAINT chk_hospital_pincode CHECK (REGEXP_LIKE(pincode, '^[1-9][0-9]{5}$')),
  CONSTRAINT chk_hospital_status CHECK (status IN ('ACTIVE','SUSPENDED','INACTIVE'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. Doctor
-- ---------------------------------------------------------------------
CREATE TABLE doctor (
  doctor_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  hospital_id    INT UNSIGNED NOT NULL,
  full_name      VARCHAR(100) NOT NULL,
  specialization VARCHAR(80)  NOT NULL,
  medical_reg_no VARCHAR(30)  NOT NULL,
  phone          VARCHAR(15)  NOT NULL,
  email          VARCHAR(100) NULL,
  status         VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT pk_doctor PRIMARY KEY (doctor_id),
  CONSTRAINT uq_doctor_user  UNIQUE (user_id),
  CONSTRAINT uq_doctor_regno UNIQUE (medical_reg_no),
  CONSTRAINT uq_doctor_email UNIQUE (email),
  CONSTRAINT fk_doctor_user FOREIGN KEY (user_id) REFERENCES `user`(user_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_doctor_hospital FOREIGN KEY (hospital_id) REFERENCES hospital(hospital_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_doctor_status CHECK (status IN ('ACTIVE','ON_LEAVE','INACTIVE'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. StorageLocation (created before samples, which reference it)
-- ---------------------------------------------------------------------
CREATE TABLE storage_location (
  location_id    INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  hospital_id    INT UNSIGNED      NOT NULL,
  location_code  VARCHAR(20)       NOT NULL,
  storage_area   VARCHAR(60)       NOT NULL,
  storage_type   VARCHAR(12)       NOT NULL,
  capacity       SMALLINT UNSIGNED NOT NULL,
  current_status VARCHAR(14)       NOT NULL DEFAULT 'OPERATIONAL',
  CONSTRAINT pk_storage_location PRIMARY KEY (location_id),
  CONSTRAINT uq_storage_code UNIQUE (location_code),
  CONSTRAINT fk_storage_hospital FOREIGN KEY (hospital_id) REFERENCES hospital(hospital_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_storage_type CHECK (storage_type IN ('LN2_LIQUID','LN2_VAPOUR','ULT_FREEZER')),
  CONSTRAINT chk_storage_capacity CHECK (capacity > 0),
  CONSTRAINT chk_storage_status CHECK (current_status IN ('OPERATIONAL','MAINTENANCE','DECOMMISSIONED'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. StemCellSample
--    blood_group is NOT stored here: it is derived through donor (3NF)
-- ---------------------------------------------------------------------
CREATE TABLE stem_cell_sample (
  sample_id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  donor_id            INT UNSIGNED  NOT NULL,
  location_id         INT UNSIGNED  NULL,
  storage_position    VARCHAR(20)   NULL,
  sample_type         VARCHAR(12)   NOT NULL,
  collection_date     DATE          NOT NULL,
  volume_ml           DECIMAL(6,2)  NOT NULL,
  cd34_count          DECIMAL(8,2)  NULL,
  processing_status   VARCHAR(12)   NOT NULL DEFAULT 'COLLECTED',
  availability_status VARCHAR(13)   NOT NULL DEFAULT 'NOT_AVAILABLE',
  expiry_date         DATE          NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sample PRIMARY KEY (sample_id),
  CONSTRAINT uq_sample_slot UNIQUE (location_id, storage_position),
  CONSTRAINT fk_sample_donor FOREIGN KEY (donor_id) REFERENCES donor(donor_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
  -- RESTRICT/RESTRICT because location_id appears in CHECK constraints (MySQL rule)
  CONSTRAINT fk_sample_location FOREIGN KEY (location_id) REFERENCES storage_location(location_id)
      ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_sample_type CHECK (sample_type IN ('CORD_BLOOD','BONE_MARROW','PBSC')),
  CONSTRAINT chk_sample_volume CHECK (volume_ml > 0),
  CONSTRAINT chk_sample_cd34 CHECK (cd34_count IS NULL OR cd34_count >= 0),
  CONSTRAINT chk_sample_processing CHECK (processing_status IN
      ('COLLECTED','PROCESSING','QUARANTINE','RELEASED','REJECTED')),
  CONSTRAINT chk_sample_availability CHECK (availability_status IN
      ('NOT_AVAILABLE','AVAILABLE','ALLOCATED','TRANSPLANTED','EXPIRED','DISCARDED')),
  CONSTRAINT chk_sample_expiry CHECK (expiry_date IS NULL OR expiry_date > collection_date),
  CONSTRAINT chk_sample_slot_pair CHECK ((location_id IS NULL) = (storage_position IS NULL)),
  CONSTRAINT chk_sample_available_rule CHECK (availability_status <> 'AVAILABLE'
      OR (processing_status = 'RELEASED' AND location_id IS NOT NULL))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. SampleTest
-- ---------------------------------------------------------------------
CREATE TABLE sample_test (
  test_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sample_id    INT UNSIGNED NOT NULL,
  test_type    VARCHAR(20)  NOT NULL,
  test_date    DATETIME     NOT NULL,
  result       VARCHAR(255) NULL,
  test_status  VARCHAR(12)  NOT NULL DEFAULT 'PENDING',
  remarks      VARCHAR(255) NULL,
  performed_by INT UNSIGNED NOT NULL,
  CONSTRAINT pk_sample_test PRIMARY KEY (test_id),
  CONSTRAINT uq_test_natural UNIQUE (sample_id, test_type, test_date),
  CONSTRAINT fk_test_sample FOREIGN KEY (sample_id) REFERENCES stem_cell_sample(sample_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_test_user FOREIGN KEY (performed_by) REFERENCES `user`(user_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_test_type CHECK (test_type IN
      ('HLA_TYPING','INFECTIOUS_SCREEN','STERILITY','VIABILITY','CD34_COUNT')),
  CONSTRAINT chk_test_status CHECK (test_status IN ('PENDING','PASSED','FAILED','INCONCLUSIVE')),
  CONSTRAINT chk_test_result_required CHECK (test_status = 'PENDING' OR result IS NOT NULL)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 9. Consent
-- ---------------------------------------------------------------------
CREATE TABLE consent (
  consent_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  donor_id          INT UNSIGNED NOT NULL,
  consent_type      VARCHAR(12)  NOT NULL,
  consent_date      DATE         NOT NULL,
  valid_until       DATE         NULL,
  revoked_on        DATE         NULL,
  revocation_reason VARCHAR(255) NULL,
  status            VARCHAR(8)   NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT pk_consent PRIMARY KEY (consent_id),
  CONSTRAINT uq_consent_natural UNIQUE (donor_id, consent_type, consent_date),
  CONSTRAINT fk_consent_donor FOREIGN KEY (donor_id) REFERENCES donor(donor_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_consent_type CHECK (consent_type IN ('COLLECTION','STORAGE','CLINICAL_USE')),
  CONSTRAINT chk_consent_status CHECK (status IN ('ACTIVE','EXPIRED','REVOKED')),
  CONSTRAINT chk_consent_valid CHECK (valid_until IS NULL OR valid_until > consent_date),
  CONSTRAINT chk_consent_revoke_date CHECK (revoked_on IS NULL OR revoked_on >= consent_date),
  CONSTRAINT chk_consent_revoked_pair CHECK ((status = 'REVOKED') = (revoked_on IS NOT NULL)),
  CONSTRAINT chk_consent_reason CHECK (revocation_reason IS NULL OR revoked_on IS NOT NULL)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 10. TransplantRequest
-- ---------------------------------------------------------------------
CREATE TABLE transplant_request (
  request_id           INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  patient_id           INT UNSIGNED     NOT NULL,
  doctor_id            INT UNSIGNED     NOT NULL,
  request_date         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  required_sample_type VARCHAR(12)      NOT NULL,
  min_hla_match        TINYINT UNSIGNED NOT NULL DEFAULT 4,
  urgency              VARCHAR(8)       NOT NULL DEFAULT 'ROUTINE',
  request_status       VARCHAR(10)      NOT NULL DEFAULT 'PENDING',
  reviewed_by          INT UNSIGNED     NULL,
  reviewed_at          DATETIME         NULL,
  review_remarks       VARCHAR(255)     NULL,
  CONSTRAINT pk_request PRIMARY KEY (request_id),
  CONSTRAINT fk_request_patient FOREIGN KEY (patient_id) REFERENCES patient(patient_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_request_doctor FOREIGN KEY (doctor_id) REFERENCES doctor(doctor_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
  -- RESTRICT/RESTRICT because reviewed_by appears in CHECK constraints
  CONSTRAINT fk_request_reviewer FOREIGN KEY (reviewed_by) REFERENCES `user`(user_id)
      ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_request_type CHECK (required_sample_type IN ('CORD_BLOOD','BONE_MARROW','PBSC')),
  CONSTRAINT chk_request_min_hla CHECK (min_hla_match BETWEEN 0 AND 6),
  CONSTRAINT chk_request_urgency CHECK (urgency IN ('ROUTINE','URGENT','CRITICAL')),
  CONSTRAINT chk_request_status CHECK (request_status IN
      ('PENDING','APPROVED','REJECTED','ALLOCATED','COMPLETED','CANCELLED')),
  CONSTRAINT chk_request_review_pair CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CONSTRAINT chk_request_review_after CHECK (reviewed_at IS NULL OR reviewed_at >= request_date),
  CONSTRAINT chk_request_reviewed_states CHECK (request_status IN ('PENDING','CANCELLED')
      OR reviewed_by IS NOT NULL)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 11. RequestSample : associative entity for the M:N
--     TransplantRequest <-> StemCellSample, composite primary key
-- ---------------------------------------------------------------------
CREATE TABLE request_sample (
  request_id       INT UNSIGNED     NOT NULL,
  sample_id        INT UNSIGNED     NOT NULL,
  hla_match_score  TINYINT UNSIGNED NOT NULL,
  search_tier      VARCHAR(13)      NOT NULL,
  selection_status VARCHAR(9)       NOT NULL DEFAULT 'CANDIDATE',
  allocation_date  DATETIME         NULL,
  CONSTRAINT pk_request_sample PRIMARY KEY (request_id, sample_id),
  CONSTRAINT fk_rs_request FOREIGN KEY (request_id) REFERENCES transplant_request(request_id)
      ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rs_sample FOREIGN KEY (sample_id) REFERENCES stem_cell_sample(sample_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_rs_score CHECK (hla_match_score BETWEEN 0 AND 6),
  CONSTRAINT chk_rs_tier CHECK (search_tier IN ('SAME_DISTRICT','SAME_STATE','NATIONAL')),
  CONSTRAINT chk_rs_status CHECK (selection_status IN ('CANDIDATE','ALLOCATED','REJECTED','RELEASED')),
  CONSTRAINT chk_rs_alloc_date CHECK ((selection_status IN ('ALLOCATED','RELEASED'))
      = (allocation_date IS NOT NULL))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 12. Transplant : aggregation over RequestSample (composite FK)
-- ---------------------------------------------------------------------
CREATE TABLE transplant (
  transplant_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id        INT UNSIGNED NOT NULL,
  sample_id         INT UNSIGNED NOT NULL,
  transplant_date   DATE         NOT NULL,
  transplant_status VARCHAR(9)   NOT NULL DEFAULT 'SCHEDULED',
  outcome           VARCHAR(13)  NOT NULL DEFAULT 'PENDING',
  remarks           VARCHAR(255) NULL,
  CONSTRAINT pk_transplant PRIMARY KEY (transplant_id),
  CONSTRAINT uq_transplant_request UNIQUE (request_id),
  CONSTRAINT uq_transplant_sample  UNIQUE (sample_id),
  CONSTRAINT fk_transplant_candidate FOREIGN KEY (request_id, sample_id)
      REFERENCES request_sample(request_id, sample_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_transplant_status CHECK (transplant_status IN ('SCHEDULED','COMPLETED','CANCELLED')),
  CONSTRAINT chk_transplant_outcome CHECK (outcome IN
      ('PENDING','ENGRAFTED','GRAFT_FAILURE','COMPLICATIONS')),
  CONSTRAINT chk_transplant_outcome_rule CHECK (transplant_status = 'COMPLETED' OR outcome = 'PENDING')
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 13. AuditLog : append-only history
--     JSON snapshots are an intentional denormalization
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
  audit_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED    NULL,
  action      VARCHAR(6)      NOT NULL,
  table_name  VARCHAR(40)     NOT NULL,
  record_id   VARCHAR(40)     NOT NULL,
  action_time DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  old_value   JSON            NULL,
  new_value   JSON            NULL,
  CONSTRAINT pk_audit PRIMARY KEY (audit_id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES `user`(user_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_audit_action CHECK (action IN ('INSERT','UPDATE','DELETE')),
  CONSTRAINT chk_audit_insert_old CHECK (action <> 'INSERT' OR old_value IS NULL),
  CONSTRAINT chk_audit_delete_new CHECK (action <> 'DELETE' OR new_value IS NULL)
) ENGINE=InnoDB;

-- =====================================================================
-- Indexes (FK and UNIQUE columns are already indexed by InnoDB)
-- =====================================================================
CREATE INDEX idx_donor_name       ON donor (full_name);
CREATE INDEX idx_donor_bg_status  ON donor (blood_group, status);
CREATE INDEX idx_patient_name     ON patient (full_name);
CREATE INDEX idx_hospital_name    ON hospital (hospital_name);
CREATE INDEX idx_hospital_geo     ON hospital (state, district);
CREATE INDEX idx_sample_avail     ON stem_cell_sample (availability_status, sample_type, expiry_date);
CREATE INDEX idx_test_status      ON sample_test (test_status, test_type);
CREATE INDEX idx_consent_active   ON consent (donor_id, consent_type, status);
CREATE INDEX idx_request_queue    ON transplant_request (request_status, urgency, request_date);
CREATE INDEX idx_audit_entity     ON audit_log (table_name, record_id, action_time);
