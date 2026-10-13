"""
StemVault seed generator (large data set)
-----------------------------------------
Writes ../06_seed.sql with synthetic, fictional data at registry scale:

    24 hospitals · 48 storage tanks · 26 doctors · 9 bank staff · 3 admins
    ~1600 donors · ~950 patients · ~2100 stem cell units · ~420 requests

Design notes
* Dates are written relative to CURDATE(), so the data stays consistent
  whenever the script is run.
* Rows pass through the real triggers and stored procedures, so loading the
  seed is itself a test of the database logic.
* Scenario patients (requests 1-8) carry three "private" HLA alleles that only
  their own donors share, so the tiered-search demonstration cannot be spoiled
  by a background donor matching by accident.
* Background patients and donors draw from the common allele pools, so ordinary
  searches return realistic candidate lists.

Run:  python generate_seed.py
"""
import random
from pathlib import Path

random.seed(42)
PASSWORD_HASH = "$2a$10$h58GjpqukFaIlDcbcR5gGO8EhuK/0kw2VKit86aR7tzFljnkllqta"  # StemVault@123

N_DONORS = 1600
N_PATIENTS = 950
N_BACKGROUND_REQUESTS = 407          # plus the 13 scenario requests

out = []
w = out.append


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def ago(days):
    return f"CURDATE() - INTERVAL {days} DAY"


def ahead(days):
    return f"CURDATE() + INTERVAL {days} DAY"


def emit_insert(table, cols, rows, batch=300):
    """Multi-row INSERT in batches, so no single statement becomes unwieldy."""
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        w(f"INSERT INTO {table} ({', '.join(cols)}) VALUES")
        w(",\n".join(chunk) + ";")


# ---------------------------------------------------------------- HLA pools
CA = ["A*01:01", "A*02:01", "A*11:01", "A*24:02", "A*33:03", "A*02:06", "A*24:07", "A*11:02"]
CB = ["B*07:02", "B*15:01", "B*35:01", "B*40:06", "B*44:03", "B*51:01", "B*35:03", "B*40:01", "B*55:01", "B*15:02"]
CD = ["DRB1*03:01", "DRB1*07:01", "DRB1*11:01", "DRB1*15:01", "DRB1*13:02", "DRB1*15:02", "DRB1*11:04", "DRB1*13:01"]
UA = ["A*26:01", "A*31:01", "A*68:01", "A*29:02", "A*32:01", "A*03:01", "A*30:01", "A*23:01"]
UB = ["B*57:01", "B*52:01", "B*37:01", "B*58:01", "B*13:01", "B*18:01", "B*27:05", "B*08:01"]
UD = ["DRB1*04:01", "DRB1*14:01", "DRB1*10:01", "DRB1*12:01", "DRB1*16:02", "DRB1*01:01", "DRB1*09:01", "DRB1*08:03"]
BLOOD = ["O+"] * 9 + ["B+"] * 8 + ["A+"] * 7 + ["AB+"] * 3 + ["O-"] * 2 + ["A-"] * 2 + ["B-"] * 2 + ["AB-"]


def common_hla():
    return [random.choice(CA), random.choice(CA), random.choice(CB), random.choice(CB),
            random.choice(CD), random.choice(CD)]


def scenario_hla(k):
    return [UA[k], random.choice(CA), UB[k], random.choice(CB), UD[k], random.choice(CD)]


def other(pool, current):
    return random.choice([a for a in pool if a != current])


def degrade(hla, level):
    """A donor typing that matches `hla` at `level` of the 6 alleles (6, 5 or 4)."""
    h = list(hla)
    if level <= 5:
        h[1] = other(CA, h[1])
    if level <= 4:
        h[3] = other(CB, h[3])
    return h


# ------------------------------------------------------------- hospitals
# id, name, regno, address, city, district, state, pincode
HOSPITAL_DATA = [
    ("Marina Coast Multispeciality Hospital", "TN-HSP-1001", "12 Beach Road", "Chennai", "Chennai", "Tamil Nadu", "600004"),
    ("Adyar Stem Cell & Transplant Centre", "TN-HSP-1002", "45 Gandhi Nagar Main Road", "Chennai", "Chennai", "Tamil Nadu", "600020"),
    ("Kovai Regional Cancer Institute", "TN-HSP-1003", "8 Avinashi Road", "Coimbatore", "Coimbatore", "Tamil Nadu", "641014"),
    ("Meenakshi Hematology Hospital", "TN-HSP-1004", "21 Anna Nagar", "Madurai", "Madurai", "Tamil Nadu", "625020"),
    ("Deccan Blood & Marrow Institute", "KA-HSP-2001", "90 Hosur Road", "Bengaluru", "Bengaluru Urban", "Karnataka", "560034"),
    ("Chamundi Medical College Hospital", "KA-HSP-2002", "3 Irwin Road", "Mysuru", "Mysuru", "Karnataka", "570001"),
    ("Periyar Riverside Hospital", "KL-HSP-3001", "14 MG Road", "Kochi", "Ernakulam", "Kerala", "682016"),
    ("Arabian Sea Cancer Centre", "MH-HSP-4001", "77 Linking Road", "Mumbai", "Mumbai Suburban", "Maharashtra", "400050"),
    ("Sahyadri Transplant Hospital", "MH-HSP-4002", "5 FC Road", "Pune", "Pune", "Maharashtra", "411004"),
    ("Yamuna National Stem Cell Bank", "DL-HSP-5001", "1 Ring Road", "New Delhi", "New Delhi", "Delhi", "110029"),
    ("Charminar Bone Marrow Centre", "TG-HSP-6001", "30 Road No 2, Banjara Hills", "Hyderabad", "Hyderabad", "Telangana", "500034"),
    ("Hooghly Riverside Cancer Hospital", "WB-HSP-7001", "18 Park Street", "Kolkata", "Kolkata", "West Bengal", "700016"),
    ("Konkan Coastal Hospital", "MH-HSP-4003", "9 Station Road", "Ratnagiri", "Ratnagiri", "Maharashtra", "415612"),
    # added for the larger data set
    ("Vellore Institute of Hematology", "TN-HSP-1005", "6 Katpadi Road", "Vellore", "Vellore", "Tamil Nadu", "632014"),
    ("Cauvery Delta Medical Centre", "TN-HSP-1006", "27 Big Street", "Thanjavur", "Thanjavur", "Tamil Nadu", "613001"),
    ("Mangala Cord Blood Bank", "KA-HSP-2003", "41 Kadri Road", "Mangaluru", "Dakshina Kannada", "Karnataka", "575002"),
    ("Hubli Regional Transplant Unit", "KA-HSP-2004", "2 Gokul Road", "Hubballi", "Dharwad", "Karnataka", "580030"),
    ("Backwater Children's Hospital", "KL-HSP-3002", "11 Beach Road", "Kozhikode", "Kozhikode", "Kerala", "673001"),
    ("Godavari Cancer Institute", "AP-HSP-8001", "55 Dwaraka Nagar", "Visakhapatnam", "Visakhapatnam", "Andhra Pradesh", "530016"),
    ("Sabarmati Blood & Marrow Centre", "GJ-HSP-9001", "72 Ashram Road", "Ahmedabad", "Ahmedabad", "Gujarat", "380009"),
    ("Aravalli Transplant Hospital", "RJ-HSP-1101", "19 Tonk Road", "Jaipur", "Jaipur", "Rajasthan", "302015"),
    ("Ganga Medical College Hospital", "UP-HSP-1201", "8 Assi Ghat Road", "Varanasi", "Varanasi", "Uttar Pradesh", "221005"),
    ("Chenab Valley Hospital", "PB-HSP-1301", "4 Mall Road", "Amritsar", "Amritsar", "Punjab", "143001"),
    ("Narmada Institute of Hematology", "MP-HSP-1401", "33 Link Road", "Bhopal", "Bhopal", "Madhya Pradesh", "462016"),
]
hospitals = []
for i, (name, regno, addr, city, district, state, pin) in enumerate(HOSPITAL_DATA, start=1):
    hospitals.append(dict(id=i, name=name, regno=regno, addr=addr, city=city, district=district,
                          state=state, pin=pin, days=random.randint(700, 3000)))

ACTIVE_HOSPITALS = [h for h in hospitals if h["id"] not in (13, 24)]   # 13 suspended, 24 inactive


# ------------------------------------------------------------- storage tanks
STORAGE_TYPES = ["LN2_LIQUID", "LN2_VAPOUR", "ULT_FREEZER"]
locations = []
lid = 0
for h in hospitals:
    for n in range(1, 3):                                   # two tanks per hospital
        lid += 1
        state_code = h["regno"].split("-")[0]
        locations.append(dict(
            id=lid, hospital=h["id"],
            code=f"{state_code}-{h['id']:02d}-TNK-{n:02d}",
            area=random.choice(["Main cryobank hall", "Cryo room, block B", "Processing lab annex",
                                "Hematology lab", "Transplant unit store", "National repository hall"]),
            type=random.choice(STORAGE_TYPES),
            capacity=random.choice([150, 200, 250, 300, 400]),
        ))
loc_by_hospital = {}
for l in locations:
    loc_by_hospital.setdefault(l["hospital"], []).append(l)

MAINTENANCE_LOCATIONS = [18, 31]        # set at the end, after units are stored
DECOMMISSIONED_LOCATIONS = [47]
slot_counter = {l["id"]: 0 for l in locations}


def next_slot(loc_id):
    i = slot_counter[loc_id]
    slot_counter[loc_id] += 1
    return f"R{i // 100 + 1:02d}-B{(i // 10) % 10 + 1:02d}-S{i % 10 + 1:02d}"


def storable_locations(hospital_id):
    return [l for l in loc_by_hospital[hospital_id]
            if l["id"] not in MAINTENANCE_LOCATIONS + DECOMMISSIONED_LOCATIONS]


# ------------------------------------------------------------- user accounts
users = []            # (id, username, role, status, created days ago)
next_user_id = 1


def add_user(username, role, days_ago, status="ACTIVE"):
    global next_user_id
    uid = next_user_id
    next_user_id += 1
    users.append((uid, username, role, status, days_ago))
    return uid


ADMINS = ["admin", "admin.priya", "admin.rakesh"]
admin_ids = [add_user(u, "ADMIN", 3000) for u in ADMINS]

STAFF = ["staff.kavya", "staff.rahul", "staff.meera", "staff.imran", "staff.divya",
         "staff.joseph", "staff.anand", "staff.sneha", "staff.farhan"]
staff_ids = [add_user(u, "BANK_STAFF", random.randint(600, 2200)) for u in STAFF]

DOCTOR_DATA = [
    ("dr.ananya", 1, "Dr. Ananya Raghavan", "Clinical Hematology", "TNMC-48213"),
    ("dr.vikram", 1, "Dr. Vikram Sundaram", "Bone Marrow Transplantation", "TNMC-51877"),
    ("dr.farah", 2, "Dr. Farah Siddiqui", "Pediatric Hemato-Oncology", "TNMC-60342"),
    ("dr.senthil", 3, "Dr. Senthil Kumar", "Medical Oncology", "TNMC-39021"),
    ("dr.lakshmi", 4, "Dr. Lakshmi Narayanan", "Clinical Hematology", "TNMC-44109"),
    ("dr.rohan", 5, "Dr. Rohan Hegde", "Bone Marrow Transplantation", "KMC-72290"),
    ("dr.deepa", 6, "Dr. Deepa Urs", "Clinical Hematology", "KMC-68814"),
    ("dr.joseph", 7, "Dr. Joseph Mathew", "Hemato-Oncology", "TCMC-33457"),
    ("dr.aditi", 8, "Dr. Aditi Kulkarni", "Bone Marrow Transplantation", "MMC-90126"),
    ("dr.nikhil", 9, "Dr. Nikhil Deshpande", "Clinical Hematology", "MMC-87543"),
    ("dr.harpreet", 10, "Dr. Harpreet Sethi", "Bone Marrow Transplantation", "DMC-25518"),
    ("dr.sravani", 11, "Dr. Sravani Reddy", "Pediatric Bone Marrow Transplantation", "TSMC-41962"),
    ("dr.arindam", 12, "Dr. Arindam Bose", "Medical Oncology", "WBMC-57730"),
    ("dr.kiran", 14, "Dr. Kiran Balaji", "Clinical Hematology", "TNMC-70418"),
    ("dr.shruti", 14, "Dr. Shruti Venkat", "Pediatric Hemato-Oncology", "TNMC-71260"),
    ("dr.murali", 15, "Dr. Murali Krishnan", "Medical Oncology", "TNMC-66835"),
    ("dr.nithya", 16, "Dr. Nithya Shenoy", "Clinical Hematology", "KMC-80114"),
    ("dr.basava", 17, "Dr. Basavaraj Patil", "Bone Marrow Transplantation", "KMC-83907"),
    ("dr.rehana", 18, "Dr. Rehana Thomas", "Pediatric Hemato-Oncology", "TCMC-40551"),
    ("dr.prasad", 19, "Dr. Prasad Varma", "Clinical Hematology", "APMC-29384"),
    ("dr.jignesh", 20, "Dr. Jignesh Trivedi", "Bone Marrow Transplantation", "GMC-61209"),
    ("dr.sunita", 21, "Dr. Sunita Rathore", "Medical Oncology", "RMC-35742"),
    ("dr.alok", 22, "Dr. Alok Tripathi", "Clinical Hematology", "UPMC-18876"),
    ("dr.gurpreet", 23, "Dr. Gurpreet Dhillon", "Bone Marrow Transplantation", "PMC-50463"),
    ("dr.meenal", 24, "Dr. Meenal Saxena", "Clinical Hematology", "MPMC-27650"),
    ("dr.tejas", 9, "Dr. Tejas Phadke", "Pediatric Hemato-Oncology", "MMC-91884"),
]
doctors = []
for i, (username, hosp, name, spec, regno) in enumerate(DOCTOR_DATA, start=1):
    uid = add_user(username, "DOCTOR", random.randint(400, 1800))
    doctors.append(dict(id=i, user_id=uid, hospital=hosp, name=name, spec=spec, regno=regno))

ACTIVE_DOCTORS = [d for d in doctors if d["hospital"] not in (13, 24)]
doctor_hospital = {d["id"]: d["hospital"] for d in doctors}
hospital_by_id = {h["id"]: h for h in hospitals}


# ------------------------------------------------------------- name pools
FIRST_F = ["Priya", "Divya", "Keerthana", "Sneha", "Aishwarya", "Nandini", "Pooja", "Revathi", "Shalini",
           "Meghana", "Anjali", "Fathima", "Swathi", "Ritika", "Harini", "Neha", "Kavya", "Lavanya",
           "Vaishnavi", "Ananya", "Sahana", "Deepika", "Bhavana", "Ishita", "Madhuri", "Reshma", "Trisha",
           "Yamini", "Gayathri", "Sowmya", "Rupali", "Charulatha", "Aarthi", "Jyothi", "Megha", "Nivedita"]
FIRST_M = ["Arun", "Karthik", "Suresh", "Rahul", "Manoj", "Ajay", "Prakash", "Naveen", "Sanjay", "Imran",
           "Gautham", "Vishal", "Rakesh", "Abdul", "Sai", "Varun", "Hari", "Dinesh", "Mohit", "Pranav",
           "Siddharth", "Aravind", "Nithin", "Rohit", "Kiran", "Vignesh", "Aditya", "Bharath", "Chetan",
           "Deepak", "Farhan", "Girish", "Jatin", "Lokesh", "Mahesh", "Nikhil"]
LAST = ["Iyer", "Menon", "Reddy", "Nair", "Sharma", "Patel", "Das", "Gupta", "Pillai", "Rao", "Khan",
        "Joshi", "Chatterjee", "Krishnan", "Bhat", "Verma", "Shetty", "Mishra", "Naidu", "Kulkarni",
        "Banerjee", "Desai", "Saxena", "Agarwal", "Chauhan", "Mehta", "Dutta", "Ghosh", "Kaur", "Singh",
        "Bose", "Raman", "Subramanian", "Varghese", "Thomas", "Prabhu", "Hegde", "Rathore", "Trivedi"]
STREETS = ["Anna Salai", "MG Road", "Station Road", "Nehru Street", "Temple Road", "Lake View Road",
           "Gandhi Nagar", "Church Street", "Market Road", "Hill View Avenue", "Park Lane", "Cross Street"]

DIAGNOSES = ["Acute Myeloid Leukemia", "Acute Lymphoblastic Leukemia", "Chronic Myeloid Leukemia",
             "Severe Aplastic Anemia", "Beta Thalassemia Major", "Sickle Cell Disease",
             "Myelodysplastic Syndrome", "Hodgkin Lymphoma (relapsed)", "Non-Hodgkin Lymphoma",
             "Multiple Myeloma", "Fanconi Anemia", "Juvenile Myelomonocytic Leukemia",
             "Severe Combined Immunodeficiency", "Chronic Lymphocytic Leukemia"]

used_phones = set()


def person_name(gender):
    return f"{random.choice(FIRST_F if gender == 'F' else FIRST_M)} {random.choice(LAST)}"


def phone():
    while True:
        p = str(random.choice([9, 8, 7, 6])) + "".join(str(random.randint(0, 9)) for _ in range(9))
        if p not in used_phones:
            used_phones.add(p)
            return p


def dob(min_age, max_age):
    y = 2026 - random.randint(min_age, max_age)
    return f"{y}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}"


def address():
    return f"{random.randint(1, 240)} {random.choice(STREETS)}"


# ------------------------------------------------------------- people stores
donors = []
patients = []
samples = []
consents = []
tests = []
requests = []


def add_donor(hla, reg_days, status="ACTIVE", blood=None, login=None, gender=None):
    gender = gender or random.choice("MF")
    did = len(donors) + 1
    name = person_name(gender)
    d = dict(id=did, user_id=add_user(login, "DONOR", reg_days) if login else None,
             name=name, dob=dob(18, 58), gender=gender, blood=blood or random.choice(BLOOD),
             hla=hla, phone=phone(),
             email=(name.lower().replace(" ", ".") + f"{did}@mail.example.in") if random.random() < 0.55 else None,
             address=address(), reg_days=reg_days, status=status)
    donors.append(d)
    return d


def add_patient(hla, reg_days, diagnosis=None, status="ACTIVE", login=None, gender=None, blood=None):
    gender = gender or random.choice("MF")
    pid = len(patients) + 1
    name = person_name(gender)
    p = dict(id=pid, user_id=add_user(login, "PATIENT", reg_days) if login else None,
             name=name, dob=dob(3, 66), gender=gender, blood=blood or random.choice(BLOOD),
             hla=hla, diagnosis=diagnosis or random.choice(DIAGNOSES), phone=phone(),
             email=(name.lower().replace(" ", ".") + f"p{pid}@mail.example.in") if random.random() < 0.4 else None,
             address=address(), reg_days=reg_days, status=status)
    patients.append(p)
    return p


def add_consents(d, storage_valid=None, clinical=True):
    consents.append(dict(donor=d["id"], type="COLLECTION", days=d["reg_days"], valid=None))
    consents.append(dict(donor=d["id"], type="STORAGE", days=d["reg_days"], valid=storage_valid))
    if clinical:
        consents.append(dict(donor=d["id"], type="CLINICAL_USE", days=d["reg_days"], valid=None))


def add_sample(d, stype, hospital_id, collected_days, fate="RELEASE", expiry=None):
    """fate: RELEASE | QUARANTINE | FAIL | EXPIRED | EXPIRING"""
    sid = len(samples) + 1
    vol = {"CORD_BLOOD": random.randint(40, 120), "BONE_MARROW": random.randint(600, 1400),
           "PBSC": random.randint(150, 380)}[stype]
    cd34 = {"CORD_BLOOD": random.uniform(1.5, 7), "BONE_MARROW": random.uniform(2.5, 9),
            "PBSC": random.uniform(4, 14)}[stype]
    if collected_days > d["reg_days"] - 5:
        d["reg_days"] = collected_days + 5           # registration and consent precede collection
    if expiry is None and stype != "CORD_BLOOD":
        expiry = ("ahead", max(30, 5 * 365 - collected_days))
    loc = random.choice(storable_locations(hospital_id))
    s = dict(id=sid, donor=d["id"], type=stype, loc=loc["id"], days=collected_days, vol=vol,
             cd34=round(cd34, 2), fate=fate, expiry=expiry, hospital=hospital_id)
    samples.append(s)
    return s


# =====================================================================
# 1. the eight tiered-search scenarios (requests 1-8)
# =====================================================================
scenarios = [
    dict(k=0, doctor=1, type="CORD_BLOOD", urgency="URGENT", end="SHORTLISTED",
         diagnosis="Acute Lymphoblastic Leukemia", donors=[(1, 6), (2, 5), (3, 6)],
         note="same-district match exists in Chennai, so the outer rings are not used"),
    dict(k=1, doctor=5, type="BONE_MARROW", urgency="CRITICAL", end="SHORTLISTED",
         diagnosis="Severe Aplastic Anemia", donors=[(3, 5), (2, 4), (10, 6)],
         note="nothing in Madurai; falls back to Tamil Nadu even though Delhi holds a 6/6"),
    dict(k=2, doctor=8, type="PBSC", urgency="URGENT", end="SHORTLISTED",
         diagnosis="Multiple Myeloma", donors=[(10, 6), (8, 5)],
         note="nothing in Kerala; falls back to the national ring"),
    dict(k=3, doctor=7, type="CORD_BLOOD", urgency="ROUTINE", end="APPROVED",
         diagnosis="Beta Thalassemia Major", donors=[],
         note="no compatible unit anywhere in India"),
    dict(k=4, doctor=6, type="PBSC", urgency="CRITICAL", end="ALLOCATED",
         diagnosis="Acute Myeloid Leukemia", donors=[(5, 6), (5, 5)],
         note="allocated, transplant not yet scheduled"),
    dict(k=5, doctor=10, type="BONE_MARROW", urgency="URGENT", end="SCHEDULED",
         diagnosis="Myelodysplastic Syndrome", donors=[(8, 6)], note="transplant scheduled"),
    dict(k=6, doctor=12, type="CORD_BLOOD", urgency="CRITICAL", end="COMPLETED", outcome="ENGRAFTED",
         diagnosis="Fanconi Anemia", donors=[(11, 6)],
         patient_login="patient.arjun", donor_login="donor.priya", note="completed, engrafted"),
    dict(k=7, doctor=11, type="BONE_MARROW", urgency="URGENT", end="COMPLETED", outcome="COMPLICATIONS",
         diagnosis="Chronic Myeloid Leukemia", donors=[(12, 6)],
         note="completed with complications, national match"),
]

for sc in scenarios:
    sc["req_days"] = random.randint(70, 110) if sc["end"] == "COMPLETED" else random.randint(3, 40)
    hla = scenario_hla(sc["k"])
    p = add_patient(hla, sc["req_days"] + random.randint(10, 90), diagnosis=sc["diagnosis"],
                    login=sc.get("patient_login"))
    sc["patient"] = p["id"]
    sc["sample_ids"] = []
    for i, (hospital_id, level) in enumerate(sc["donors"]):
        d = add_donor(degrade(hla, level), reg_days=random.randint(500, 900),
                      login=sc.get("donor_login") if i == 0 else None,
                      blood=p["blood"] if level == 6 else None)
        add_consents(d)
        s = add_sample(d, sc["type"], hospital_id, d["reg_days"] - random.randint(10, 60))
        sc["sample_ids"].append((s["id"], level))

# ------- five scenario-style background requests kept from the small data set
bg_fixed = [
    dict(doctor=2, type="CORD_BLOOD", urgency="CRITICAL", end="PENDING",
         diagnosis="Juvenile Myelomonocytic Leukemia", login="patient.meena", matched=[(1, 6), (1, 5), (5, 4)],
         donor_login="donor.karthik"),
    dict(doctor=9, type="PBSC", urgency="ROUTINE", end="PENDING", diagnosis="Hodgkin Lymphoma (relapsed)", matched=[]),
    dict(doctor=4, type="BONE_MARROW", urgency="URGENT", end="PENDING", diagnosis="Acute Myeloid Leukemia", matched=[]),
    dict(doctor=3, type="CORD_BLOOD", urgency="ROUTINE", end="REJECTED", diagnosis="Acute Lymphoblastic Leukemia", matched=[]),
    dict(doctor=13, type="PBSC", urgency="URGENT", end="CANCELLED", diagnosis="Non-Hodgkin Lymphoma", matched=[]),
]
for b in bg_fixed:
    b["req_days"] = random.randint(3, 40)
    hla = common_hla()
    p = add_patient(hla, b["req_days"] + random.randint(10, 90), diagnosis=b["diagnosis"], login=b.get("login"))
    b["patient"] = p["id"]
    b["sample_ids"] = []
    for i, (hospital_id, level) in enumerate(b["matched"]):
        d = add_donor(degrade(hla, level), reg_days=random.randint(300, 600),
                      login=b.get("donor_login") if level == 6 else None,
                      gender="M" if level == 6 else None)
        add_consents(d)
        s = add_sample(d, b["type"], hospital_id, d["reg_days"] - 20)
        b["sample_ids"].append((s["id"], level))

# requests 1-13 keep their original meaning
ordered_requests = []
rid = 0
for sc in scenarios:
    rid += 1
    sc["rid"] = rid
    sc["kind"] = "scenario"
    ordered_requests.append(sc)
for b in bg_fixed:
    rid += 1
    b["rid"] = rid
    b["kind"] = "fixed"
    ordered_requests.append(b)


# =====================================================================
# 2. background requests at scale
# =====================================================================
STATUS_MIX = (["PENDING"] * 140 + ["REJECTED"] * 55 + ["CANCELLED"] * 40 +
              ["APPROVED"] * 60 + ["ALLOCATED"] * 42 + ["SCHEDULED"] * 25 + ["COMPLETED"] * 45)
random.shuffle(STATUS_MIX)
STATUS_MIX = STATUS_MIX[:N_BACKGROUND_REQUESTS]

SHORTLIST_LIMIT = 30          # how many APPROVED requests get a stored shortlist
shortlisted = 0

for status in STATUS_MIX:
    rid += 1
    req_days = random.randint(90, 240) if status in ("COMPLETED",) else random.randint(2, 80)
    doc = random.choice(ACTIVE_DOCTORS)
    hosp = hospital_by_id[doc["hospital"]]
    hla = common_hla()
    stype = random.choice(["CORD_BLOOD", "BONE_MARROW", "PBSC"])
    p = add_patient(hla, req_days + random.randint(10, 120))

    r = dict(rid=rid, kind="bulk", patient=p["id"], doctor=doc["id"], type=stype,
             urgency=random.choice(["ROUTINE"] * 5 + ["URGENT"] * 3 + ["CRITICAL"] * 2),
             end=status, req_days=req_days, sample_ids=[], note="")

    # requests that must reach a unit get dedicated matching donors
    if status in ("APPROVED", "ALLOCATED", "SCHEDULED", "COMPLETED"):
        tier_choice = random.random()
        same_district = [h for h in ACTIVE_HOSPITALS
                         if h["state"] == hosp["state"] and h["district"] == hosp["district"]]
        same_state = [h for h in ACTIVE_HOSPITALS if h["state"] == hosp["state"]]
        if tier_choice < 0.5 and same_district:
            pool = same_district
        elif tier_choice < 0.8:
            pool = same_state
        else:
            pool = ACTIVE_HOSPITALS
        for level in ([6, 5] if random.random() < 0.5 else [6]):
            target = random.choice(pool)
            d = add_donor(degrade(hla, level), reg_days=random.randint(200, 900),
                          blood=p["blood"] if level == 6 else None)
            add_consents(d)
            s = add_sample(d, stype, target["id"], max(20, d["reg_days"] - random.randint(10, 80)))
            r["sample_ids"].append((s["id"], level))
        if status == "APPROVED" and shortlisted < SHORTLIST_LIMIT:
            r["shortlist"] = True
            shortlisted += 1
    if status == "COMPLETED":
        r["outcome"] = random.choice(["ENGRAFTED"] * 6 + ["COMPLICATIONS"] * 3 + ["GRAFT_FAILURE"])
    ordered_requests.append(r)


# =====================================================================
# 3. the remaining population: donors and patients without a request
# =====================================================================
FATES = (["RELEASE"] * 78 + ["QUARANTINE"] * 6 + ["FAIL"] * 4 + ["EXPIRED"] * 4 +
         ["EXPIRING"] * 6 + ["REVOKE"] * 2)

while len(donors) < N_DONORS:
    reg_days = random.randint(60, 1700)
    status = random.choices(["ACTIVE", "DEFERRED", "WITHDRAWN"], weights=[94, 4, 2])[0]
    typed = random.random() < 0.93
    d = add_donor(common_hla() if typed else None, reg_days=reg_days, status=status)

    if status != "ACTIVE" or not typed:
        consents.append(dict(donor=d["id"], type="COLLECTION", days=d["reg_days"], valid=None))
        continue

    storage_valid = None
    revoke = False
    n_samples = random.choices([0, 1, 2], weights=[14, 72, 14])[0]
    for _ in range(n_samples):
        fate = random.choice(FATES)
        stype = random.choice(["CORD_BLOOD"] * 4 + ["BONE_MARROW"] * 3 + ["PBSC"] * 3)
        hospital_id = random.choice(ACTIVE_HOSPITALS)["id"]
        days = max(15, d["reg_days"] - random.randint(5, 120))
        expiry = None
        if fate == "EXPIRED":
            stype = random.choice(["BONE_MARROW", "PBSC"])
            days = max(days, 420)
            expiry = ("ago", random.randint(3, 60))
        elif fate == "EXPIRING":
            stype = random.choice(["BONE_MARROW", "PBSC"])
            days = max(days, 400)
            expiry = ("ahead", random.choice([5, 12, 18, 30, 45, 55]))
        if fate == "REVOKE":
            revoke = True
        add_sample(d, stype, hospital_id, days, fate=fate, expiry=expiry)
    add_consents(d, storage_valid=storage_valid)
    if revoke:
        d["revoke_clinical"] = True

while len(patients) < N_PATIENTS:
    typed = random.random() < 0.95
    status = random.choices(["ACTIVE", "INACTIVE", "DECEASED"], weights=[92, 6, 2])[0]
    add_patient(common_hla() if typed else None, random.randint(20, 600), status=status)

# a handful of donor and patient portal logins beyond the demo accounts
for d in random.sample([x for x in donors if x["user_id"] is None and x["status"] == "ACTIVE"], 25):
    d["user_id"] = add_user(f"donor.{d['name'].split()[0].lower()}{d['id']}", "DONOR", d["reg_days"])
for p in random.sample([x for x in patients if x["user_id"] is None and x["status"] == "ACTIVE"], 20):
    p["user_id"] = add_user(f"patient.{p['name'].split()[0].lower()}{p['id']}", "PATIENT", p["reg_days"])


# =====================================================================
# 4. emit SQL
# =====================================================================
w("-- =====================================================================")
w("--  StemVault – 06_seed.sql   (generated by tools/generate_seed.py)")
w("--  Fictional demonstration data at registry scale.")
w(f"--  {len(hospitals)} hospitals · {len(locations)} storage tanks · {len(doctors)} doctors ·"
  f" {len(STAFF)} bank staff · {len(ADMINS)} admins")
w(f"--  {len(donors)} donors · {len(patients)} patients · {len(samples)} units ·"
  f" {len(ordered_requests)} transplant requests · {len(users)} accounts")
w("--  Every login password: StemVault@123")
w("--  Dates are relative to CURDATE(), so the data stays consistent.")
w("--  Loading takes a minute or two: rows pass through the real triggers")
w("--  and procedures, so the seed is itself a test of the database logic.")
w("-- =====================================================================")
w("USE stemvault;")
w("SET @app_user_id = NULL;")
w("SET autocommit = 1;")
w("")

w("-- accounts ---------------------------------------------------------------")
emit_insert("`user`", ["user_id", "username", "password_hash", "role", "status", "created_at"],
            [f"({u[0]}, {q(u[1])}, {q(PASSWORD_HASH)}, {q(u[2])}, {q(u[3])}, NOW() - INTERVAL {u[4]} DAY)"
             for u in users])
w("SET @app_user_id = 1;   -- audit rows below are attributed to the administrator")
w("")

w("-- hospitals --------------------------------------------------------------")
emit_insert("hospital",
            ["hospital_id", "hospital_name", "registration_no", "address_line", "city", "district",
             "state", "pincode", "phone", "email", "registered_on"],
            [f"({h['id']}, {q(h['name'])}, {q(h['regno'])}, {q(h['addr'])}, {q(h['city'])}, "
             f"{q(h['district'])}, {q(h['state'])}, {q(h['pin'])}, {q(phone())}, "
             f"{q(h['regno'].lower().replace('-', '') + '@hospitals.example.in')}, {ago(h['days'])})"
             for h in hospitals])
w("")

w("-- storage tanks ----------------------------------------------------------")
emit_insert("storage_location",
            ["location_id", "hospital_id", "location_code", "storage_area", "storage_type", "capacity"],
            [f"({l['id']}, {l['hospital']}, {q(l['code'])}, {q(l['area'])}, {q(l['type'])}, {l['capacity']})"
             for l in locations])
w("")

w("-- doctors ----------------------------------------------------------------")
emit_insert("doctor",
            ["doctor_id", "user_id", "hospital_id", "full_name", "specialization", "medical_reg_no", "phone", "email"],
            [f"({d['id']}, {d['user_id']}, {d['hospital']}, {q(d['name'])}, {q(d['spec'])}, {q(d['regno'])}, "
             f"{q(phone())}, {q(users[d['user_id'] - 1][1].replace('dr.', '') + '@doctors.example.in')})"
             for d in doctors])
w("")


def hla_sql(h):
    return ", ".join(q(x) for x in (h or [None] * 6))


w("-- donors -----------------------------------------------------------------")
emit_insert("donor",
            ["donor_id", "user_id", "full_name", "date_of_birth", "gender", "blood_group",
             "hla_a_1", "hla_a_2", "hla_b_1", "hla_b_2", "hla_drb1_1", "hla_drb1_2",
             "phone", "email", "address", "registration_date", "status"],
            [f"({d['id']}, {q(d['user_id'])}, {q(d['name'])}, {q(d['dob'])}, {q(d['gender'])}, {q(d['blood'])}, "
             f"{hla_sql(d['hla'])}, {q(d['phone'])}, {q(d['email'])}, {q(d['address'])}, "
             f"{ago(d['reg_days'])}, 'ACTIVE')" for d in donors])
w("")

w("-- patients ---------------------------------------------------------------")
emit_insert("patient",
            ["patient_id", "user_id", "full_name", "date_of_birth", "gender", "blood_group",
             "hla_a_1", "hla_a_2", "hla_b_1", "hla_b_2", "hla_drb1_1", "hla_drb1_2",
             "diagnosis", "phone", "email", "address", "registration_date", "status"],
            [f"({p['id']}, {q(p['user_id'])}, {q(p['name'])}, {q(p['dob'])}, {q(p['gender'])}, {q(p['blood'])}, "
             f"{hla_sql(p['hla'])}, {q(p['diagnosis'])}, {q(p['phone'])}, {q(p['email'])}, {q(p['address'])}, "
             f"{ago(p['reg_days'])}, 'ACTIVE')" for p in patients])
w("")

w("-- consents ---------------------------------------------------------------")


def valid_sql(v):
    if v is None:
        return "NULL"
    return ago(v[1]) if v[0] == "ago" else ahead(v[1])


consent_rows = []
for c in consents:
    valid = c["valid"]
    if valid is None and c["type"] == "STORAGE":
        valid = ("ahead", max(60, 10 * 365 - c["days"]))
    consent_rows.append(f"({c['donor']}, {q(c['type'])}, {ago(c['days'])}, {valid_sql(valid)})")
emit_insert("consent", ["donor_id", "consent_type", "consent_date", "valid_until"], consent_rows, batch=400)
w("")

w("-- collected units --------------------------------------------------------")
sample_rows = []
for s in samples:
    exp = "NULL" if s["expiry"] is None else (ago(s["expiry"][1]) if s["expiry"][0] == "ago" else ahead(s["expiry"][1]))
    proc = "QUARANTINE" if s["fate"] == "QUARANTINE" else "PROCESSING"
    cd34 = s["cd34"] if s["fate"] != "QUARANTINE" else "NULL"
    sample_rows.append(f"({s['id']}, {s['donor']}, {q(s['type'])}, {ago(s['days'])}, {s['vol']}, {cd34}, "
                       f"{q(proc)}, {exp})")
emit_insert("stem_cell_sample",
            ["sample_id", "donor_id", "sample_type", "collection_date", "volume_ml", "cd34_count",
             "processing_status", "expiry_date"], sample_rows, batch=300)
w("")

w("-- laboratory tests -------------------------------------------------------")
RESULTS = {"HLA_TYPING": "Typed at A, B, DRB1 (high resolution)",
           "INFECTIOUS_SCREEN": "HIV, HBV, HCV, syphilis, CMV negative",
           "STERILITY": "No growth at 14 days"}
test_rows = []
for s in samples:
    base = max(1, s["days"] - random.randint(1, 4))
    staff_id = random.choice(staff_ids)
    rows_for_sample = []
    for i, t in enumerate(["HLA_TYPING", "INFECTIOUS_SCREEN", "STERILITY", "VIABILITY", "CD34_COUNT"]):
        dt = f"NOW() - INTERVAL {base * 24 - i * 3} HOUR"
        if s["fate"] == "QUARANTINE" and t in ("STERILITY", "VIABILITY", "CD34_COUNT"):
            rows_for_sample.append(f"({s['id']}, {q(t)}, {dt}, NULL, 'PENDING', 'Awaiting result', {staff_id})")
            continue
        status, res, rem = "PASSED", RESULTS.get(t), None
        if t == "VIABILITY":
            res = f"{random.randint(88, 98)}% viable (7-AAD)"
        if t == "CD34_COUNT":
            res = str(s["cd34"])
        if s["fate"] == "FAIL" and t == "INFECTIOUS_SCREEN":
            status, res, rem = "FAILED", "HBsAg reactive", "Confirmed on repeat; unit to be discarded"
        rows_for_sample.append(f"({s['id']}, {q(t)}, {dt}, {q(res)}, {q(status)}, {q(rem)}, {staff_id})")
    # a failed test discards the unit, so it is recorded after the others
    rows_for_sample.sort(key=lambda r: "'FAILED'" in r)
    test_rows.extend(rows_for_sample)
emit_insert("sample_test", ["sample_id", "test_type", "test_date", "result", "test_status", "remarks", "performed_by"],
            test_rows, batch=400)
w("")

w("-- release tested units into storage --------------------------------------")
w("-- One UPDATE … JOIN instead of thousands of calls: the triggers still check")
w("-- tests, consent, capacity and the status transition for every row.")
w("DROP TABLE IF EXISTS _release_plan;")
w("CREATE TABLE _release_plan (sample_id INT UNSIGNED PRIMARY KEY, location_id INT UNSIGNED, position VARCHAR(20)) ENGINE=InnoDB;")
plan_rows, expired_rows = [], []
for s in samples:
    if s["fate"] in ("RELEASE", "EXPIRING", "REVOKE"):
        plan_rows.append(f"({s['id']}, {s['loc']}, {q(next_slot(s['loc']))})")
    elif s["fate"] == "EXPIRED":
        expired_rows.append(f"({s['id']}, {s['loc']}, {q(next_slot(s['loc']))})")
emit_insert("_release_plan", ["sample_id", "location_id", "position"], plan_rows, batch=400)
w("""UPDATE stem_cell_sample s
  JOIN _release_plan p ON p.sample_id = s.sample_id
   SET s.processing_status   = 'RELEASED',
       s.location_id         = p.location_id,
       s.storage_position    = p.position,
       s.availability_status = 'AVAILABLE';""")
w("")
w("-- units already past their expiry: stored, but never offered")
w("DELETE FROM _release_plan;")
if expired_rows:
    emit_insert("_release_plan", ["sample_id", "location_id", "position"], expired_rows, batch=400)
    w("""UPDATE stem_cell_sample s
  JOIN _release_plan p ON p.sample_id = s.sample_id
   SET s.processing_status = 'RELEASED',
       s.location_id       = p.location_id,
       s.storage_position  = p.position;""")
w("DROP TABLE _release_plan;")
w("")

w("-- consent revocations withdraw those donors' available units (trigger) ----")
for d in donors:
    if d.get("revoke_clinical"):
        w(f"CALL sp_revoke_consent((SELECT consent_id FROM consent WHERE donor_id = {d['id']} "
          f"AND consent_type = 'CLINICAL_USE' AND status = 'ACTIVE' LIMIT 1), "
          f"'Donor asked to withdraw from clinical use');")
w("CALL sp_daily_maintenance(1);")
w("")

w("-- transplant requests ----------------------------------------------------")
request_rows = []
for r in ordered_requests:
    doctor_id = r["doctor"]
    request_rows.append(f"({r['rid']}, {r['patient']}, {doctor_id}, NOW() - INTERVAL {r['req_days']} DAY, "
                        f"{q(r['type'])}, 4, {q(r['urgency'])})")
emit_insert("transplant_request",
            ["request_id", "patient_id", "doctor_id", "request_date", "required_sample_type",
             "min_hla_match", "urgency"], request_rows, batch=300)
w("")

w("-- review decisions -------------------------------------------------------")
for r in ordered_requests:
    if r["end"] == "PENDING":
        continue
    reviewer = random.choice(admin_ids + staff_ids[:4])
    if r["end"] == "REJECTED":
        w(f"CALL sp_review_request({r['rid']}, {reviewer}, 'REJECTED', "
          f"'Patient not in remission yet; resubmit after induction therapy');")
    elif r["end"] == "CANCELLED":
        w(f"CALL sp_review_request({r['rid']}, {reviewer}, 'APPROVED', 'Clinical criteria met');")
    else:
        w(f"CALL sp_review_request({r['rid']}, {reviewer}, 'APPROVED', 'Clinical criteria met');")
w("UPDATE transplant_request SET reviewed_at = request_date + INTERVAL 1 DAY WHERE reviewed_at IS NOT NULL;")
w("")

w("-- tiered search and shortlists -------------------------------------------")
for r in ordered_requests:
    if r.get("kind") == "scenario" and r["end"] in ("SHORTLISTED", "APPROVED", "ALLOCATED"):
        w(f"CALL sp_find_candidates({r['rid']}, 1);")
    elif r.get("shortlist"):
        w(f"CALL sp_find_candidates({r['rid']}, 1);")
w("")

w("-- allocations, transplants and cancellations -----------------------------")
for r in ordered_requests:
    if r["end"] in ("ALLOCATED", "SCHEDULED", "COMPLETED") and r["sample_ids"]:
        best = max(r["sample_ids"], key=lambda x: x[1])[0]
        w(f"CALL sp_allocate_sample({r['rid']}, {best});")
        w(f"UPDATE request_sample SET allocation_date = "
          f"(SELECT request_date + INTERVAL 3 DAY FROM transplant_request WHERE request_id = {r['rid']}) "
          f"WHERE request_id = {r['rid']} AND sample_id = {best};")
    if r["end"] == "SCHEDULED":
        w(f"CALL sp_schedule_transplant({r['rid']}, CURDATE() + INTERVAL {random.randint(3, 30)} DAY, "
          f"'Conditioning regimen starts one week before', @t);")
    if r["end"] == "COMPLETED":
        tx_days = max(1, r["req_days"] - 20)
        w(f"CALL sp_schedule_transplant({r['rid']}, CURDATE() - INTERVAL {tx_days} DAY, "
          f"'Myeloablative conditioning', @t);")
        outcome = r.get("outcome", "ENGRAFTED")
        remark = {"ENGRAFTED": "Neutrophil engraftment on day +18",
                  "COMPLICATIONS": "Grade II acute GVHD, responding to steroids",
                  "GRAFT_FAILURE": "Primary graft failure; second transplant under discussion"}[outcome]
        w(f"CALL sp_complete_transplant(@t, {q(outcome)}, {q(remark)});")
    if r["end"] == "CANCELLED":
        w(f"CALL sp_cancel_request({r['rid']}, 'Patient transferred to another centre');")
w("")

w("-- final states: tanks offline, hospitals and people inactive -------------")
for lid_ in MAINTENANCE_LOCATIONS:
    w(f"UPDATE storage_location SET current_status = 'MAINTENANCE' WHERE location_id = {lid_};")
for lid_ in DECOMMISSIONED_LOCATIONS:
    w(f"UPDATE storage_location SET current_status = 'DECOMMISSIONED' WHERE location_id = {lid_};")
w("UPDATE hospital SET status = 'SUSPENDED' WHERE hospital_id = 13;")
w("UPDATE hospital SET status = 'INACTIVE' WHERE hospital_id = 24;")
w("UPDATE doctor SET status = 'ON_LEAVE' WHERE doctor_id IN (7, 19);")
w("UPDATE doctor SET status = 'INACTIVE' WHERE doctor_id IN (13, 25);")
w("UPDATE `user` SET status = 'INACTIVE' WHERE username IN ('staff.farhan');")
w("UPDATE `user` SET status = 'LOCKED' WHERE username IN ('dr.tejas');")

deferred = [d["id"] for d in donors if d["status"] == "DEFERRED"]
withdrawn = [d["id"] for d in donors if d["status"] == "WITHDRAWN"]
inactive_p = [p["id"] for p in patients if p["status"] == "INACTIVE"]
deceased_p = [p["id"] for p in patients if p["status"] == "DECEASED"]


def in_list(ids):
    return ", ".join(str(i) for i in ids)


if deferred:
    w(f"UPDATE donor SET status = 'DEFERRED' WHERE donor_id IN ({in_list(deferred)});")
if withdrawn:
    w(f"UPDATE donor SET status = 'WITHDRAWN' WHERE donor_id IN ({in_list(withdrawn)});")
if inactive_p:
    w(f"UPDATE patient SET status = 'INACTIVE' WHERE patient_id IN ({in_list(inactive_p)});")
if deceased_p:
    w(f"UPDATE patient SET status = 'DECEASED' WHERE patient_id IN ({in_list(deceased_p)});")
w("SET @app_user_id = NULL;")
w("")

w("-- ---------------------------------------------------------------------")
w("-- Scenario map (request_id -> what it demonstrates)")
for sc in scenarios:
    w(f"--   request {sc['rid']}: {sc['end']:<11} {sc['note']}")
for b in bg_fixed:
    w(f"--   request {b['rid']}: {b['end']:<11} background request")
w(f"--   requests 14-{rid}: bulk data across every status")
w("-- ---------------------------------------------------------------------")

Path(__file__).resolve().parent.parent.joinpath("06_seed.sql").write_text("\n".join(out) + "\n", encoding="utf-8")

print(f"hospitals {len(hospitals)}  tanks {len(locations)}  doctors {len(doctors)}  "
      f"staff {len(STAFF)}  admins {len(ADMINS)}")
print(f"donors {len(donors)}  patients {len(patients)}  people {len(donors) + len(patients)}  "
      f"units {len(samples)}  tests {len(test_rows)}  consents {len(consent_rows)}  "
      f"requests {len(ordered_requests)}  accounts {len(users)}")
