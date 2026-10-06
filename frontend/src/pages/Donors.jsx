import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api';
import { Badge, Card, Field, Input, Skeleton, Modal, Select, Table, fmtDate, label, useToast } from '../components/ui';

const HLA_FIELDS = [
  ['hla_a_1', 'HLA-A (1)'], ['hla_a_2', 'HLA-A (2)'],
  ['hla_b_1', 'HLA-B (1)'], ['hla_b_2', 'HLA-B (2)'],
  ['hla_drb1_1', 'HLA-DRB1 (1)'], ['hla_drb1_2', 'HLA-DRB1 (2)'],
];

export default function Donors() {
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState({ q: '', blood_group: '', status: '' });
  const [showNew, setShowNew] = useState(false);

  const load = () => api.get(`/donors${qs(filters)}`).then(setRows).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, [filters.q, filters.blood_group, filters.status]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Donors</h1>
          <p>Registering a donor also records their collection consent. Nothing can be collected without it.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>Register a donor</button>
      </div>

      <div className="filters">
        <Input placeholder="Search name or phone" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <Select value={filters.blood_group} onChange={(e) => setFilters({ ...filters, blood_group: e.target.value })}>
          <option value="">Any blood group</option>
          {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((b) => <option key={b} value={b}>{b}</option>)}
        </Select>
        <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Any status</option>
          {['ACTIVE', 'DEFERRED', 'WITHDRAWN'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
      </div>

      <Card>
        {!rows ? <Skeleton rows={6} /> : (
          <Table
            rows={rows.map((d) => ({ ...d, id: d.donor_id }))}
            onRowClick={(d) => navigate(`/donors/${d.donor_id}`)}
            empty="No donor matches this search."
            columns={[
              { key: 'full_name', header: 'Donor', render: (d) => (<><div>{d.full_name}</div><div className="t-sub num">#{d.donor_id} · {d.age} yrs · {d.gender}</div></>) },
              { key: 'blood_group', header: 'Blood group' },
              { key: 'hla_typed', header: 'HLA', render: (d) => (d.hla_typed ? <Badge tone="teal">typed</Badge> : <Badge tone="amber">not typed</Badge>) },
              { key: 'consent', header: 'Consent', render: (d) => (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <Badge tone={d.has_collection ? 'green' : 'red'}>collection</Badge>
                  <Badge tone={d.has_storage ? 'green' : 'red'}>storage</Badge>
                  <Badge tone={d.has_clinical_use ? 'green' : 'red'}>clinical use</Badge>
                </div>) },
              { key: 'sample_count', header: 'Units', render: (d) => <span className="num">{d.available_samples} / {d.sample_count}</span> },
              { key: 'registration_date', header: 'Registered', render: (d) => fmtDate(d.registration_date) },
              { key: 'status', header: 'Status', render: (d) => <Badge value={d.status} /> },
            ]}
          />
        )}
      </Card>

      {showNew && <NewDonor onClose={() => setShowNew(false)} onSaved={(id) => { setShowNew(false); navigate(`/donors/${id}`); }} />}
    </>
  );
}

function NewDonor({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: '', date_of_birth: '', gender: 'F', blood_group: 'O+', phone: '', email: '', address: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true); setError('');
    try {
      const r = await api.post('/donors', form);
      toast(r.message);
      onSaved(r.donor_id);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Register a donor" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>Register donor</button></>}>
      {error && <div className="error-bar">{error}</div>}
      <div className="grid cols-2">
        <Field label="Full name"><Input value={form.full_name} onChange={set('full_name')} /></Field>
        <Field label="Date of birth (18–60)"><Input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} /></Field>
        <Field label="Sex"><Select value={form.gender} onChange={set('gender')}><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option></Select></Field>
        <Field label="Blood group">
          <Select value={form.blood_group} onChange={set('blood_group')}>
            {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
        <Field label="Phone"><Input value={form.phone} onChange={set('phone')} /></Field>
        <Field label="E-mail (optional)"><Input value={form.email} onChange={set('email')} /></Field>
      </div>
      <Field label="Address (optional)"><Input value={form.address} onChange={set('address')} /></Field>
      <h4 style={{ margin: '10px 0 8px' }}>HLA typing (optional now, required before matching)</h4>
      <div className="grid cols-3">
        {HLA_FIELDS.map(([k, l]) => <Field key={k} label={l}><Input value={form[k] || ''} onChange={set(k)} placeholder="A*02:01" /></Field>)}
      </div>
      <h4 style={{ margin: '10px 0 8px' }}>Donor login (optional)</h4>
      <div className="grid cols-2">
        <Field label="Username"><Input value={form.username} onChange={set('username')} placeholder="donor.name" /></Field>
        <Field label="Password"><Input type="password" value={form.password} onChange={set('password')} placeholder="StemVault@123" /></Field>
      </div>
    </Modal>
  );
}
