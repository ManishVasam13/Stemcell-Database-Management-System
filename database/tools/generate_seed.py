"""
StemVault seed generator
------------------------
Writes ../06_seed.sql with synthetic (fictional) data.

* All dates are written relative to CURDATE(), so the data stays
  consistent whenever the script is run.
* Rows go through the real triggers and stored procedures, so the seed
  itself is a test of the database logic.
* HLA data is designed so the tiered search shows every tier:
  each scenario patient carries 3 "private" alleles that only their
  scenario donors share, so random background donors can never reach
  the 4/6 minimum by accident.

Run:  python generate_seed.py
"""
import random
from pathlib import Path

random.seed(42)
PASSWORD_HASH = "$2a$10$h58GjpqukFaIlDcbcR5gGO8EhuK/0kw2VKit86aR7tzFljnkllqta"  # StemVault@123

out = []
w = out.append


def q(v):
    """SQL literal"""
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def ago(days):
    return f"CURDATE() - INTERVAL {days} DAY"


def ahead(days):
    return f"CURDATE() + INTERVAL {days} DAY"


# ---------------------------------------------------------------- HLA pools
CA = ["A*01:01", "A*02:01", "A*11:01", "A*24:02", "A*33:03"]
CB = ["B*07:02", "B*15:01", "B*35:01", "B*40:06", "B*44:03", "B*51:01"]
CD = ["DRB1*03:01", "DRB1*07:01", "DRB1*11:01", "DRB1*15:01", "DRB1*13:02"]
UA = ["A*26:01", "A*31:01", "A*68:01", "A*29:02", "A*32:01", "A*03:01", "A*30:01", "A*23:01"]
UB = ["B*57:01", "B*52:01", "B*37:01", "B*58:01", "B*13:01", "B*18:01", "B*27:05", "B*08:01"]
UD = ["DRB1*04:01", "DRB1*14:01", "DRB1*10:01", "DRB1*12:01", "DRB1*16:02", "DRB1*01:01", "DRB1*09:01", "DRB1*08:03"]
BLOOD = ["O+", "B+", "A+", "AB+", "O-", "A-", "B-"]


def common_hla():
    return [random.choice(CA), random.choice(CA), random.choice(CB), random.choice(CB),
            random.choice(CD), random.choice(CD)]


def scenario_hla(k):
    return [UA[k], random.choice(CA), UB[k], random.choice(CB), UD[k], random.choice(CD)]


def other(pool, current):
    return random.choice([a for a in pool if a != current])


def degrade(hla, level):
    """copy of a patient's HLA matching `level` of 6 alleles (6, 5 or 4)"""
    h = list(hla)
    if level <= 5:
        h[1] = other(CA, h[1]) if h[1] in CA else other(CA, "")
    if level <= 4:
        h[3] = other(CB, h[3]) if h[3] in CB else other(CB, "")
    return h


# ------------------------------------------------------------- reference data
hospitals = [
    # id, name, regno, address, city, district, state, pin, phone, email, registered days ago, status
    (1, "Marina Coast Multispeciality Hospital", "TN-HSP-1001", "12 Beach Road", "Chennai", "Chennai", "Tamil Nadu", "600004", "04424561001", "contact@marinacoast.example.in", 2400, "ACTIVE"),
    (2, "Adyar Stem Cell & Transplant Centre", "TN-HSP-1002", "45 Gandhi Nagar Main Road", "Chennai", "Chennai", "Tamil Nadu", "600020", "04424561002", "info@adyarstemcell.example.in", 2100, "ACTIVE"),
    (3, "Kovai Regional Cancer Institute", "TN-HSP-1003", "8 Avinashi Road", "Coimbatore", "Coimbatore", "Tamil Nadu", "641014", "04224561003", "desk@kovaicancer.example.in", 1900, "ACTIVE"),
    (4, "Meenakshi Hematology Hospital", "TN-HSP-1004", "21 Anna Nagar", "Madurai", "Madurai", "Tamil Nadu", "625020", "04524561004", "care@meenakshihem.example.in", 1500, "ACTIVE"),
    (5, "Deccan Blood & Marrow Institute", "KA-HSP-2001", "90 Hosur Road", "Bengaluru", "Bengaluru Urban", "Karnataka", "560034", "08024562001", "hello@deccanbmi.example.in", 2200, "ACTIVE"),
    (6, "Chamundi Medical College Hospital", "KA-HSP-2002", "3 Irwin Road", "Mysuru", "Mysuru", "Karnataka", "570001", "08214562002", "office@chamundimch.example.in", 1700, "ACTIVE"),
    (7, "Periyar Riverside Hospital", "KL-HSP-3001", "14 MG Road", "Kochi", "Ernakulam", "Kerala", "682016", "04844563001", "contact@periyarriverside.example.in", 1600, "ACTIVE"),
    (8, "Arabian Sea Cancer Centre", "MH-HSP-4001", "77 Linking Road", "Mumbai", "Mumbai Suburban", "Maharashtra", "400050", "02224564001", "info@arabiansea.example.in", 2600, "ACTIVE"),
    (9, "Sahyadri Transplant Hospital", "MH-HSP-4002", "5 FC Road", "Pune", "Pune", "Maharashtra", "411004", "02024564002", "desk@sahyadritx.example.in", 1400, "ACTIVE"),
    (10, "Yamuna National Stem Cell Bank", "DL-HSP-5001", "1 Ring Road", "New Delhi", "New Delhi", "Delhi", "110029", "01124565001", "bank@yamunastemcell.example.in", 2900, "ACTIVE"),
    (11, "Charminar Bone Marrow Centre", "TG-HSP-6001", "30 Road No 2, Banjara Hills", "Hyderabad", "Hyderabad", "Telangana", "500034", "04024566001", "care@charminarbmc.example.in", 1800, "ACTIVE"),
    (12, "Hooghly Riverside Cancer Hospital", "WB-HSP-7001", "18 Park Street", "Kolkata", "Kolkata", "West Bengal", "700016", "03324567001", "info@hooghlycancer.example.in", 2000, "ACTIVE"),
    (13, "Konkan Coastal Hospital", "MH-HSP-4003", "9 Station Road", "Ratnagiri", "Ratnagiri", "Maharashtra", "415612", "02352564003", "admin@konkancoastal.example.in", 900, "SUSPENDED"),
]

locations = [
    # id, hospital, code, area, type, capacity
    (1, 1, "CHN-MC-LN2-01", "Cryo room, block B", "LN2_VAPOUR", 60),
    (2, 2, "CHN-AD-LN2-01", "Main cryobank hall", "LN2_LIQUID", 120),
    (3, 2, "CHN-AD-LN2-02", "Main cryobank hall", "LN2_VAPOUR", 80),
    (4, 3, "CBE-KR-LN2-01", "Hematology lab annex", "LN2_VAPOUR", 60),
    (5, 4, "MDU-MH-ULT-01", "Processing lab", "ULT_FREEZER", 30),
    (6, 5, "BLR-DB-LN2-01", "Cryobank level 2", "LN2_LIQUID", 100),
    (7, 7, "COK-PR-LN2-01", "Stem cell lab", "LN2_VAPOUR", 50),
    (8, 8, "BOM-AS-LN2-01", "Cryobank wing C", "LN2_LIQUID", 100),
    (9, 9, "PNQ-SH-LN2-01", "Transplant unit store", "LN2_VAPOUR", 40),
    (10, 10, "DEL-YN-LN2-01", "National repository hall 1", "LN2_LIQUID", 200),
    (11, 10, "DEL-YN-LN2-02", "National repository hall 2", "LN2_LIQUID", 200),
    (12, 11, "HYD-CB-LN2-01", "BMT cryo lab", "LN2_VAPOUR", 80),
    (13, 12, "CCU-HR-LN2-01", "Oncology cryo store", "LN2_VAPOUR", 60),
]
loc_by_code = {l[2]: l[0] for l in locations}
slot_counter = {l[0]: 0 for l in locations}


def next_slot(loc_id):
    i = slot_counter[loc_id]
    slot_counter[loc_id] += 1
    return f"R{i // 100 + 1:02d}-B{(i // 10) % 10 + 1:02d}-S{i % 10 + 1:02d}"


users = []  # (id, username, role, status, created days ago)
users.append((1, "admin", "ADMIN", "ACTIVE", 3000))
staff = [(2, "staff.kavya"), (3, "staff.rahul"), (4, "staff.meera"), (5, "staff.imran")]
for uid, un in staff:
    users.append((uid, un, "BANK_STAFF", "ACTIVE", 2000))

doctors = [
    # doctor_id, user_id, username, hospital, name, specialization, reg no
    (1, 6, "dr.ananya", 1, "Dr. Ananya Raghavan", "Clinical Hematology", "TNMC-48213"),
    (2, 7, "dr.vikram", 1, "Dr. Vikram Sundaram", "Bone Marrow Transplantation", "TNMC-51877"),
    (3, 8, "dr.farah", 2, "Dr. Farah Siddiqui", "Pediatric Hemato-Oncology", "TNMC-60342"),
    (4, 9, "dr.senthil", 3, "Dr. Senthil Kumar", "Medical Oncology", "TNMC-39021"),
    (5, 10, "dr.lakshmi", 4, "Dr. Lakshmi Narayanan", "Clinical Hematology", "TNMC-44109"),
    (6, 11, "dr.rohan", 5, "Dr. Rohan Hegde", "Bone Marrow Transplantation", "KMC-72290"),
    (7, 12, "dr.deepa", 6, "Dr. Deepa Urs", "Clinical Hematology", "KMC-68814"),
    (8, 13, "dr.joseph", 7, "Dr. Joseph Mathew", "Hemato-Oncology", "TCMC-33457"),
    (9, 14, "dr.aditi", 8, "Dr. Aditi Kulkarni", "Bone Marrow Transplantation", "MMC-90126"),
    (10, 15, "dr.nikhil", 9, "Dr. Nikhil Deshpande", "Clinical Hematology", "MMC-87543"),
    (11, 16, "dr.harpreet", 10, "Dr. Harpreet Sethi", "Bone Marrow Transplantation", "DMC-25518"),
    (12, 17, "dr.sravani", 11, "Dr. Sravani Reddy", "Pediatric Bone Marrow Transplantation", "TSMC-41962"),
    (13, 18, "dr.arindam", 12, "Dr. Arindam Bose", "Medical Oncology", "WBMC-57730"),
]
for d in doctors:
    users.append((d[1], d[2], "DOCTOR", "ACTIVE", 1500))
next_user_id = 19

first_f = ["Priya", "Divya", "Keerthana", "Sneha", "Aishwarya", "Nandini", "Pooja", "Revathi", "Shalini", "Meghana", "Anjali", "Fathima", "Swathi", "Ritika", "Harini", "Neha"]
first_m = ["Arun", "Karthik", "Suresh", "Rahul", "Manoj", "Ajay", "Prakash", "Naveen", "Sanjay", "Imran", "Gautham", "Vishal", "Rakesh", "Abdul", "Sai", "Varun"]
last = ["Iyer", "Menon", "Reddy", "Nair", "Sharma", "Patel", "Das", "Gupta", "Pillai", "Rao", "Khan", "Joshi", "Chatterjee", "Krishnan", "Bhat", "Verma", "Shetty", "Mishra"]
used_names = set()


def person(gender):
    while True:
        n = f"{random.choice(first_f if gender == 'F' else first_m)} {random.choice(last)}"
        if n not in used_names:
            used_names.add(n)
            return n


def phone():
    return str(random.choice([9, 8, 7])) + "".join(str(random.randint(0, 9)) for _ in range(9))


def dob(min_age, max_age):
    y = 2026 - random.randint(min_age, max_age)
    return f"{y}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}"


# ------------------------------------------------------------- scenarios
# location of the requesting doctor decides which tier each donor falls in
scenarios = [
    dict(k=0, doctor=1, type="CORD_BLOOD", urgency="URGENT", end="SHORTLISTED", diagnosis="Acute Lymphoblastic Leukemia",
         donors=[("CHN-AD-LN2-01", 6), ("CHN-MC-LN2-01", 5), ("CBE-KR-LN2-01", 6)],
         note="Same-district match exists (Chennai), so state and national tiers are not used"),
    dict(k=1, doctor=5, type="BONE_MARROW", urgency="CRITICAL", end="SHORTLISTED", diagnosis="Severe Aplastic Anemia",
         donors=[("CBE-KR-LN2-01", 5), ("CHN-AD-LN2-02", 4), ("DEL-YN-LN2-01", 6)],
         note="Nothing in Madurai; falls back to Tamil Nadu even though Delhi has a 6/6"),
    dict(k=2, doctor=8, type="PBSC", urgency="URGENT", end="SHORTLISTED", diagnosis="Multiple Myeloma",
         donors=[("DEL-YN-LN2-01", 6), ("BOM-AS-LN2-01", 5)],
         note="Nothing in Kerala; falls back to national search"),
    dict(k=3, doctor=7, type="CORD_BLOOD", urgency="ROUTINE", end="APPROVED", diagnosis="Beta Thalassemia Major",
         donors=[], note="No compatible unit anywhere in India"),
    dict(k=4, doctor=6, type="PBSC", urgency="CRITICAL", end="ALLOCATED", diagnosis="Acute Myeloid Leukemia",
         donors=[("BLR-DB-LN2-01", 6), ("BLR-DB-LN2-01", 5)], note="Allocated, transplant not yet scheduled"),
    dict(k=5, doctor=10, type="BONE_MARROW", urgency="URGENT", end="SCHEDULED", diagnosis="Myelodysplastic Syndrome",
         donors=[("BOM-AS-LN2-01", 6)], note="Transplant scheduled"),
    dict(k=6, doctor=12, type="CORD_BLOOD", urgency="CRITICAL", end="COMPLETED", outcome="ENGRAFTED", diagnosis="Fanconi Anemia",
         donors=[("HYD-CB-LN2-01", 6)], patient_login="patient.arjun", donor_login="donor.priya",
         note="Completed, engrafted"),
    dict(k=7, doctor=11, type="BONE_MARROW", urgency="URGENT", end="COMPLETED", outcome="COMPLICATIONS", diagnosis="Chronic Myeloid Leukemia",
         donors=[("CCU-HR-LN2-01", 6)], note="Completed with complications, national match"),
]

donors = []    # dicts
patients = []  # dicts
samples = []   # dicts
tests = []     # tuples
consents = []  # dicts
requests = []  # dicts


def add_user(username, role, days_ago):
    global next_user_id
    uid = next_user_id
    next_user_id += 1
    users.append((uid, username, role, "ACTIVE", days_ago))
    return uid


def add_donor(hla, gender=None, reg_days=700, login=None, status="ACTIVE", blood=None, name=None):
    gender = gender or random.choice("MF")
    did = len(donors) + 1
    nm = name or person(gender)
    d = dict(id=did, user_id=add_user(login, "DONOR", reg_days) if login else None, name=nm, dob=dob(20, 48),
             gender=gender, blood=blood or random.choice(BLOOD), hla=hla, phone=phone(),
             email=(nm.lower().replace(" ", ".") + f"{did}@mail.example.in") if random.random() < 0.6 else None,
             address=random.choice(["Anna Salai", "MG Road", "Station Road", "Nehru Street", "Temple Road", "Lake View Road"]) + f", No. {random.randint(1, 180)}",
             reg_days=reg_days, status=status)
    donors.append(d)
    return d


def add_consents(d, storage_valid=None, clinical=True):
    consents.append(dict(donor=d["id"], type="COLLECTION", days=d["reg_days"], valid=None))
    consents.append(dict(donor=d["id"], type="STORAGE", days=d["reg_days"], valid=storage_valid))
    if clinical:
        consents.append(dict(donor=d["id"], type="CLINICAL_USE", days=d["reg_days"], valid=None))


def add_sample(d, stype, loc_code, collected_days, fate="RELEASE", expiry=None):
    sid = len(samples) + 1
    vol = {"CORD_BLOOD": random.randint(40, 120), "BONE_MARROW": random.randint(600, 1400), "PBSC": random.randint(150, 380)}[stype]
    cd34 = {"CORD_BLOOD": random.uniform(1.5, 7), "BONE_MARROW": random.uniform(2.5, 9), "PBSC": random.uniform(4, 14)}[stype]
    if expiry is None and stype != "CORD_BLOOD":
        expiry = ("ahead", 5 * 365 - collected_days)  # 5 years from collection
    s = dict(id=sid, donor=d["id"], type=stype, loc=loc_by_code.get(loc_code), days=collected_days, vol=vol,
             cd34=round(cd34, 2), fate=fate, expiry=expiry)
    samples.append(s)
    return s


# ---- scenario people
for sc in scenarios:
    k = sc["k"]
    hla = scenario_hla(k)
    sc["req_days"] = random.randint(70, 110) if sc["end"] == "COMPLETED" else random.randint(3, 40)
    gender = random.choice("MF")
    pid = len(patients) + 1
    login = sc.get("patient_login")
    patients.append(dict(id=pid, user_id=add_user(login, "PATIENT", 120) if login else None, name=person(gender),
                         dob=dob(8, 55), gender=gender, blood=random.choice(BLOOD), hla=hla,
                         diagnosis=sc["diagnosis"], phone=phone(), reg_days=sc["req_days"] + random.randint(10, 90), status="ACTIVE"))
    sc["patient"] = pid
    sc["sample_ids"] = []
    for i, (code, level) in enumerate(sc["donors"]):
        dlogin = sc.get("donor_login") if i == 0 else None
        d = add_donor(degrade(hla, level), reg_days=random.randint(500, 900), login=dlogin,
                      blood=patients[-1]["blood"] if level == 6 else None)
        add_consents(d)
        s = add_sample(d, sc["type"], code, d["reg_days"] - random.randint(10, 60))
        sc["sample_ids"].append((s["id"], level))

# ---- background patients (common alleles)
bg_requests = [
    dict(doctor=2, type="CORD_BLOOD", urgency="CRITICAL", end="PENDING", diagnosis="Juvenile Myelomonocytic Leukemia", login="patient.meena"),
    dict(doctor=9, type="PBSC", urgency="ROUTINE", end="PENDING", diagnosis="Hodgkin Lymphoma (relapsed)"),
    dict(doctor=4, type="BONE_MARROW", urgency="URGENT", end="PENDING", diagnosis="Acute Myeloid Leukemia"),
    dict(doctor=3, type="CORD_BLOOD", urgency="ROUTINE", end="REJECTED", diagnosis="Acute Lymphoblastic Leukemia"),
    dict(doctor=13, type="PBSC", urgency="URGENT", end="CANCELLED", diagnosis="Non-Hodgkin Lymphoma"),
]
for b in bg_requests:
    gender = random.choice("MF")
    pid = len(patients) + 1
    hla = common_hla()
    b["req_days"] = random.randint(3, 40)
    patients.append(dict(id=pid, user_id=add_user(b["login"], "PATIENT", 60) if b.get("login") else None,
                         name=person(gender), dob=dob(4, 60), gender=gender, blood=random.choice(BLOOD), hla=hla,
                         diagnosis=b["diagnosis"], phone=phone(), reg_days=b["req_days"] + random.randint(10, 90), status="ACTIVE"))
    b["patient"] = pid

# patients without requests: one not yet HLA-typed, one inactive
for extra in [dict(hla=None, status="ACTIVE", diagnosis="Sickle Cell Disease"),
              dict(hla=common_hla(), status="INACTIVE", diagnosis="Aplastic Anemia (in remission)")]:
    gender = random.choice("MF")
    patients.append(dict(id=len(patients) + 1, user_id=None, name=person(gender), dob=dob(10, 50), gender=gender,
                         blood=random.choice(BLOOD), hla=extra["hla"], diagnosis=extra["diagnosis"], phone=phone(),
                         reg_days=random.randint(20, 300), status=extra["status"]))

# live-demo donors for the PENDING Chennai cord-blood request
demo_patient = patients[bg_requests[0]["patient"] - 1]
for level, code in [(6, "CHN-AD-LN2-01"), (5, "CHN-MC-LN2-01"), (4, "BLR-DB-LN2-01")]:
    d = add_donor(degrade(demo_patient["hla"], level), reg_days=random.randint(300, 600),
                  login="donor.karthik" if level == 6 else None, gender="M" if level == 6 else None)
    add_consents(d)
    add_sample(d, "CORD_BLOOD", code, d["reg_days"] - 20)

# ---- background donors with mixed fates
storable = [l[2] for l in locations if l[2] != "MDU-MH-ULT-01"]
fates = (["RELEASE"] * 26) + ["QUARANTINE"] * 3 + ["FAIL"] * 2 + ["EXPIRED"] * 2 + ["EXPIRING"] * 3 + ["REVOKE"] + ["STORAGE_EXPIRED"]
random.shuffle(fates)
fi = 0
for n in range(24):
    d = add_donor(common_hla(), reg_days=random.randint(120, 1400))
    storage_valid = None
    n_samples = 1 if random.random() < 0.6 else 2
    for _ in range(n_samples):
        fate = fates[fi] if fi < len(fates) else "RELEASE"
        fi += 1
        stype = random.choice(["CORD_BLOOD", "BONE_MARROW", "PBSC"])
        code = random.choice(storable)
        days = max(15, d["reg_days"] - random.randint(5, 100))
        expiry = None
        if fate == "EXPIRED":
            stype = random.choice(["BONE_MARROW", "PBSC"])
            days = max(days, 400)
            expiry = ("ago", random.randint(3, 40))
        elif fate == "EXPIRING":
            stype = random.choice(["BONE_MARROW", "PBSC"])
            days = max(days, 400)
            expiry = ("ahead", random.choice([5, 18, 45]))
        if days > d["reg_days"] - 5:
            d["reg_days"] = days + 5  # registration (and consent) precede collection
        if fate == "STORAGE_EXPIRED":
            storage_valid = ("ago", 2)
        add_sample(d, stype, code, days, fate=fate, expiry=expiry)
    add_consents(d, storage_valid=storage_valid)

# donors who are deferred / withdrawn / not typed (no samples)
for status, hla in [("DEFERRED", common_hla()), ("WITHDRAWN", common_hla()), ("ACTIVE", None)]:
    d = add_donor(hla, reg_days=random.randint(30, 400), status=status)
    consents.append(dict(donor=d["id"], type="COLLECTION", days=d["reg_days"], valid=None))

# ------------------------------------------------------------------ SQL
w("-- =====================================================================")
w("--  StemVault – 06_seed.sql  (generated by tools/generate_seed.py)")
w("--  Fictional data. Every login password: StemVault@123")
w("--  Dates are relative to CURDATE() so the data stays consistent.")
w("-- =====================================================================")
w("USE stemvault;")
w("SET @app_user_id = NULL;")
w("")
w("-- users -----------------------------------------------------------------")
w("INSERT INTO `user` (user_id, username, password_hash, role, status, created_at) VALUES")
w(",\n".join(f"({u[0]}, {q(u[1])}, {q(PASSWORD_HASH)}, {q(u[2])}, {q(u[3])}, NOW() - INTERVAL {u[4]} DAY)" for u in users) + ";")
w("SET @app_user_id = 1;  -- audit rows below are attributed to the admin")
w("")
w("-- hospitals -------------------------------------------------------------")
w("INSERT INTO hospital (hospital_id, hospital_name, registration_no, address_line, city, district, state, pincode, phone, email, registered_on, status) VALUES")
w(",\n".join(f"({h[0]}, {q(h[1])}, {q(h[2])}, {q(h[3])}, {q(h[4])}, {q(h[5])}, {q(h[6])}, {q(h[7])}, {q(h[8])}, {q(h[9])}, {ago(h[10])}, 'ACTIVE')" for h in hospitals) + ";")
w("")
w("-- storage units ---------------------------------------------------------")
w("INSERT INTO storage_location (location_id, hospital_id, location_code, storage_area, storage_type, capacity) VALUES")
w(",\n".join(f"({l[0]}, {l[1]}, {q(l[2])}, {q(l[3])}, {q(l[4])}, {l[5]})" for l in locations) + ";")
w("")
w("-- doctors ---------------------------------------------------------------")
w("INSERT INTO doctor (doctor_id, user_id, hospital_id, full_name, specialization, medical_reg_no, phone, email) VALUES")
w(",\n".join(f"({d[0]}, {d[1]}, {d[3]}, {q(d[4])}, {q(d[5])}, {q(d[6])}, {q(phone())}, {q(d[2].replace('dr.', '') + '@doctors.example.in')})" for d in doctors) + ";")
w("")


def hla_sql(h):
    return ", ".join(q(x) for x in (h or [None] * 6))


w("-- donors ----------------------------------------------------------------")
w("INSERT INTO donor (donor_id, user_id, full_name, date_of_birth, gender, blood_group, hla_a_1, hla_a_2, hla_b_1, hla_b_2, hla_drb1_1, hla_drb1_2, phone, email, address, registration_date, status) VALUES")
w(",\n".join(f"({d['id']}, {q(d['user_id'])}, {q(d['name'])}, {q(d['dob'])}, {q(d['gender'])}, {q(d['blood'])}, {hla_sql(d['hla'])}, {q(d['phone'])}, {q(d['email'])}, {q(d['address'])}, {ago(d['reg_days'])}, 'ACTIVE')" for d in donors) + ";")
w("")
w("-- patients --------------------------------------------------------------")
w("INSERT INTO patient (patient_id, user_id, full_name, date_of_birth, gender, blood_group, hla_a_1, hla_a_2, hla_b_1, hla_b_2, hla_drb1_1, hla_drb1_2, diagnosis, phone, email, address, registration_date, status) VALUES")
w(",\n".join(f"({p['id']}, {q(p['user_id'])}, {q(p['name'])}, {q(p['dob'])}, {q(p['gender'])}, {q(p['blood'])}, {hla_sql(p['hla'])}, {q(p['diagnosis'])}, {q(p['phone'])}, NULL, NULL, {ago(p['reg_days'])}, 'ACTIVE')" for p in patients) + ";")
w("")
w("-- consents -------------------------------------------------------------")
w("INSERT INTO consent (donor_id, consent_type, consent_date, valid_until) VALUES")


def valid_sql(v):
    if v is None:
        return "NULL"
    return ago(v[1]) if v[0] == "ago" else ahead(v[1])


rows = []
for c in consents:
    valid = c["valid"]
    if valid is None and c["type"] == "STORAGE":
        valid = ("ahead", 10 * 365 - c["days"])
    rows.append(f"({c['donor']}, {q(c['type'])}, {ago(c['days'])}, {valid_sql(valid)})")
w(",\n".join(rows) + ";")
w("")
w("-- samples: collected, then tested, then released through sp_release_sample")
w("INSERT INTO stem_cell_sample (sample_id, donor_id, sample_type, collection_date, volume_ml, cd34_count, processing_status, expiry_date) VALUES")
rows = []
for s in samples:
    exp = "NULL" if s["expiry"] is None else (ago(s["expiry"][1]) if s["expiry"][0] == "ago" else ahead(s["expiry"][1]))
    proc = "QUARANTINE" if s["fate"] == "QUARANTINE" else "PROCESSING"
    rows.append(f"({s['id']}, {s['donor']}, {q(s['type'])}, {ago(s['days'])}, {s['vol']}, {s['cd34'] if s['fate'] != 'QUARANTINE' else 'NULL'}, {q(proc)}, {exp})")
w(",\n".join(rows) + ";")
w("")
w("-- laboratory tests ------------------------------------------------------")
w("INSERT INTO sample_test (sample_id, test_type, test_date, result, test_status, remarks, performed_by) VALUES")
rows = []
results = {"HLA_TYPING": "Typed at A, B, DRB1 (high resolution)", "INFECTIOUS_SCREEN": "HIV, HBV, HCV, syphilis, CMV negative",
           "STERILITY": "No growth at 14 days", "VIABILITY": None, "CD34_COUNT": None}
for s in samples:
    base = max(1, s["days"] - random.randint(1, 4))
    staff_id = random.choice([2, 3, 4, 5])
    sample_rows = []
    for i, t in enumerate(["HLA_TYPING", "INFECTIOUS_SCREEN", "STERILITY", "VIABILITY", "CD34_COUNT"]):
        dt = f"NOW() - INTERVAL {base * 24 - i * 3} HOUR"
        if s["fate"] == "QUARANTINE" and t in ("STERILITY", "VIABILITY", "CD34_COUNT"):
            sample_rows.append(f"({s['id']}, {q(t)}, {dt}, NULL, 'PENDING', 'Awaiting result', {staff_id})")
            continue
        status, res, rem = "PASSED", results[t], None
        if t == "VIABILITY":
            res = f"{random.randint(88, 98)}% viable (7-AAD)"
        if t == "CD34_COUNT":
            res = str(s["cd34"])
        if s["fate"] == "FAIL" and t == "INFECTIOUS_SCREEN":
            status, res, rem = "FAILED", "HBsAg reactive", "Confirmed on repeat; unit to be discarded"
        sample_rows.append(f"({s['id']}, {q(t)}, {dt}, {q(res)}, {q(status)}, {q(rem)}, {staff_id})")
    # a failed test discards the unit, so it is recorded after the others
    sample_rows.sort(key=lambda r: "'FAILED'" in r)
    rows.extend(sample_rows)
w(",\n".join(rows) + ";")
w("")
w("-- release tested samples into storage (procedure checks tests, consent, capacity)")
for s in samples:
    if s["fate"] in ("RELEASE", "EXPIRING", "REVOKE", "STORAGE_EXPIRED"):
        w(f"CALL sp_release_sample({s['id']}, {s['loc']}, {q(next_slot(s['loc']))});")
w("")
w("-- past-expiry units: stored but not offered; the maintenance job expires them")
for s in samples:
    if s["fate"] == "EXPIRED":
        w(f"UPDATE stem_cell_sample SET processing_status = 'RELEASED', location_id = {s['loc']}, storage_position = {q(next_slot(s['loc']))} WHERE sample_id = {s['id']};")
w("")
w("-- consent revocation withdraws that donor's available units (trigger)")
for s in samples:
    if s["fate"] == "REVOKE":
        w(f"CALL sp_revoke_consent((SELECT consent_id FROM consent WHERE donor_id = {s['donor']} AND consent_type = 'CLINICAL_USE'), 'Donor asked to withdraw from clinical use');")
w("CALL sp_daily_maintenance(1);")
w("")

# ---- requests
w("-- transplant requests ---------------------------------------------------")
all_requests = []
rid = 0
for sc in scenarios:
    rid += 1
    sc["rid"] = rid
    all_requests.append((rid, sc))
for b in bg_requests:
    rid += 1
    b["rid"] = rid
    all_requests.append((rid, b))

for rid_, r in all_requests:
    days = r["req_days"]
    min_hla = 4
    w(f"INSERT INTO transplant_request (request_id, patient_id, doctor_id, request_date, required_sample_type, min_hla_match, urgency) "
      f"VALUES ({rid_}, {r['patient']}, {r['doctor']}, NOW() - INTERVAL {days} DAY, {q(r['type'])}, {min_hla}, {q(r['urgency'])});")
w("")
w("-- reviews ---------------------------------------------------------------")
for rid_, r in all_requests:
    if r["end"] == "PENDING":
        continue
    reviewer = random.choice([1, 2, 3])
    if r["end"] == "REJECTED":
        w(f"CALL sp_review_request({rid_}, {reviewer}, 'REJECTED', 'Patient not in remission yet; resubmit after induction therapy');")
    else:
        w(f"CALL sp_review_request({rid_}, {reviewer}, 'APPROVED', 'Clinical criteria met');")
    # backdate the review so history reads in order
    w(f"UPDATE transplant_request SET reviewed_at = request_date + INTERVAL 1 DAY WHERE request_id = {rid_};")
w("")
w("-- tiered search + shortlist (sp_find_candidates saves the nearest tier) ---")
for sc in scenarios:
    if sc["end"] in ("SHORTLISTED", "APPROVED", "ALLOCATED"):
        w(f"CALL sp_find_candidates({sc['rid']}, 1);")
w("")
w("-- allocations, transplants ---------------------------------------------")
for sc in scenarios:
    if sc["end"] in ("ALLOCATED", "SCHEDULED", "COMPLETED"):
        best = max(sc["sample_ids"], key=lambda x: x[1])[0]
        w(f"CALL sp_allocate_sample({sc['rid']}, {best});")
        w(f"UPDATE request_sample SET allocation_date = (SELECT request_date + INTERVAL 3 DAY FROM transplant_request WHERE request_id = {sc['rid']}) WHERE request_id = {sc['rid']} AND sample_id = {best};")
    if sc["end"] == "SCHEDULED":
        w(f"CALL sp_schedule_transplant({sc['rid']}, CURDATE() + INTERVAL 10 DAY, 'Conditioning regimen starts one week before', @t);")
    if sc["end"] == "COMPLETED":
        tx_days = sc["req_days"] - 20
        w(f"CALL sp_schedule_transplant({sc['rid']}, CURDATE() - INTERVAL {tx_days} DAY, 'Myeloablative conditioning', @t);")
        remark = "Neutrophil engraftment on day +18" if sc["outcome"] == "ENGRAFTED" else "Grade II acute GVHD, responding to steroids"
        w(f"CALL sp_complete_transplant(@t, {q(sc['outcome'])}, {q(remark)});")
w("")
w("-- a cancelled request ----------------------------------------------------")
for b in bg_requests:
    if b["end"] == "CANCELLED":
        w(f"CALL sp_cancel_request({b['rid']}, 'Patient transferred to another centre');")
w("")
w("-- one storage unit taken offline for maintenance (excluded from search)")
w("UPDATE storage_location SET current_status = 'MAINTENANCE' WHERE location_code = 'PNQ-SH-LN2-01';")
w("UPDATE hospital SET status = 'SUSPENDED' WHERE hospital_id = 13;")
w("UPDATE patient SET status = 'INACTIVE' WHERE diagnosis = 'Aplastic Anemia (in remission)';")
w("UPDATE donor SET status = 'DEFERRED' WHERE donor_id = %d;" % (len(donors) - 2))
w("UPDATE donor SET status = 'WITHDRAWN' WHERE donor_id = %d;" % (len(donors) - 1))
w("SET @app_user_id = NULL;")
w("")

# summary comments for the README / viva
w("-- ---------------------------------------------------------------------")
w("-- Scenario map (request_id -> what it demonstrates)")
for sc in scenarios:
    w(f"--   request {sc['rid']}: {sc['end']:<11} {sc['note']}")
for b in bg_requests:
    w(f"--   request {b['rid']}: {b['end']:<11} background request")
w("-- ---------------------------------------------------------------------")

Path(__file__).resolve().parent.parent.joinpath("06_seed.sql").write_text("\n".join(out) + "\n", encoding="utf-8")
print("donors", len(donors), "patients", len(patients), "samples", len(samples), "users", len(users))
