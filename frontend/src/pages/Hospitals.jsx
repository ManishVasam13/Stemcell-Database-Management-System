import { useEffect, useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Field, Input, Skeleton, Modal, Table, label, useToast } from '../components/ui';

export default function Hospitals() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);

  const load = () => api.get(`/hospitals${qs({ q })}`).then(setRows).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, [q]);

  async function act(fn) {
    try { const r = await fn(); toast(r.message); await load(); } catch (e) { toast(e.message, true); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hospitals</h1>
          <p>A hospital's district and state decide the tiers of every search: its own district first, then its state, then the country.</p>
        </div>
        {user.role === 'ADMIN' && <button className="btn btn-primary" onClick={() => setShowNew(true)}>Add a hospital</button>}
      </div>

      <div className="filters">
        <Input placeholder="Search name, city or registration number" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card>
        {!rows ? <Skeleton rows={6} /> : (
          <Table
            rows={rows.map((h) => ({ ...h, id: h.hospital_id }))}
            empty="No hospital matches this search."
            columns={[
              { key: 'hospital_name', header: 'Hospital', render: (h) => (<><div>{h.hospital_name}</div><div className="t-sub">{h.registration_no}</div></>) },
              { key: 'district', header: 'Location', render: (h) => (<><div>{h.city}</div><div className="t-sub">{h.district}, {h.state} — {h.pincode}</div></>) },
              { key: 'doctor_count', header: 'Doctors', render: (h) => <span className="num">{h.doctor_count}</span> },
              { key: 'storage_units', header: 'Storage', render: (h) => <span className="num">{h.storage_units}</span> },
              { key: 'available_samples', header: 'Units in store', render: (h) => <span className="num">{h.available_samples}</span> },
              { key: 'total_requests', header: 'Requests', render: (h) => (<><span className="num">{h.total_requests}</span><div className="t-sub">{h.active_requests} open</div></>) },
              { key: 'status', header: 'Status', render: (h) => <Badge value={h.status} /> },
            ]}
          />
        )}
      </Card>

      {showNew && <NewHospital onClose={() => setShowNew(false)} onDone={(body) => { setShowNew(false); act(() => api.post('/hospitals', body)); }} />}
    </>
  );
}

function NewHospital({ onClose, onDone }) {
  const [form, setForm] = useState({ hospital_name: '', registration_no: '', address_line: '', city: '', district: '', state: '', pincode: '', phone: '', email: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title="Add a hospital" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onDone(form)}>Add hospital</button></>}>
      <Field label="Hospital name"><Input value={form.hospital_name} onChange={set('hospital_name')} /></Field>
      <div className="grid cols-2">
        <Field label="Registration number"><Input value={form.registration_no} onChange={set('registration_no')} placeholder="TN-HSP-1005" /></Field>
        <Field label="Pincode"><Input value={form.pincode} onChange={set('pincode')} placeholder="600004" /></Field>
      </div>
      <Field label="Address"><Input value={form.address_line} onChange={set('address_line')} /></Field>
      <div className="grid cols-3">
        <Field label="City"><Input value={form.city} onChange={set('city')} /></Field>
        <Field label="District"><Input value={form.district} onChange={set('district')} /></Field>
        <Field label="State"><Input value={form.state} onChange={set('state')} /></Field>
      </div>
      <div className="grid cols-2">
        <Field label="Phone"><Input value={form.phone} onChange={set('phone')} /></Field>
        <Field label="E-mail"><Input value={form.email} onChange={set('email')} /></Field>
      </div>
    </Modal>
  );
}
