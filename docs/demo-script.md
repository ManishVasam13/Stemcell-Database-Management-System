# StemVault — demonstration plan (about 15 minutes)

Before you start: `npm start` in `backend/`, `npm run dev` in `frontend/`, and MySQL Workbench open
on `database/08_demo_queries.sql`. If the data has been changed by earlier practice, run
`npm run db:setup` once to reset it.

---

## Part 1 — The problem, in one screen (1 min)

Sign in as **staff.kavya**.

Point at the overview: units available, requests waiting, units expiring within 60 days, storage use,
and the charts of inventory by state and by unit type. Say the one sentence that frames the project:

> A matching unit may sit in another state, so the registry searches the patient's own district
> first, then the state, then the whole country.

---

## Part 2 — The tiered search (4 min, the centrepiece)

1. Open **Requests** and click request **#1** (Chennai, cord blood).
2. Press **Run search**. The three rings appear: the same-district ring is highlighted, and the state
   and national rings are shown but unused.
3. Open request **#2** (Madurai). Run the search: the district ring is empty, so the search falls back
   to Tamil Nadu — even though Delhi holds a better 6/6 unit. This is the rule working, not a bug.
4. Open request **#3** (Kochi): both local rings are empty, so it goes national.
5. Open request **#4**: nothing anywhere in India.

Explain the score: HLA-A, HLA-B and HLA-DRB1, two alleles each, so a match out of 6. The six squares
next to each candidate show it.

Then show where it comes from, in Workbench:

```sql
CALL sp_find_candidates(2, 0);
```

The first result set is the tier summary, the second is the candidate list of the chosen tier.

---

## Part 3 — A full workflow, live (4 min)

Still as **staff.kavya**, open request **#9** (pending, Chennai, critical).

1. **Review** → Approve. The request moves to approved; the reviewer and time are recorded.
2. **Search and shortlist** → candidates are stored in `request_sample` with their score and tier.
3. **Allocate** the best unit. Two things change by themselves: the unit becomes `ALLOCATED` and the
   request becomes `ALLOCATED`. Those updates come from a trigger, not from the application.
4. Sign in as **dr.vikram** (the doctor who raised it) → open the request → **Schedule transplant**.
5. Go to **Transplants** → **Mark done** with outcome *engrafted*. The unit becomes `TRANSPLANTED`,
   leaves its storage slot, and the request closes — again by trigger.

Show the audit trail at the bottom of the request page: every step was recorded with the username.

---

## Part 4 — Rules the database refuses to break (3 min)

In Workbench (each statement is meant to fail):

```sql
-- allocating a unit that is already allocated
CALL sp_allocate_sample(1, <the unit you just transplanted>);

-- a status that is not a legal transition
UPDATE transplant_request SET request_status = 'PENDING' WHERE request_id = 7;

-- the audit log is append-only
DELETE FROM audit_log WHERE audit_id = 1;

-- a CHECK constraint
INSERT INTO donor (full_name, date_of_birth, gender, blood_group, phone)
VALUES ('Test Donor', '1990-01-01', 'M', 'C+', '9000000000');
```

Then show the consent rule in the UI: open any donor with an available unit, revoke their
**clinical use** consent, and watch their available unit drop to *not available* immediately.

And the testing rule: open a unit in quarantine, record a **failed** infectious screen, and the unit
is rejected and discarded on the spot.

---

## Part 5 — Roles and privacy (2 min)

1. Sign in as **dr.ananya**: no donors menu at all; **Find a unit** shows inventory with no donor
   names — only type, blood group, CD34 and location.
2. Sign in as **donor.karthik**: only his own donation and consent, with a withdraw button.
3. Sign in as **patient.meena**: only her own request and its stage.

Then show that this is enforced in the database too, not only in the app:

```bash
mysql -u dr.ananya -p        # password StemVault@123
SELECT * FROM stemvault.donor;             -- ERROR 1142: denied

mysql -u donor.karthik -p
SELECT * FROM stemvault.v_my_donor_samples; -- only his own unit

mysql -u staff.kavya -p
UPDATE stemvault.transplant_request SET urgency = 'ROUTINE' WHERE request_id = 9;
-- ERROR 1143: column-level privilege denied
```

---

## Part 6 — SQL concepts on demand (rest of the time)

`database/08_demo_queries.sql` is arranged so you can jump to whatever the examiner asks for:

| Section | Concept |
|---|---|
| A | INSERT, SELECT, UPDATE, DELETE |
| B | WHERE, AND/OR, BETWEEN, IN, LIKE, IS NULL |
| C | INNER, LEFT, RIGHT and two SELF JOINs |
| D | COUNT, SUM, AVG, MIN, MAX, GROUP BY, HAVING |
| E | subquery, correlated subquery, EXISTS, NOT EXISTS, UNION |
| F | PRIMARY KEY, FOREIGN KEY, UNIQUE, NOT NULL, CHECK, DEFAULT (with failures) |
| G | all eight views |
| H | stored procedures, including the tiered search |
| I | functions |
| J | triggers, including the audit log |
| K | transactions, ROLLBACK, SAVEPOINT, row locking, cursor, scheduled event |
| L | indexes with EXPLAIN, and two cases where an index cannot be used |
| M | roles, grants and row-level views |

**Concurrency, if asked.** Open two Workbench tabs:

```sql
-- tab 1
START TRANSACTION;
SELECT * FROM stem_cell_sample WHERE sample_id = 1 FOR UPDATE;

-- tab 2 (waits for tab 1)
CALL sp_allocate_sample(1, 1);

-- tab 1
COMMIT;      -- tab 2 now finishes
```

---

## Closing line

> Thirteen tables, and the interesting part is that the rules live in the database: statuses, consent,
> capacity, allocation and the audit trail are enforced by constraints and triggers, so the same rules
> hold whether the change comes from the web app, from Workbench, or from any other client.
