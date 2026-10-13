import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { Badge, Card, Field, Input, Loading, Modal, Select, Table, fmtDate, fmtDateTime, label, useToast } from '../components/ui';

export default function SampleDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [sample, setSample] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [editingTest, setEditingTest] = useState(null);

  const load = () => api.get(`/samples/${id}`).then(setSample).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, [id]);
  if (!sample) return <Loading what="Loading unit" />;

  async function act(fn) {
    try { const r = await fn(); toast(r.message); await load(); } catch (e) { toast(e.message, true); }
  }

  const canRelease = sample.processing_status !== 'RELEASED' && sample.processing_status !== 'REJECTED';

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="num">Unit #{sample.sample_id}</h1>
          <p>
            {label(sample.sample_type)} · {sample.volume_ml} ml · CD34 {sample.cd34_count ?? 'not counted'} ·
            collected {fmtDate(sample.collection_date)} from <a href={`#/donors/${sample.donor_id}`}>{sample.donor_name}</a> ({sample.blood_group})
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge value={sample.processing_status} />
          <Badge value={sample.availability_status} />
          {canRelease && <button className="btn btn-primary" onClick={() => setDialog('release')}>Release into storage</button>}
          {['AVAILABLE', 'NOT_AVAILABLE', 'EXPIRED'].includes(sample.availability_status) && (
            <button className="btn btn-danger" onClick={() => act(() => api.post(`/samples/${id}/discard`))}>Discard</button>
          )}
        </div>
      </div>

      {!sample.mandatory_tests_passed && (
        <div className="error-bar">
          Mandatory tests are not all passed yet ({sample.passed_tests} passed, {sample.pending_tests} pending, {sample.failed_tests} failed),
          so this unit cannot be released.
        </div>
      )}
      {sample.processing_status === 'RELEASED' && !(sample.has_storage_consent && sample.has_clinical_consent) && (
        <div className="error-bar">The donor's storage or clinical-use consent is not active, so this unit is held back from matching.</div>
      )}

      <div className="split">
        <div>
          <Card title="Laboratory tests" action={<button className="btn btn-sm" onClick={() => setDialog('test')}>Add a test</button>}>
            <Table
              rows={sample.tests.map((t) => ({ ...t, id: t.test_id }))}
              empty="No test recorded."
              columns={[
                { key: 'test_type', header: 'Test', render: (t) => label(t.test_type) },
                { key: 'test_date', header: 'Performed', render: (t) => (<><div>{fmtDateTime(t.test_date)}</div><div className="t-sub">{t.performed_by_username}</div></>) },
                { key: 'result', header: 'Result', render: (t) => (<><div>{t.result || '—'}</div>{t.remarks && <div className="t-sub">{t.remarks}</div>}</>) },
                { key: 'test_status', header: 'Status', render: (t) => <Badge value={t.test_status} /> },
                { key: 'actions', header: '', render: (t) => (t.test_status === 'PENDING'
                  ? <button className="btn btn-sm" onClick={() => setEditingTest(t)}>Record result</button> : null) },
              ]}
            />
          </Card>

          <Card title="Used in requests" className="">
            <Table
              rows={sample.candidacies.map((c) => ({ ...c, id: c.request_id }))}
              empty="This unit has not been shortlisted for any request."
              columns={[
                { key: 'request_id', header: 'Request', render: (c) => <a href={`#/requests/${c.request_id}`} className="num">#{c.request_id}</a> },
                { key: 'patient_name', header: 'Patient' },
                { key: 'hla_match_score', header: 'Match', render: (c) => <span className="num">{c.hla_match_score}/6</span> },
                { key: 'search_tier', header: 'Found in', render: (c) => <Badge value={c.search_tier} /> },
                { key: 'selection_status', header: 'Outcome', render: (c) => <Badge value={c.selection_status} /> },
              ]}
            />
          </Card>
        </div>

        <div>
          <Card title="Storage">
            <dl className="kv">
              <dt>Hospital</dt><dd>{sample.hospital_name || 'not stored'}</dd>
              <dt>Location</dt><dd>{sample.location_code ? `${sample.location_code} · ${sample.storage_position}` : '—'}</dd>
              <dt>Area</dt><dd>{sample.district ? `${sample.district}, ${sample.state}` : '—'}</dd>
              <dt>Storage type</dt><dd>{sample.storage_type ? label(sample.storage_type) : '—'}</dd>
              <dt>Expiry</dt><dd>{sample.expiry_date ? fmtDate(sample.expiry_date) : 'no fixed expiry'}</dd>
              <dt>Donor consent</dt>
              <dd style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <Badge tone={sample.has_storage_consent ? 'green' : 'red'}>storage</Badge>
                <Badge tone={sample.has_clinical_consent ? 'green' : 'red'}>clinical use</Badge>
              </dd>
            </dl>
          </Card>

          <Card title="History" className="">
            <div className="timeline">
              {sample.history.map((h, i) => (
                <div className="timeline-item" key={i}>
                  <div className="t-sub">{fmtDateTime(h.action_time)} · {h.username || 'system'}</div>
                  <div className="json-box">{JSON.stringify(h.new_value)}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {dialog === 'release' && (
        <ReleaseDialog onClose={() => setDialog(null)} onDone={(body) => { setDialog(null); act(() => api.post(`/samples/${id}/release`, body)); }} />
      )}
      {dialog === 'test' && (
        <TestDialog onClose={() => setDialog(null)} onDone={(body) => { setDialog(null); act(() => api.post('/tests', { sample_id: Number(id), ...body })); }} />
      )}
      {editingTest && (
        <ResultDialog test={editingTest} onClose={() => setEditingTest(null)}
          onDone={(body) => { setEditingTest(null); act(() => api.patch(`/tests/${editingTest.test_id}`, body)); }} />
      )}
    </>
  );
}

function ReleaseDialog({ onClose, onDone }) {
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState({ location_id: '', storage_position: '' });
  useEffect(() => { api.get('/storage').then((u) => setUnits(u.filter((x) => x.current_status === 'OPERATIONAL' && x.free_slots > 0))).catch(() => {}); }, []);
  return (
    <Modal title="Release the unit into storage" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onDone(form)} disabled={!form.location_id || !form.storage_position}>Release</button></>}>
      <Field label="Storage unit">
        <Select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
          <option value="">Choose a storage unit</option>
          {units.map((u) => <option key={u.location_id} value={u.location_id}>{u.location_code} · {u.hospital_name} ({u.free_slots} free)</option>)}
        </Select>
      </Field>
      <Field label="Position (rack-box-slot)">
        <Input value={form.storage_position} onChange={(e) => setForm({ ...form, storage_position: e.target.value })} placeholder="R02-B04-S07" />
      </Field>
    </Modal>
  );
}

function TestDialog({ onClose, onDone }) {
  const [form, setForm] = useState({ test_type: 'STERILITY', test_status: 'PENDING', result: '', remarks: '' });
  return (
    <Modal title="Add a laboratory test" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onDone(form)}>Add test</button></>}>
      <Field label="Test">
        <Select value={form.test_type} onChange={(e) => setForm({ ...form, test_type: e.target.value })}>
          {['HLA_TYPING', 'INFECTIOUS_SCREEN', 'STERILITY', 'VIABILITY', 'CD34_COUNT'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </Select>
      </Field>
      <Field label="Status">
        <Select value={form.test_status} onChange={(e) => setForm({ ...form, test_status: e.target.value })}>
          {['PENDING', 'PASSED', 'FAILED', 'INCONCLUSIVE'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </Select>
      </Field>
      <Field label="Result"><Input value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} placeholder="No growth at 14 days" /></Field>
      <Field label="Remarks"><Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
    </Modal>
  );
}

function ResultDialog({ test, onClose, onDone }) {
  const [form, setForm] = useState({ test_status: 'PASSED', result: '', remarks: '' });
  return (
    <Modal title={`Record the ${label(test.test_type).toLowerCase()} result`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onDone(form)} disabled={!form.result}>Save result</button></>}>
      <Field label="Outcome">
        <Select value={form.test_status} onChange={(e) => setForm({ ...form, test_status: e.target.value })}>
          {['PASSED', 'FAILED', 'INCONCLUSIVE'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </Select>
      </Field>
      {form.test_status === 'FAILED' && <div className="error-bar">A failed mandatory test rejects and discards this unit straight away.</div>}
      <Field label="Result"><Input value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} /></Field>
      <Field label="Remarks"><Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
    </Modal>
  );
}
