import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Badge, Card, Field, Input, Loading, Modal, Select, Table, fmtDate, label, useToast } from '../components/ui';

export default function DonorDetail() {
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const [donor, setDonor] = useState(null);
  const [dialog, setDialog] = useState(null);

  const load = () => api.get(`/donors/${id}`).then(setDonor).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, [id]);
  if (!donor) return <Loading what="Loading donor" />;

  async function act(fn) {
    try { const r = await fn(); toast(r.message); await load(); } catch (e) { toast(e.message, true); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{donor.full_name}</h1>
          <p className="num">Donor #{donor.donor_id} · {donor.age} years · {donor.blood_group} · registered {fmtDate(donor.registration_date)}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge value={donor.status} />
          <button className="btn" onClick={() => setDialog('consent')}>Record consent</button>
          <button className="btn btn-primary" onClick={() => setDialog('sample')} disabled={!donor.consentFlags?.has_collection}>Register a unit</button>
        </div>
      </div>

      {!donor.consentFlags?.has_collection && (
        <div className="error-bar">This donor has no active collection consent, so no new unit can be collected.</div>
      )}

      <div className="split">
        <div>
          <Card title="Donated units">
            <Table
              rows={donor.samples.map((s) => ({ ...s, id: s.sample_id }))}
              onRowClick={(s) => navigate(`/samples/${s.sample_id}`)}
              empty="No unit has been collected from this donor yet."
              columns={[
                { key: 'sample_id', header: 'Unit', render: (s) => <span className="num">#{s.sample_id}</span> },
                { key: 'sample_type', header: 'Type', render: (s) => label(s.sample_type) },
                { key: 'collection_date', header: 'Collected', render: (s) => fmtDate(s.collection_date) },
                { key: 'processing_status', header: 'Processing', render: (s) => <Badge value={s.processing_status} /> },
                { key: 'availability_status', header: 'Availability', render: (s) => <Badge value={s.availability_status} /> },
                { key: 'hospital_name', header: 'Stored at', render: (s) => (s.hospital_name ? <>{s.hospital_name}<div className="t-sub">{s.location_code} · {s.storage_position}</div></> : '—') },
              ]}
            />
          </Card>

          <Card title="Consent history" className="">
            <Table
              rows={donor.consents.map((c) => ({ ...c, id: c.consent_id }))}
              empty="No consent recorded."
              columns={[
                { key: 'consent_type', header: 'Consent', render: (c) => label(c.consent_type) },
                { key: 'consent_date', header: 'Signed', render: (c) => fmtDate(c.consent_date) },
                { key: 'valid_until', header: 'Valid until', render: (c) => (c.valid_until ? fmtDate(c.valid_until) : 'no expiry') },
                { key: 'status', header: 'Status', render: (c) => (<><Badge value={c.status} />{c.revoked_on && <div className="t-sub">revoked {fmtDate(c.revoked_on)}</div>}</>) },
                { key: 'actions', header: '', render: (c) => (c.status === 'ACTIVE' ? (
                  <button className="btn btn-sm" onClick={() => act(() => api.post(`/consents/${c.consent_id}/revoke`, { reason: 'Revoked at the donor\'s request' }))}>Revoke</button>
                ) : null) },
              ]}
            />
            <p className="t-sub" style={{ marginBottom: 0 }}>
              Revoking storage or clinical-use consent immediately withdraws this donor's available units from matching.
            </p>
          </Card>
        </div>

        <Card title="Details">
          <dl className="kv">
            <dt>Phone</dt><dd>{donor.phone}</dd>
            <dt>E-mail</dt><dd>{donor.email || '—'}</dd>
            <dt>Address</dt><dd>{donor.address || '—'}</dd>
            <dt>Login</dt><dd>{donor.username || 'no portal access'}</dd>
            <dt>HLA-A</dt><dd className="num">{donor.hla_a_1 ? `${donor.hla_a_1}, ${donor.hla_a_2}` : 'not typed'}</dd>
            <dt>HLA-B</dt><dd className="num">{donor.hla_b_1 ? `${donor.hla_b_1}, ${donor.hla_b_2}` : '—'}</dd>
            <dt>HLA-DRB1</dt><dd className="num">{donor.hla_drb1_1 ? `${donor.hla_drb1_1}, ${donor.hla_drb1_2}` : '—'}</dd>
          </dl>
        </Card>
      </div>

      {dialog === 'consent' && (
        <ConsentDialog onClose={() => setDialog(null)} onDone={(body) => { setDialog(null); act(() => api.post('/consents', { donor_id: donor.donor_id, ...body })); }} />
      )}
      {dialog === 'sample' && (
        <SampleDialog onClose={() => setDialog(null)} onDone={(body) => { setDialog(null); act(() => api.post('/samples', { donor_id: donor.donor_id, ...body })); }} />
      )}
    </>
  );
}

function ConsentDialog({ onClose, onDone }) {
  const [form, setForm] = useState({ consent_type: 'STORAGE', consent_date: new Date().toISOString().slice(0, 10), valid_until: '' });
  return (
    <Modal title="Record a consent" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onDone(form)}>Save consent</button></>}>
      <Field label="Consent type">
        <Select value={form.consent_type} onChange={(e) => setForm({ ...form, consent_type: e.target.value })}>
          {['COLLECTION', 'STORAGE', 'CLINICAL_USE'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </Select>
      </Field>
      <Field label="Signed on"><Input type="date" value={form.consent_date} onChange={(e) => setForm({ ...form, consent_date: e.target.value })} /></Field>
      <Field label="Valid until (leave empty for no expiry)"><Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></Field>
    </Modal>
  );
}

function SampleDialog({ onClose, onDone }) {
  const [form, setForm] = useState({ sample_type: 'CORD_BLOOD', collection_date: new Date().toISOString().slice(0, 10), volume_ml: '', expiry_date: '' });
  return (
    <Modal title="Register a collected unit" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onDone(form)}>Register unit</button></>}>
      <p className="t-sub">Five laboratory tests are created as pending. The unit can only be released once the mandatory four pass.</p>
      <Field label="Unit type">
        <Select value={form.sample_type} onChange={(e) => setForm({ ...form, sample_type: e.target.value })}>
          {['CORD_BLOOD', 'BONE_MARROW', 'PBSC'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </Select>
      </Field>
      <Field label="Collected on"><Input type="date" value={form.collection_date} onChange={(e) => setForm({ ...form, collection_date: e.target.value })} /></Field>
      <Field label="Volume (ml)"><Input type="number" step="0.01" value={form.volume_ml} onChange={(e) => setForm({ ...form, volume_ml: e.target.value })} /></Field>
      <Field label="Expiry date (cord blood usually has none)"><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></Field>
    </Modal>
  );
}
