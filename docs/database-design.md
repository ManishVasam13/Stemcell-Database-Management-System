# StemVault — database design

MySQL 8.0.16+. Physical table names are lowercase snake_case (`User` → `` `user` ``,
`StemCellSample` → `stem_cell_sample`) so the scripts behave the same on Windows and Linux.

---

## 1. System scope

Donor registration → consent → sample collection → laboratory testing → release into cryogenic
storage → transplant request → candidate shortlisting → allocation → transplant → outcome, with an
audit trail of every critical change.

Out of scope: conventional blood-bank inventory, billing, shipment logistics, research use and
notifications.

**Tiered search.** A request's location comes from its doctor's hospital; a unit's location comes from
its storage tank's hospital. Comparing the two `(district, state)` pairs classifies every unit as
`SAME_DISTRICT`, `SAME_STATE` or `NATIONAL`, and only the nearest non-empty tier is offered. District
names repeat across states, so "same district" also requires the same state.

### Design decisions that differ from a literal reading of the brief

| # | Decision | Reason |
|---|---|---|
| 1 | `blood_group` is not stored on `stem_cell_sample` | `sample_id → donor_id → blood_group` is a transitive dependency (3NF) |
| 2 | `storage_location` has `hospital_id`; the address lives on `hospital` | gives every unit a district and state without repeating the address per tank |
| 3 | Six HLA allele columns on `donor` and `patient` | matching needs stored attributes; in stem-cell transplantation HLA is the primary compatibility factor and ABO is secondary |
| 4 | Approval stored as `reviewed_by` + `reviewed_at` + `review_remarks` | records who decided, and when |
| 5 | `transplant` references `request_sample` by the composite key `(request_id, sample_id)` | EER aggregation: only a shortlisted candidate can be transplanted |
| 6 | Status columns are `VARCHAR` + `CHECK ... IN (...)` rather than `ENUM` | demonstrates CHECK constraints and stays portable |

---

## 2. Tables and their purpose

| # | Table | Purpose |
|---|---|---|
| 1 | `user` | login identity and role for every person who uses the system |
| 2 | `donor` | a person who donates stem cells, with HLA typing |
| 3 | `patient` | a person who needs a transplant, with diagnosis and HLA typing |
| 4 | `hospital` | registered institution; the geographic anchor (city, district, state) |
| 5 | `doctor` | clinician employed at one hospital who raises requests |
| 6 | `stem_cell_sample` | one collected unit and its lifecycle |
| 7 | `sample_test` | each laboratory test performed on a unit |
| 8 | `storage_location` | one cryogenic tank or freezer at a hospital |
| 9 | `consent` | legal permission from a donor: collection, storage, clinical use |
| 10 | `transplant_request` | a doctor's request for a unit for one patient |
| 11 | `request_sample` | associative entity: candidate units evaluated for a request (M:N) |
| 12 | `transplant` | the transplant event that uses one allocated candidate |
| 13 | `audit_log` | append-only history of important changes |

Full column lists, data types and constraints are in `database/01_schema.sql`, which is commented
table by table.

---

## 3. Keys

### Primary keys

All tables use a surrogate `AUTO_INCREMENT` integer, except `request_sample`, whose primary key is
the **composite** `(request_id, sample_id)`: one pair is exactly one candidacy, the same unit cannot
be shortlisted twice for the same request, and `transplant` can reference the pair directly.

`audit_log` uses `BIGINT` because it grows fastest.

### Candidate and unique keys

| Table | Candidate keys besides the PK | Other UNIQUE |
|---|---|---|
| `user` | `username` | — |
| `donor` | `(full_name, date_of_birth, phone)` | `user_id`, `email` (nullable) |
| `patient` | `(full_name, date_of_birth, phone)` | `user_id`, `email` (nullable) |
| `hospital` | `registration_no`, `email` | — |
| `doctor` | `user_id`, `medical_reg_no` | `email` (nullable) |
| `storage_location` | `location_code` | — |
| `stem_cell_sample` | — | `(location_id, storage_position)` — one unit per slot |
| `sample_test` | `(sample_id, test_type, test_date)` | — |
| `consent` | `(donor_id, consent_type, consent_date)` | — |
| `transplant` | `request_id`, `sample_id` (each alone) | — |

A nullable UNIQUE column is not a true candidate key, because a key cannot be NULL and MySQL allows
many NULLs in a UNIQUE column.

### Foreign keys and referential actions

| FK | References | ON DELETE | ON UPDATE | Why |
|---|---|---|---|---|
| `donor.user_id`, `patient.user_id` | `user` | SET NULL | CASCADE | removing a login must not remove clinical history |
| `doctor.user_id` | `user` | RESTRICT | CASCADE | a doctor must have an account |
| `doctor.hospital_id`, `storage_location.hospital_id` | `hospital` | RESTRICT | CASCADE | a hospital with staff or tanks cannot be deleted |
| `stem_cell_sample.donor_id` | `donor` | RESTRICT | CASCADE | traceability must never be lost |
| `stem_cell_sample.location_id` | `storage_location` | RESTRICT | **RESTRICT** | the column appears in CHECK constraints (MySQL rule) |
| `sample_test.sample_id`, `sample_test.performed_by` | `stem_cell_sample`, `user` | RESTRICT | CASCADE | test history and accountability |
| `consent.donor_id` | `donor` | RESTRICT | CASCADE | consent is a legal record |
| `transplant_request.patient_id`, `.doctor_id` | `patient`, `doctor` | RESTRICT | CASCADE | clinical history |
| `transplant_request.reviewed_by` | `user` | RESTRICT | **RESTRICT** | the column appears in CHECK constraints |
| `request_sample.request_id` | `transplant_request` | **CASCADE** | CASCADE | candidates are meaningless without their request |
| `request_sample.sample_id` | `stem_cell_sample` | RESTRICT | CASCADE | a unit that was evaluated cannot be deleted |
| `transplant.(request_id, sample_id)` | `request_sample` | RESTRICT | CASCADE | completed history is protected |
| `audit_log.user_id` | `user` | RESTRICT | CASCADE | the audit trail must survive |

Clinical rows are retired through their `status` column, never deleted. Deleting a pending request
cascades to its candidate rows; deleting a request that already has a transplant is blocked.

---

## 4. Relationships and cardinalities

See `docs/er-diagram.md` for the diagram and the full cardinality table. In summary:

* 1:1 — User–Donor, User–Patient, User–Doctor, RequestSample–Transplant, Request–Transplant
* 1:M — Hospital–Doctor, Hospital–StorageLocation, Donor–Consent, Donor–Sample,
  StorageLocation–Sample, Sample–SampleTest, Patient–Request, Doctor–Request, User–AuditLog,
  User–SampleTest (`performed_by`), User–Request (`reviewed_by`)
* M:N — TransplantRequest ↔ StemCellSample, resolved by `request_sample`

---

## 5. Normalization

### 1NF — atomic values, no repeating groups

Every column holds a single value and every table has a primary key. The six HLA columns are not a
repeating group: each locus has exactly two alleles, the number is fixed, and each position has its
own meaning. A variable-length list would break 1NF; a fixed pair does not.

### 2NF — no partial dependency on part of a composite key

Only `request_sample` has a composite key. `hla_match_score`, `search_tier`, `selection_status` and
`allocation_date` all describe *this unit for this request*, so they depend on the whole key.
Counter-example avoided: `sample_type` in `request_sample` would depend on `sample_id` alone.

### 3NF — no transitive dependency

| Transitive dependency that was avoided | How |
|---|---|
| `sample_id → donor_id → blood_group` | blood group is not stored on the sample |
| `doctor_id → hospital_id → hospital_name` | `doctor` stores only `hospital_id` |
| `request_id → doctor_id → hospital_id` | the request does not store a hospital |
| `location_id → hospital_id → district, state` | the tank does not store an address |
| `location_id → COUNT(samples)` | occupancy is derived in `v_storage_occupancy` |

In every table each determinant is the primary key or a candidate key
(`hospital.registration_no → all`, `doctor.medical_reg_no → all`,
`transplant.request_id → all`), so most tables also satisfy **BCNF**.

### Intentional denormalization

| Item | Why it is kept |
|---|---|
| `request_sample.hla_match_score`, `.search_tier` | a snapshot of the decision. Re-typing a donor or editing a hospital's address must not silently rewrite history, and a nationwide search is not repeated on every read |
| `consent.status` | derivable from `revoked_on` and `valid_until`, but stored for fast filtering; a CHECK keeps `REVOKED` consistent and the nightly event marks `EXPIRED` |
| `audit_log.old_value` / `new_value` (JSON) | row snapshots that are never queried relationally; audit tables are append-only by design |
| `hospital.city / district / state / pincode` | `pincode → district` is not strictly true in India (some PIN codes span districts) and district names repeat across states, so a location lookup table was left out to keep the project focused |
| `doctor.hospital_id` used as the request's hospital | assumes a doctor's hospital is stable. If doctors transfer, old requests would appear to come from the new hospital; storing `hospital_id` on the request would be the justified fix |

---

## 6. Constraints

### Declarative (in `01_schema.sql`)

* **PRIMARY KEY** on every table, composite on `request_sample`
* **FOREIGN KEY** with the actions in §3, including the composite FK from `transplant`
* **UNIQUE**: usernames, registration numbers, medical registration numbers, storage codes,
  identity triples, storage slots, natural keys of tests and consents
* **NOT NULL** on everything a row cannot exist without
* **DEFAULT**: `status`, `created_at`, `registration_date`, `min_hla_match`, `urgency`
* **CHECK**, including: valid status values; blood groups; a 6-digit pincode via `REGEXP_LIKE`;
  positive volume and capacity; `expiry_date > collection_date`; all six HLA columns filled or none;
  `(location_id IS NULL) = (storage_position IS NULL)`; a unit may only be `AVAILABLE` if it is
  `RELEASED` and has a location; `(reviewed_by IS NULL) = (reviewed_at IS NULL)`;
  `(selection_status IN ('ALLOCATED','RELEASED')) = (allocation_date IS NOT NULL)`;
  an outcome other than `PENDING` only on a completed transplant

MySQL cannot use `CURDATE()` or `NOW()` inside a CHECK, so every rule that depends on today's date
lives in a trigger or a procedure.

### Procedural (in `04_triggers.sql`)

* collection needs an ACTIVE donor with active COLLECTION consent
* release needs all four mandatory tests passed, active STORAGE and CLINICAL_USE consent, an
  operational tank with a free slot, and a unit that has not expired
* revoking STORAGE or CLINICAL_USE consent withdraws that donor's available units
* a failed mandatory test rejects and discards the unit
* only an APPROVED request may shortlist; only an AVAILABLE, unexpired unit of the right type may be
  allocated; allocation moves the unit and the request to `ALLOCATED`
* releasing an allocation returns the unit to the pool (or marks it expired / not available if its
  consent lapsed meanwhile) and the request to `APPROVED`
* completing a transplant marks the unit `TRANSPLANTED`, removes it from its slot and closes the request
* status transitions are checked against a fixed state machine on samples, requests, candidates and
  transplants
* role consistency: a donor row only links to a `DONOR` account, a doctor row to a `DOCTOR` account,
  reviewers must be `ADMIN` or `BANK_STAFF`, testers must be `BANK_STAFF` or `ADMIN`
* every insert, update and delete on samples, consents, requests, candidates and transplants writes
  an `audit_log` row; the audit log itself rejects updates and deletes

The acting user reaches the triggers through the session variable `@app_user_id`, which the API sets
on its connection before every write.

---

## 7. Indexes

InnoDB already indexes primary, unique and foreign-key columns. The extra indexes are:

| Index | Columns | Query it serves |
|---|---|---|
| `idx_donor_name` | `donor(full_name)` | donor lookup, `LIKE 'Pri%'` |
| `idx_donor_bg_status` | `donor(blood_group, status)` | filtering donors by blood group |
| `idx_patient_name` | `patient(full_name)` | patient lookup |
| `idx_hospital_name` | `hospital(hospital_name)` | hospital lookup |
| `idx_hospital_geo` | `hospital(state, district)` | tiered search; the leftmost prefix also serves "same state" |
| `idx_sample_avail` | `stem_cell_sample(availability_status, sample_type, expiry_date)` | the availability view and every search |
| `idx_test_status` | `sample_test(test_status, test_type)` | pending and failed test lists |
| `idx_consent_active` | `consent(donor_id, consent_type, status)` | consent checks inside triggers |
| `idx_request_queue` | `transplant_request(request_status, urgency, request_date)` | the request queue |
| `idx_audit_entity` | `audit_log(table_name, record_id, action_time)` | history of one record |

Deliberately **not** indexed: low-cardinality columns on their own (gender, status), and the HLA
columns — scoring runs over the small candidate set that `idx_sample_avail` has already filtered.

`08_demo_queries.sql` section L shows `EXPLAIN` with and without a usable index, including the
leftmost-prefix rule and why `LIKE '%Iyer'` cannot use an index.

---

## 8. Programmable objects

| Kind | Count | Highlights |
|---|---|---|
| Functions | 11 | `fn_hla_match_score` (0–6), `fn_search_tier`, `fn_has_active_consent`, `fn_sample_tests_passed`, `fn_location_free_slots`, `fn_count_available_samples` |
| Views | 8 (+3 row-level) | available units (anonymized), patient requests, hospital summary, testing status, storage occupancy, donor consent status, transplant summary, request candidates |
| Triggers | 36 | audit logging, status cascades, the business rules in §6 |
| Procedures | 18 | registration, testing, release, review, `sp_find_candidates` (tiered search), `sp_allocate_sample` (transaction + `FOR UPDATE`), scheduling, completion, cancellation, a cursor-based expiry report, nightly maintenance |
| Event | 1 | `ev_daily_maintenance` expires units and consents every night at 01:00 |

---

## 9. Security model

Six database roles: `sv_admin`, `sv_bank_staff`, `sv_doctor`, `sv_donor`, `sv_patient` and `sv_app`
(the application account).

* Bank staff hold a **column-level** privilege: they may update only the review columns of
  `transplant_request`, not `urgency` or the clinical fields.
* Doctors have no privilege on `donor` or `stem_cell_sample`; they read `v_available_samples`, which
  hides donor identity.
* Donors and patients reach only their own rows, through `SQL SECURITY DEFINER` views filtered with
  `USER()` — MySQL's practical substitute for row-level security.
* The application account cannot delete from `audit_log`, and no account can update it, because the
  table's triggers reject both.

The API adds its own layer: JWT authentication, per-route role checks, and ownership checks so a
doctor can only open their own requests and a patient only their own record.
