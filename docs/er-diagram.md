# StemVault — ER diagrams

Both diagrams below are written in [Mermaid](https://mermaid.live). Paste the code block into
<https://mermaid.live> (or any Markdown viewer that supports Mermaid, such as VS Code with the
Markdown Preview Mermaid extension) and export a PNG or SVG for the report.

---

## 1. Crow's-foot diagram (relational view)

```mermaid
erDiagram
    USER ||--o| DONOR : "logs in as"
    USER ||--o| PATIENT : "logs in as"
    USER ||--|| DOCTOR : "logs in as"
    USER ||--o{ SAMPLE_TEST : performs
    USER ||--o{ TRANSPLANT_REQUEST : reviews
    USER ||--o{ AUDIT_LOG : "acts in"

    HOSPITAL ||--o{ DOCTOR : employs
    HOSPITAL ||--o{ STORAGE_LOCATION : houses

    DONOR ||--o{ CONSENT : signs
    DONOR ||--o{ STEM_CELL_SAMPLE : donates
    STORAGE_LOCATION ||--o{ STEM_CELL_SAMPLE : stores
    STEM_CELL_SAMPLE ||--o{ SAMPLE_TEST : "is tested by"

    PATIENT ||--o{ TRANSPLANT_REQUEST : needs
    DOCTOR ||--o{ TRANSPLANT_REQUEST : raises

    TRANSPLANT_REQUEST ||--o{ REQUEST_SAMPLE : shortlists
    STEM_CELL_SAMPLE ||--o{ REQUEST_SAMPLE : "is considered in"
    REQUEST_SAMPLE ||--o| TRANSPLANT : "is used by"

    USER {
        int user_id PK
        varchar username UK
        varchar password_hash
        varchar role
        varchar status
        datetime created_at
    }
    DONOR {
        int donor_id PK
        int user_id FK "unique, nullable"
        varchar full_name
        date date_of_birth
        char gender
        varchar blood_group
        varchar hla_a_1
        varchar hla_a_2
        varchar hla_b_1
        varchar hla_b_2
        varchar hla_drb1_1
        varchar hla_drb1_2
        varchar phone
        varchar email
        varchar address
        date registration_date
        varchar status
    }
    PATIENT {
        int patient_id PK
        int user_id FK "unique, nullable"
        varchar full_name
        date date_of_birth
        char gender
        varchar blood_group
        varchar hla_a_1
        varchar hla_a_2
        varchar hla_b_1
        varchar hla_b_2
        varchar hla_drb1_1
        varchar hla_drb1_2
        varchar diagnosis
        varchar phone
        varchar email
        varchar address
        date registration_date
        varchar status
    }
    HOSPITAL {
        int hospital_id PK
        varchar hospital_name
        varchar registration_no UK
        varchar address_line
        varchar city
        varchar district
        varchar state
        char pincode
        varchar phone
        varchar email UK
        date registered_on
        varchar status
    }
    DOCTOR {
        int doctor_id PK
        int user_id FK "unique"
        int hospital_id FK
        varchar full_name
        varchar specialization
        varchar medical_reg_no UK
        varchar phone
        varchar email
        varchar status
    }
    STORAGE_LOCATION {
        int location_id PK
        int hospital_id FK
        varchar location_code UK
        varchar storage_area
        varchar storage_type
        smallint capacity
        varchar current_status
    }
    STEM_CELL_SAMPLE {
        int sample_id PK
        int donor_id FK
        int location_id FK "nullable"
        varchar storage_position
        varchar sample_type
        date collection_date
        decimal volume_ml
        decimal cd34_count
        varchar processing_status
        varchar availability_status
        date expiry_date
        datetime created_at
    }
    SAMPLE_TEST {
        int test_id PK
        int sample_id FK
        varchar test_type
        datetime test_date
        varchar result
        varchar test_status
        varchar remarks
        int performed_by FK
    }
    CONSENT {
        int consent_id PK
        int donor_id FK
        varchar consent_type
        date consent_date
        date valid_until
        date revoked_on
        varchar revocation_reason
        varchar status
    }
    TRANSPLANT_REQUEST {
        int request_id PK
        int patient_id FK
        int doctor_id FK
        datetime request_date
        varchar required_sample_type
        tinyint min_hla_match
        varchar urgency
        varchar request_status
        int reviewed_by FK
        datetime reviewed_at
        varchar review_remarks
    }
    REQUEST_SAMPLE {
        int request_id PK_FK
        int sample_id PK_FK
        tinyint hla_match_score
        varchar search_tier
        varchar selection_status
        datetime allocation_date
    }
    TRANSPLANT {
        int transplant_id PK
        int request_id FK "unique"
        int sample_id FK "unique"
        date transplant_date
        varchar transplant_status
        varchar outcome
        varchar remarks
    }
    AUDIT_LOG {
        bigint audit_id PK
        int user_id FK "nullable"
        varchar action
        varchar table_name
        varchar record_id
        datetime action_time
        json old_value
        json new_value
    }
```

### Reading the cardinalities

| Relationship | Cardinality | Participation |
|---|---|---|
| User – Donor / Patient | 1:1 | both optional (a donor may have no login) |
| User – Doctor | 1:1 | every doctor must have an account |
| Hospital – Doctor | 1:M | a doctor belongs to exactly one hospital |
| Hospital – StorageLocation | 1:M | a tank belongs to exactly one hospital |
| Donor – Consent | 1:M | a consent belongs to exactly one donor |
| Donor – StemCellSample | 1:M | a unit comes from exactly one donor |
| StorageLocation – StemCellSample | 1:M | a unit may be unstored (`location_id` is nullable) |
| StemCellSample – SampleTest | 1:M | a test belongs to exactly one unit |
| Patient – TransplantRequest | 1:M | over time; only one may be open at a time (enforced by a trigger) |
| Doctor – TransplantRequest | 1:M | |
| TransplantRequest ↔ StemCellSample | **M:N** | resolved by RequestSample |
| RequestSample – Transplant | 1:1 | a transplant uses exactly one shortlisted candidate |
| User – SampleTest / TransplantRequest / AuditLog | 1:M | performed_by, reviewed_by, audit user |

---

## 2. Chen-style diagram (conceptual view)

Rectangles are entities, diamonds are relationships, and the double rectangle is the associative
entity that resolves the M:N relationship.

```mermaid
flowchart TB
    U[User]
    DN[Donor]
    PT[Patient]
    DR[Doctor]
    HP[Hospital]
    SL[StorageLocation]
    SC[StemCellSample]
    ST[SampleTest]
    CN[Consent]
    TR[TransplantRequest]
    RS[[RequestSample]]
    TX[Transplant]
    AL[AuditLog]

    U --- r1{is} --- DN
    U --- r2{is} --- PT
    U --- r3{is} --- DR
    HP --- r4{employs} --- DR
    HP --- r5{houses} --- SL
    DN --- r6{signs} --- CN
    DN --- r7{donates} --- SC
    SL --- r8{stores} --- SC
    SC --- r9{tested_by} --- ST
    PT --- r10{needs} --- TR
    DR --- r11{raises} --- TR
    TR --- RS --- SC
    RS --- r12{used_in} --- TX
    U --- r13{records} --- AL

    r1 -.->|1:1| DN
    r4 -.->|1:M| DR
    r7 -.->|1:M| SC
    r10 -.->|1:M| TR
```

### Notes for the viva

* **Weak entities.** `SampleTest` cannot exist without its sample and `Consent` cannot exist without
  its donor. In Chen notation they are weak entities with identifying relationships and the partial
  keys `(test_type, test_date)` and `(consent_type, consent_date)`. In the relational schema each one
  gets a surrogate primary key, and the partial key survives as a UNIQUE constraint.
* **Associative entity.** `RequestSample` carries its own attributes (HLA score, search tier,
  selection status, allocation date), so it is an entity in its own right, not a plain link table.
* **Aggregation.** `Transplant` refers to the *relationship* between a request and a sample, not to
  each of them separately. That is why its foreign key is the composite
  `(request_id, sample_id) → RequestSample`, which makes it impossible to transplant a unit that was
  never shortlisted for that request.
* **Multivalued attribute, flattened.** HLA typing is two alleles at each of three loci. The size is
  fixed and every position has its own meaning, so six columns keep the design in 1NF without an
  extra table.
* **Derived attributes, not stored.** Age comes from the date of birth, storage occupancy from
  counting units, and a sample's blood group from its donor.
