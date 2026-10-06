# StemVault — viva notes

## 1. Where each concept lives

| Concept | Where | Example |
|---|---|---|
| Composite primary key | `request_sample` | `PRIMARY KEY (request_id, sample_id)` |
| Composite foreign key (aggregation) | `transplant` | `(request_id, sample_id) → request_sample` |
| Surrogate vs natural key | every table | surrogate PK + a UNIQUE natural key, e.g. `hospital.registration_no` |
| CHECK constraint | `01_schema.sql` | `chk_hospital_pincode`, `chk_sample_available_rule` |
| ON DELETE CASCADE | `request_sample.request_id` | deleting a pending request removes its candidates |
| ON DELETE RESTRICT | most clinical FKs | a donor with units cannot be deleted |
| View | `03_views.sql` | `v_available_samples` hides donor identity |
| Conditional aggregation | `v_sample_testing_status` | `SUM(t.test_status = 'PASSED')` |
| Function | `02_functions.sql` | `fn_hla_match_score`, `fn_search_tier` |
| Correlated subquery | `fn_sample_tests_passed` | latest test per test type |
| Trigger (audit) | `04_triggers.sql` | `trg_sample_au` writes JSON before/after |
| Trigger (business rule) | `trg_rs_bu` | blocks allocation of an unavailable unit |
| Trigger (cascade) | `trg_rs_au`, `trg_transplant_au` | allocation and completion update the unit and the request |
| Stored procedure | `05_procedures.sql` | `sp_find_candidates`, `sp_allocate_sample` |
| Transaction + rollback | `sp_allocate_sample` | `EXIT HANDLER FOR SQLEXCEPTION → ROLLBACK; RESIGNAL` |
| Row locking | `sp_allocate_sample`, `sp_release_sample` | `SELECT ... FOR UPDATE` |
| Cursor | `sp_expiring_samples_report` | classifies expiring units row by row |
| Scheduled event | `ev_daily_maintenance` | expires units and consents nightly |
| Index | `01_schema.sql` | `idx_hospital_geo(state, district)` |
| Roles and grants | `07_security.sql` | six roles, one column-level grant |
| Row-level security | `07_security.sql` | `v_my_donor_samples` filtered by `USER()` |

---

## 2. Questions you should expect

**Why 13 tables and not more?**
Every table is an entity the workflow actually needs. Notification, inventory or compliance tables
would add rows without adding information: inventory is `stem_cell_sample` grouped by location, and
compliance is the audit log.

**Why is blood group not stored on the sample?**
Because `sample_id → donor_id → blood_group` is a transitive dependency. Storing it would let a
donor's corrected blood group disagree with their units. The views join the donor instead.

**Then why do you store `hla_match_score` and `search_tier` on `request_sample`, which are also derived?**
Because they are a historical snapshot of a clinical decision, not a current fact. If a donor is
re-typed later, the shortlist must still show what the coordinator saw when they chose. It also saves
recomputing a nationwide search on every page load. It is a deliberate denormalization, documented in
the design.

**How does the district → state → India fallback work?**
The requesting side is `request → doctor → hospital(district, state)` and the unit side is
`sample → storage_location → hospital(district, state)`. `sp_find_candidates` classifies every
eligible unit into one of three tiers, takes `MIN(tier_rank)` among the non-empty tiers, and returns
only that tier. Same district also requires the same state, because district names repeat across
Indian states — Aurangabad exists in both Maharashtra and Bihar.

**What if a farther unit is a better match?**
The rule is deliberately distance-first: request #2 in the seed data keeps a 5/6 unit in Tamil Nadu
over a 6/6 in Delhi. Inside a tier, units are sorted by HLA score, then ABO identity, then CD34 count,
then expiry. Changing the policy means changing the `ORDER BY` and the tier choice in one procedure —
nothing else.

**Why a composite key on `request_sample`?**
One `(request, sample)` pair is exactly one candidacy, so the pair is the natural identifier, it
prevents the same unit being shortlisted twice for one request, and it lets `transplant` point at the
pair, which is what makes "you cannot transplant a unit that was never shortlisted" a foreign-key
guarantee instead of application code.

**Which normal form is the database in?**
All tables are in 3NF and most are in BCNF. The exceptions are the four documented denormalizations
in `docs/database-design.md` §5.

**How is the audit trail protected?**
`trg_audit_bu` and `trg_audit_bd` raise `SQLSTATE '45000'` on any update or delete, so even the root
account cannot rewrite history through SQL. The application account is additionally granted only
`SELECT, INSERT` on that table.

**How does a trigger know which user made a change?**
MySQL triggers cannot see the application user. The API runs `SET @app_user_id = ?` on its connection
before every write, and `sp_write_audit` reads that session variable.

**Where are transactions actually needed?**
Allocation is the clearest case: it reads the request and the unit `FOR UPDATE`, checks eligibility,
inserts or updates the candidate row, and lets the triggers move both statuses. Without the lock, two
coordinators could allocate the same unit in the same instant. Registration (login + donor + consent)
and sample registration (unit + five tests) are all-or-nothing for the same reason.

**Why VARCHAR with CHECK instead of ENUM?**
ENUM is MySQL-specific, changing it needs a table rebuild, and it hides the rule in the column type.
CHECK constraints are standard SQL, self-documenting and portable.

**Why can a CHECK constraint not test the expiry date against today?**
`CURDATE()` is non-deterministic and MySQL forbids it inside CHECK: the same row would be valid one
day and invalid the next. Anything time-dependent lives in triggers, procedures or the nightly event.

**Why do two foreign keys use `ON UPDATE RESTRICT` when the rest cascade?**
`stem_cell_sample.location_id` and `transplant_request.reviewed_by` appear inside CHECK constraints,
and MySQL does not allow a cascading referential action on a column used in a CHECK.

**How is the M:N relationship implemented?**
A request may consider many units and a unit may be considered by many requests, so
`request_sample` resolves it and carries the attributes of the relationship: score, tier, selection
status and allocation date. That makes it an associative entity, not a plain junction table.

**Which indexes did you add and which did you leave out?**
See `docs/database-design.md` §7. Gender and status columns are not indexed on their own because they
have too few distinct values for the optimizer to prefer an index; the HLA columns are not indexed
because scoring runs on a small set already filtered by `idx_sample_avail`.

**How do donors and patients see only their own data?**
MySQL has no row-level security, so `v_my_donor_samples`, `v_my_donor_consents` and
`v_my_patient_requests` are `SQL SECURITY DEFINER` views that filter on
`u.username = SUBSTRING_INDEX(USER(), '@', 1)`. The API enforces the same rule with the user id in
the JWT.

**What would you add next?**
Shipment and courier tracking between banks, HLA typing at higher resolution with a proper allele
table, `hospital_id` stored on the request so a doctor's transfer cannot rewrite history, and
partitioning `audit_log` by month once it grows.

---

## 3. Numbers worth remembering

* 13 tables · 11 functions · 8 shared views + 3 row-level views · 36 triggers · 18 procedures · 1 event · 10 extra indexes
* Seed data: 13 hospitals across 8 states, 13 storage units, 13 doctors, 43 donors, 53 units, 15 patients, 13 requests
* HLA match is scored out of 6 (A, B, DRB1 — two alleles each); the default minimum on a request is 4
