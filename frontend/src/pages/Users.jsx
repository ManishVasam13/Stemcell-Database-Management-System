import { useEffect, useState } from 'react';
import { api, qs } from '../api';
import { Badge, Card, Field, Input, Skeleton, Modal, Select, Table, fmtDate, label, useToast } from '../components/ui';

export default function Users() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [role, setRole] = useState('');
  const [showNew, setShowNew] = useState(false);

  const load = () => api.get(`/users${qs({ role })}`).then(setRows).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, [role]);

  async function act(fn) {
    try { const r = await fn(); toast(r.message); await load(); } catch (e) { toast(e.message, true); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p>Roles decide what each person can reach. Doctor, donor and patient accounts are created from their own pages.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>Add a staff account</button>
      </div>

      <div className="filters">
        <Select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Any role</option>
          {['ADMIN', 'BANK_STAFF', 'DOCTOR', 'DONOR', 'PATIENT'].map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </Select>
      </div>

      <Card>
        {!rows ? <Skeleton rows={6} /> : (
          <Table
            rows={rows.map((u) => ({ ...u, id: u.user_id }))}
            empty="No account matches."
            columns={[
              { key: 'username', header: 'Username' },
              { key: 'linked_name', header: 'Person', render: (u) => u.linked_name || <span className="t-sub">staff account</span> },
              { key: 'role', header: 'Role', render: (u) => <Badge value={u.role} /> },
              { key: 'created_at', header: 'Created', render: (u) => fmtDate(u.created_at) },
              { key: 'status', header: 'Status', render: (u) => (
                <Select value={u.status} onChange={(e) => act(() => api.patch(`/users/${u.user_id}/status`, { status: e.target.value }))}>
                  {['ACTIVE', 'INACTIVE', 'LOCKED'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </Select>) },
            ]}
          />
        )}
      </Card>

      {showNew && <NewUser onClose={() => setShowNew(false)} onDone={(body) => { setShowNew(false); act(() => api.post('/users', body)); }} />}
    </>
  );
}

function NewUser({ onClose, onDone }) {
  const [form, setForm] = useState({ username: '', password: '', role: 'BANK_STAFF' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title="Add a staff account" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onDone(form)}>Create account</button></>}>
      <Field label="Username"><Input value={form.username} onChange={set('username')} placeholder="staff.name" /></Field>
      <Field label="Password (at least 8 characters)"><Input type="password" value={form.password} onChange={set('password')} /></Field>
      <Field label="Role">
        <Select value={form.role} onChange={set('role')}>
          <option value="BANK_STAFF">Bank staff</option>
          <option value="ADMIN">Administrator</option>
        </Select>
      </Field>
    </Modal>
  );
}
