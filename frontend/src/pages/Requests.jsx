import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Field, Input, Skeleton, Modal, Select, Table, fmtDate, label, useToast } from '../components/ui';

export default function Requests() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState({ status: '', urgency: '', q: '' });
  const [showNew, setShowNew] = useState(false);

  const load = () => api.get(`/requests${qs(filters)}`).then(setRows).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, [filters.status, filters.urgency, filters.q]);

  const canRaise = ['DOCTOR', 'ADMIN'].includes(user.role);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{user.role === 'DOCTOR' ? 'My transplant requests' : 'Transplant requests'}</h1>
          <p>Each request holds one patient's search. Open a request to run the district → state → India search and allocate a unit.</p>
        </div>
        {canRaise && <button className="btn btn-primary" onClick={() => setShowNew(true)}>Raise a request</button>}
      </div>

      <div className="filters">
        <Input placeholder="Search patient or hospital" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Any status</option>
          {['PENDING', 'APPROVED', 'ALLOCATED', 'COMPLETED', 'REJECTED', 'CANCELLED'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
        <Select value={filters.urgency} onChange={(e) => setFilters({ ...filters, urgency: e.target.value })}>
          <option value="">Any urgency</option>
          {['CRITICAL', 'URGENT', 'ROUTINE'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
      </div>

      <Card>
        {!rows ? <Skeleton rows={6} /> : (
          <Table
            rows={rows.map((r) => ({ ...r, id: r.request_id }))}
            onRowClick={(r) => navigate(`/requests/${r.request_id}`)}
            empty="No request matches these filters."
            columns={[
              { key: 'request_id', header: 'Request', render: (r) => <strong className="num">#{r.request_id}</strong> },
              { key: 'patient_name', header: 'Patient', render: (r) => (<><div>{r.patient_name}</div><div className="t-sub">{r.diagnosis}</div></>) },
              { key: 'required_sample_type', header: 'Unit needed', render: (r) => (<><div>{label(r.required_sample_type)}</div><div className="t-sub">at least {r.min_hla_match}/6 HLA</div></>) },
              { key: 'hospital_name', header: 'Hospital', render: (r) => (<><div>{r.hospital_name}</div><div className="t-sub">{r.district}, {r.state}</div></>) },
              { key: 'urgency', header: 'Urgency', render: (r) => <Badge value={r.urgency} /> },
              { key: 'request_status', header: 'Status', render: (r) => (<><Badge value={r.request_status} />{r.transplant_status && <div className="t-sub">{label(r.transplant_status)}</div>}</>) },
              { key: 'candidate_count', header: 'Shortlist', render: (r) => <span className="num">{r.candidate_count}</span> },
              { key: 'request_date', header: 'Raised', render: (r) => fmtDate(r.request_date) },
            ]}
          />
        )}
      </Card>

      {showNew && <NewRequest onClose={() => setShowNew(false)} onSaved={(id) => { setShowNew(false); navigate(`/requests/${id}`); }} />}
    </>
  );
}

function NewRequest({ onClose, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState({ patient_id: '', doctor_id: '', required_sample_type: 'CORD_BLOOD', min_hla_match: 4, urgency: 'ROUTINE' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/patients?status=ACTIVE').then((p) => setPatients(p.filter((x) => x.hla_typed))).catch(() => {});
    if (user.role === 'ADMIN') api.get('/doctors').then(setDoctors).catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/requests', form);
      toast(r.message);
      onSaved(r.request_id);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Raise a transplant request" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !form.patient_id}>Submit for review</button>
      </>}>
      {error && <div className="error-bar">{error}</div>}
      <Field label="Patient (HLA-typed patients only)">
        <Select value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}>
          <option value="">Choose a patient</option>
          {patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.full_name} · {p.diagnosis}</option>)}
        </Select>
      </Field>
      {user.role === 'ADMIN' && (
        <Field label="Requesting doctor">
          <Select value={form.doctor_id} onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}>
            <option value="">Choose a doctor</option>
            {doctors.map((d) => <option key={d.doctor_id} value={d.doctor_id}>{d.full_name} · {d.hospital_name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Unit needed">
        <Select value={form.required_sample_type} onChange={(e) => setForm({ ...form, required_sample_type: e.target.value })}>
          {['CORD_BLOOD', 'BONE_MARROW', 'PBSC'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </Select>
      </Field>
      <Field label="Minimum HLA match (out of 6)">
        <Select value={form.min_hla_match} onChange={(e) => setForm({ ...form, min_hla_match: Number(e.target.value) })}>
          {[6, 5, 4, 3].map((n) => <option key={n} value={n}>{n} of 6</option>)}
        </Select>
      </Field>
      <Field label="Urgency">
        <Select value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
          {['ROUTINE', 'URGENT', 'CRITICAL'].map((u) => <option key={u} value={u}>{label(u)}</option>)}
        </Select>
      </Field>
      <p className="t-sub">The request starts as pending. Bank staff review it before any unit can be shortlisted.</p>
    </Modal>
  );
}
