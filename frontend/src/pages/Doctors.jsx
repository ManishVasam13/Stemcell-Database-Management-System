import { useEffect, useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Field, Input, Skeleton, Modal, Select, Table, label, useToast } from '../components/ui';

export default function Doctors() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);

  const load = () => api.get(`/doctors${qs({ q })}`).then(setRows).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, [q]);
  useEffect(() => { api.get('/hospitals').then(setHospitals).catch(() => {}); }, []);

  async function act(fn) {
    try { const r = await fn(); toast(r.message); await load(); } catch (e) { toast(e.message, true); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Doctors</h1>
          <p>Adding a doctor creates their login and their hospital link in one transaction.</p>
        </div>
        {user.role === 'ADMIN' && <button className="btn btn-primary" onClick={() => setShowNew(true)}>Add a doctor</button>}
      </div>

      <div className="filters"><Input placeholder="Search name or specialisation" value={q} onChange={(e) => setQ(e.target.value)} /></div>

      <Card>
        {!rows ? <Skeleton rows={6} /> : (
          <Table
            rows={rows.map((d) => ({ ...d, id: d.doctor_id }))}
            empty="No doctor matches this search."
            columns={[
              { key: 'full_name', header: 'Doctor', render: (d) => (<><div>{d.full_name}</div><div className="t-sub">{d.specialization}</div></>) },
              { key: 'hospital_name', header: 'Hospital', render: (d) => (<><div>{d.hospital_name}</div><div className="t-sub">{d.district}, {d.state}</div></>) },
              { key: 'medical_reg_no', header: 'Medical registration' },
              { key: 'username', header: 'Login', render: (d) => (<><div>{d.username}</div><div className="t-sub">{label(d.account_status)}</div></>) },
              { key: 'request_count', header: 'Requests', render: (d) => <span className="num">{d.request_count}</span> },
              { key: 'status', header: 'Status', render: (d) => (user.role === 'ADMIN' ? (
                <Select value={d.status} onChange={(e) => act(() => api.put(`/doctors/${d.doctor_id}`, { status: e.target.value }))}>
                  {['ACTIVE', 'ON_LEAVE', 'INACTIVE'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </Select>) : <Badge value={d.status} />) },
            ]}
          />
        )}
      </Card>

      {showNew && (
        <NewDoctor hospitals={hospitals} onClose={() => setShowNew(false)}
          onDone={(body) => { setShowNew(false); act(() => api.post('/doctors', body)); }} />
      )}
    </>
  );
}

function NewDoctor({ hospitals, onClose, onDone }) {
  const [form, setForm] = useState({ hospital_id: '', full_name: '', specialization: '', medical_reg_no: '', phone: '', email: '', username: '', password: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title="Add a doctor" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onDone(form)}>Add doctor</button></>}>
      <Field label="Hospital">
        <Select value={form.hospital_id} onChange={set('hospital_id')}>
          <option value="">Choose a hospital</option>
          {hospitals.filter((h) => h.status === 'ACTIVE').map((h) => <option key={h.hospital_id} value={h.hospital_id}>{h.hospital_name} · {h.district}</option>)}
        </Select>
      </Field>
      <div className="grid cols-2">
        <Field label="Full name"><Input value={form.full_name} onChange={set('full_name')} placeholder="Dr. " /></Field>
        <Field label="Specialisation"><Input value={form.specialization} onChange={set('specialization')} placeholder="Bone Marrow Transplantation" /></Field>
        <Field label="Medical registration number"><Input value={form.medical_reg_no} onChange={set('medical_reg_no')} /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Username"><Input value={form.username} onChange={set('username')} placeholder="dr.name" /></Field>
        <Field label="Password"><Input type="password" value={form.password} onChange={set('password')} /></Field>
      </div>
      <Field label="E-mail (optional)"><Input value={form.email} onChange={set('email')} /></Field>
    </Modal>
  );
}
