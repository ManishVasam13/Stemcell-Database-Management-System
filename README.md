# StemVault — Stem Cell Bank Management System

A full-stack DBMS course project: **MySQL 8 + Node.js/Express + React**.

StemVault tracks the whole stem-cell banking workflow — donor consent, collection, laboratory
testing, cryogenic storage, transplant requests, HLA matching, allocation, transplant and outcome —
with an audit trail written by database triggers.

The matching engine searches in widening rings: **same district → same state → anywhere in India**,
and stops at the first ring that holds a compatible unit.

---

## 1. What is in the box

```
stemvault/
├─ database/           the whole database layer (run these in order)
│  ├─ 01_schema.sql            13 tables, keys, constraints, indexes
│  ├─ 02_functions.sql         11 stored functions (HLA score, search tier, ...)
│  ├─ 03_views.sql             8 views
│  ├─ 04_triggers.sql          36 triggers (rules, status cascades, audit log)
│  ├─ 05_procedures.sql        18 procedures, a cursor report, a nightly event
│  ├─ 06_seed.sql              demo data (generated, dates relative to today)
│  ├─ 07_security.sql          roles, grants, row-level views, demo accounts
│  ├─ 08_demo_queries.sql      viva demo: every concept A–M
│  └─ tools/generate_seed.py   regenerates 06_seed.sql
├─ backend/            Express REST API (JWT auth, role checks)
│  ├─ src/server.js, src/config/db.js, src/middleware/, src/routes/
│  └─ scripts/setup-db.js      builds the database without the mysql CLI
├─ frontend/           React single-page app (Vite)
│  └─ src/pages/, src/components/
└─ docs/
   ├─ database-design.md       scope, ER model, schema, normalization, constraints
   ├─ er-diagram.md            crow's-foot + Chen diagrams (Mermaid)
   ├─ demo-script.md           15-minute demonstration plan
   └─ viva-notes.md            concept → where it lives → likely questions
```

---

## 2. Requirements

| Software | Version | Notes |
|---|---|---|
| MySQL | 8.0.16 or newer | CHECK constraints are only enforced from 8.0.16 |
| Node.js | 18 or newer | `node -v` to check |
| A browser | any modern one | |

MySQL Workbench is optional but handy for the viva.

---

## 3. Setup (about five minutes)

### Step 1 — Backend configuration

```bash
cd backend
npm install
copy .env.example .env        # Windows   (macOS/Linux: cp .env.example .env)
```

Open `.env` and set your MySQL root password in `DB_PASSWORD` and `DB_ADMIN_PASSWORD`.

### Step 2 — Build the database

```bash
npm run db:setup
```

This runs scripts 01–07 and prints:

```
StemVault ready: 13 tables, 11 views, 36 triggers, 29 functions/procedures.
```

Prefer the MySQL client or Workbench? Run the same files by hand, in order:

```bash
mysql -u root -p < ../database/01_schema.sql
mysql -u root -p < ../database/02_functions.sql
mysql -u root -p < ../database/03_views.sql
mysql -u root -p < ../database/04_triggers.sql
mysql -u root -p < ../database/05_procedures.sql
mysql -u root -p < ../database/06_seed.sql
mysql -u root -p < ../database/07_security.sql
```

After `07_security.sql` has run you can switch the API to the least-privilege account it creates:
`DB_USER=stemvault_app`, `DB_PASSWORD=StemVault@App123`.

### Step 3 — Start the API

```bash
cd backend
npm start                  # http://localhost:5000
```

Check `http://localhost:5000/api/health` — it should report `"database": "connected"`.

### Step 4 — Start the web app

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

Open **http://localhost:5173** and sign in.

---

## 4. Demo accounts

Password for all of them: **StemVault@123**

| Role | Username | What they see |
|---|---|---|
| Administrator | `admin` | everything, plus accounts and the activity log |
| Bank staff | `staff.kavya` | donors, consents, units, testing, storage, request review, allocation |
| Doctor | `dr.ananya` | own patients and requests, anonymized inventory, transplants |
| Doctor (second hospital) | `dr.vikram` | useful for showing that a doctor sees only their own requests |
| Donor | `donor.karthik` | own donated units and consent, with a withdraw button |
| Patient | `patient.meena` | own request, its stage and transplant outcome |

MySQL accounts created by `07_security.sql` (for the database-level security demo):
`sv_admin_user`, `staff.kavya`, `dr.ananya`, `donor.karthik`, `patient.meena` (same password),
plus the application account `stemvault_app` / `StemVault@App123`.

---

## 5. Seeded scenarios worth showing

| Request | Shows |
|---|---|
| #1 | a **same-district** match in Chennai, with state and national rings left unused |
| #2 | Madurai has nothing, so the search falls back to **same state** — even though Delhi holds a better 6/6 unit |
| #3 | Kerala has nothing, so the search goes **national** |
| #4 | no compatible unit anywhere in India |
| #5 | a unit allocated, transplant not yet scheduled |
| #6 | a transplant scheduled for next week |
| #7, #8 | completed transplants: engrafted, and with complications |
| #9–#11 | pending requests — approve #9 live, then search and allocate |
| #12, #13 | a rejected request and a cancelled one |

Other things already in the data: units in quarantine with pending tests, a unit discarded after a
failed infectious screen, expired units, a donor who revoked clinical-use consent (their unit was
withdrawn automatically), a storage tank under maintenance, and a suspended hospital.

---

## 6. How the matching works

1. The requesting hospital comes from the request's doctor, so the search knows its district and state.
2. A unit's location comes from its storage tank's hospital.
3. Every available unit of the right type, with active clinical-use consent and not expired, is scored
   against the patient: **HLA-A, HLA-B and HLA-DRB1, two alleles each — a score out of 6**.
4. Units scoring below the request's minimum are dropped.
5. What is left is grouped into three rings, and only the nearest non-empty ring is returned:
   `SAME_DISTRICT` → `SAME_STATE` → `NATIONAL`.

All of this happens inside `sp_find_candidates`; the API and the UI only display the result.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| `Access denied for user` on `npm run db:setup` | the root password in `.env` is wrong |
| `Check constraint is violated` when running scripts by hand | MySQL is older than 8.0.16 |
| `Illegal mix of collations` | your client is not using `utf8mb4_0900_ai_ci`; use the setup script, which sets it |
| API says `database: error` | MySQL service is not running, or `DB_NAME` is wrong |
| The web app shows "Sign in to continue" repeatedly | the API is not running on port 5000, or the token expired (sign in again) |
| `07_security.sql` fails | your MySQL account cannot `CREATE USER`; the rest of the project still works with `DB_USER=root` |
| Port already in use | change `PORT` in `backend/.env` and the proxy target in `frontend/vite.config.js` |

To start again from clean data, run `npm run db:setup` once more — it drops and rebuilds the database.

---

## 8. Single-server build (optional)

```bash
cd frontend && npm run build      # writes frontend/dist
cd ../backend && npm start        # serves the API and the built app on port 5000
```

---

## 9. Notes for the report

* Design decisions, normalization proofs and constraint lists: `docs/database-design.md`
* ER diagrams: `docs/er-diagram.md`
* Demonstration plan and viva answers: `docs/demo-script.md`, `docs/viva-notes.md`
* All demo data is fictional. Hospital names, registration numbers, people and HLA types were
  generated for this project and do not refer to real institutions or patients.
