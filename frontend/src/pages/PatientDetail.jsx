import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Badge, Card, Loading, Table, fmtDate, label, useToast } from '../components/ui';

export default function PatientDetail() {
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);

  useEffect(() => { api.get(`/patients/${id}`).then(setPatient).catch((e) => toast(e.message, true)); }, [id]);
  if (!patient) return <Loading what="Loading patient" />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{patient.full_name}</h1>
          <p className="num">Patient #{patient.patient_id} · {patient.age} years · {patient.gender} · {patient.blood_group} · {patient.diagnosis}</p>
        </div>
        <Badge value={patient.status} />
      </div>

      <div className="split">
        <Card title="Transplant requests">
          <Table
            rows={patient.requests.map((r) => ({ ...r, id: r.request_id }))}
            onRowClick={(r) => navigate(`/requests/${r.request_id}`)}
            empty="No request has been raised for this patient."
            columns={[
              { key: 'request_id', header: 'Request', render: (r) => <span className="num">#{r.request_id}</span> },
              { key: 'required_sample_type', header: 'Unit needed', render: (r) => label(r.required_sample_type) },
              { key: 'doctor_name', header: 'Doctor', render: (r) => (<><div>{r.doctor_name}</div><div className="t-sub">{r.hospital_name}</div></>) },
              { key: 'urgency', header: 'Urgency', render: (r) => <Badge value={r.urgency} /> },
              { key: 'request_status', header: 'Status', render: (r) => <Badge value={r.request_status} /> },
              { key: 'request_date', header: 'Raised', render: (r) => fmtDate(r.request_date) },
            ]}
          />
        </Card>

        <Card title="Clinical details">
          <dl className="kv">
            <dt>Phone</dt><dd>{patient.phone}</dd>
            <dt>E-mail</dt><dd>{patient.email || '—'}</dd>
            <dt>Registered</dt><dd>{fmtDate(patient.registration_date)}</dd>
            <dt>Login</dt><dd>{patient.username || 'no portal access'}</dd>
            <dt>HLA-A</dt><dd className="num">{patient.hla_a_1 ? `${patient.hla_a_1}, ${patient.hla_a_2}` : 'not typed'}</dd>
            <dt>HLA-B</dt><dd className="num">{patient.hla_b_1 ? `${patient.hla_b_1}, ${patient.hla_b_2}` : '—'}</dd>
            <dt>HLA-DRB1</dt><dd className="num">{patient.hla_drb1_1 ? `${patient.hla_drb1_1}, ${patient.hla_drb1_2}` : '—'}</dd>
          </dl>
        </Card>
      </div>
    </>
  );
}
