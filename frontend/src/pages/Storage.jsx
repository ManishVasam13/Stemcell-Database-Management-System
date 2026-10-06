import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Card, Field, Input, Skeleton, Modal, Select, Table, label, useToast } from '../components/ui';

export default function Storage() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [showNew, setShowNew] = useState(false);

  const load = () => api.get('/storage').then(setRows).catch((e) => toast(e.message, true));
  useEffect(() => { load(); api.get('/hospitals').then(setHospitals).catch(() => {}); }, []);

  async function act(fn) {
    try { const r = await fn(); toast(r.message); await load(); } catch (e) { toast(e.message, true); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cryogenic storage</h1>
          <p>Occupancy is counted from the units inside each tank, never stored as a number that can drift.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>Add a storage unit</button>
      </div>

      <Card>
        {!rows ? <Skeleton rows={6} /> : (
          <Table
            rows={rows.map((r) => ({ ...r, id: r.location_id }))}
            empty="No storage unit registered."
            columns={[
              { key: 'location_code', header: 'Unit', render: (r) => (<><strong>{r.location_code}</strong><div className="t-sub">{r.storage_area}</div></>) },
              { key: 'hospital_name', header: 'Hospital', render: (r) => (<><div>{r.hospital_name}</div><div className="t-sub">{r.district}, {r.state}</div></>) },
              { key: 'storage_type', header: 'Type', render: (r) => label(r.storage_type) },
              { key: 'occupancy', header: 'Occupancy', render: (r) => (
                <div style={{ minWidth: 150 }}>
                  <div className="t-sub num">{r.used_slots} of {r.capacity} · {r.occupancy_pct}%</div>
                  <div className={`meter ${r.occupancy_pct > 90 ? 'full' : r.occupancy_pct > 70 ? 'warn' : ''}`}>
                    <i style={{ width: `${Math.min(100, r.occupancy_pct)}%` }} />
                  </div>
                </div>) },
              { key: 'current_status', header: 'Status', render: (r) => <Badge value={r.current_status} /> },
              { key: 'actions', header: '', render: (r) => (
                <Select value={r.current_status} onChange={(e) => act(() => api.put(`/storage/${r.location_id}`, { current_status: e.target.value }))}>
                  {['OPERATIONAL', 'MAINTENANCE', 'DECOMMISSIONED'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </Select>) },
            ]}
          />
        )}
      </Card>

      {showNew && (
        <NewUnit hospitals={hospitals} onClose={() => setShowNew(false)}
          onDone={(body) => { setShowNew(false); act(() => api.post('/storage', body)); }} />
      )}
    </>
  );
}

function NewUnit({ hospitals, onClose, onDone }) {
  const [form, setForm] = useState({ hospital_id: '', location_code: '', storage_area: '', storage_type: 'LN2_VAPOUR', capacity: 50 });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title="Add a storage unit" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onDone(form)} disabled={!form.hospital_id || !form.location_code}>Add unit</button></>}>
      <Field label="Hospital">
        <Select value={form.hospital_id} onChange={set('hospital_id')}>
          <option value="">Choose a hospital</option>
          {hospitals.map((h) => <option key={h.hospital_id} value={h.hospital_id}>{h.hospital_name} · {h.district}</option>)}
        </Select>
      </Field>
      <Field label="Code"><Input value={form.location_code} onChange={set('location_code')} placeholder="CHN-AD-LN2-03" /></Field>
      <Field label="Area"><Input value={form.storage_area} onChange={set('storage_area')} placeholder="Main cryobank hall" /></Field>
      <Field label="Type">
        <Select value={form.storage_type} onChange={set('storage_type')}>
          {['LN2_LIQUID', 'LN2_VAPOUR', 'ULT_FREEZER'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </Select>
      </Field>
      <Field label="Capacity (units)"><Input type="number" value={form.capacity} onChange={set('capacity')} /></Field>
    </Modal>
  );
}
