import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Field, Input, Skeleton, Modal, Select, Table, fmtDate, label, useToast } from '../components/ui';

const HLA_FIELDS = [['hla_a_1', 'HLA-A (1)'], ['hla_a_2', 'HLA-A (2)'], ['hla_b_1', 'HLA-B (1)'],
  ['hla_b_2', 'HLA-B (2)'], ['hla_drb1_1', 'HLA-DRB1 (1)'], ['hla_drb1_2', 'HLA-DRB1 (2)']];

export default function Patients() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState({ q: '', status: '' });
  const [showNew, setShowNew] = useState(false);

  const load = () => api.get(`/patients${qs(filters)}`).then(setRows).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, [filters.q, filters.status]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Patients</h1>
          <p>A patient must be HLA-typed before a transplant request can be raised for them.</p>
        </div>
        {['DOCTOR', 'ADMIN'].includes(user.role) && <button className="btn btn-primary" onClick={() => setShowNew(true)}>Register a patient</button>}
      </div>

      <div className="filters">
        <Input placeholder="Search name or diagnosis" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Any status</option>
          {['ACTIVE', 'INACTIVE', 'DECEASED'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
      </div>

      <Card>
        {!rows ? <Skeleton rows={6} /> : (
          <Table
            rows={rows.map((p) => ({ ...p, id: p.patient_id }))}
            onRowClick={(p) => navigate(`/patients/${p.patient_id}`)}
            empty="No patient matches this search."
            columns={[
              { key: 'full_name', header: 'Patient', render: (p) => (<><div>{p.full_name}</div><div className="t-sub num">#{p.patient_id} · {p.age} yrs · {p.gender}</div></>) },
              { key: 'diagnosis', header: 'Diagnosis' },
              { key: 'blood_group', header: 'Blood group' },
              { key: 'hla_typed', header: 'HLA', render: (p) => (p.hla_typed ? <Badge tone="teal">typed</Badge> : <Badge tone="amber">not typed</Badge>) },
              { key: 'latest_request_status', header: 'Latest request', render: (p) => (p.latest_request_status ? <Badge value={p.latest_request_status} /> : <span className="t-sub">none</span>) },
              { key: 'registration_date', header: 'Registered', render: (p) => fmtDate(p.registration_date) },
              { key: 'status', header: 'Status', render: (p) => <Badge value={p.status} /> },
            ]}
          />
        )}
      </Card>

      {showNew && <NewPatient onClose={() => setShowNew(false)} onSaved={(id) => { setShowNew(false); navigate(`/patients/${id}`); }} />}
    </>
  );
}

function NewPatient({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: '', date_of_birth: '', gender: 'F', blood_group: 'O+', diagnosis: '', phone: '', email: '', address: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true); setError('');
    try {
      const r = await api.post('/patients', form);
      toast(r.message);
      onSaved(r.patient_id);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Register a patient" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>Register patient</button></>}>
      {error && <div className="error-bar">{error}</div>}
      <div className="grid cols-2">
        <Field label="Full name"><Input value={form.full_name} onChange={set('full_name')} /></Field>
        <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} /></Field>
        <Field label="Sex"><Select value={form.gender} onChange={set('gender')}><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option></Select></Field>
        <Field label="Blood group">
          <Select value={form.blood_group} onChange={set('blood_group')}>
            {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Diagnosis"><Input value={form.diagnosis} onChange={set('diagnosis')} placeholder="Acute Myeloid Leukemia" /></Field>
      <div className="grid cols-2">
        <Field label="Phone"><Input value={form.phone} onChange={set('phone')} /></Field>
        <Field label="E-mail (optional)"><Input value={form.email} onChange={set('email')} /></Field>
      </div>
      <h4 style={{ margin: '10px 0 8px' }}>HLA typing</h4>
      <div className="grid cols-3">
        {HLA_FIELDS.map(([k, l]) => <Field key={k} label={l}><Input value={form[k] || ''} onChange={set(k)} placeholder="A*02:01" /></Field>)}
      </div>
      <h4 style={{ margin: '10px 0 8px' }}>Patient login (optional)</h4>
      <div className="grid cols-2">
        <Field label="Username"><Input value={form.username} onChange={set('username')} placeholder="patient.name" /></Field>
        <Field label="Password"><Input type="password" value={form.password} onChange={set('password')} /></Field>
      </div>
    </Modal>
  );
}
