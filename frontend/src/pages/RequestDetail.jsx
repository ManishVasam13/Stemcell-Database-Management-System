import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import TierRings, { TierBadge } from '../components/TierRings';
import { Badge, Card, Field, HlaDots, Input, Loading, Modal, Select, Table, fmtDate, fmtDateTime, label, useToast } from '../components/ui';

export default function RequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [search, setSearch] = useState(null);      // { tiers, candidates, selectedTier }
  const [busy, setBusy] = useState('');
  const [dialog, setDialog] = useState(null);      // 'review' | 'schedule' | 'cancel'

  const load = () => api.get(`/requests/${id}`).then(setData).catch((e) => toast(e.message, true));
  useEffect(() => { load(); setSearch(null); }, [id]);

  if (!data) return <Loading what="Loading request" />;

  const staff = ['ADMIN', 'BANK_STAFF'].includes(user.role);
  const doctor = user.role === 'DOCTOR';
  const allocated = data.candidates.find((c) => c.selection_status === 'ALLOCATED');

  async function run(action, fn, done) {
    setBusy(action);
    try {
      const r = await fn();
      if (r?.message) toast(r.message);
      if (done) done(r);
      await load();
    } catch (e) { toast(e.message, true); } finally { setBusy(''); }
  }

  const findUnits = (save) => run(save ? 'shortlist' : 'search',
    () => api.post(`/requests/${id}/${save ? 'shortlist' : 'search'}`),
    (r) => setSearch(r));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Request #{data.request_id} · {data.patient_name}</h1>
          <p>
            {data.diagnosis} · needs {label(data.required_sample_type).toLowerCase()} with at least {data.min_hla_match}/6 HLA match ·
            raised by {data.doctor_name} at {data.hospital_name}, {data.district}, {data.state}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge value={data.urgency} />
          <Badge value={data.request_status} />
        </div>
      </div>

      {data.request_status === 'PENDING' && staff && (
        <div className="ok-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>This request is waiting for review. Approve it to start searching for a unit.</span>
          <button className="btn btn-sm btn-primary" onClick={() => setDialog('review')}>Review</button>
        </div>
      )}

      <div className="split">
        <div>
          <Card
            title="Where the registry looked"
            action={
              <div style={{ display: 'flex', gap: 8 }}>
                {(staff || doctor) && ['PENDING', 'APPROVED'].includes(data.request_status) && (
                  <button className="btn btn-sm" disabled={busy === 'search'} onClick={() => findUnits(false)}>
                    {busy === 'search' ? 'Searching…' : 'Run search'}
                  </button>
                )}
                {staff && data.request_status === 'APPROVED' && (
                  <button className="btn btn-sm btn-primary" disabled={busy === 'shortlist'} onClick={() => findUnits(true)}>
                    {busy === 'shortlist' ? 'Shortlisting…' : 'Search and shortlist'}
                  </button>
                )}
              </div>
            }
          >
            {!search ? (
              <p className="t-sub" style={{ margin: 0 }}>
                The search starts in {data.district}. If no compatible unit is stored there it widens to {data.state},
                and only then to the rest of India. Run the search to see what each ring holds.
              </p>
            ) : (
              <>
                <TierRings tiers={search.tiers} selectedTier={search.selectedTier} />
                <p className="t-sub" style={{ marginBottom: 0, marginTop: 12 }}>
                  {search.selectedTier
                    ? `${search.candidates.length} compatible unit(s) found in the ${label(search.selectedTier).toLowerCase()} ring.`
                    : 'No unit anywhere in India matches this patient at the required HLA level today. Widen the minimum match or wait for new donations.'}
                </p>
              </>
            )}
          </Card>

          {search?.candidates?.length > 0 && (
            <Card title="Search results" className="" >
              <Table
                rows={search.candidates.map((c) => ({ ...c, id: c.sample_id }))}
                columns={[
                  { key: 'sample_id', header: 'Unit', render: (c) => <span className="num">#{c.sample_id}</span> },
                  { key: 'hla_match_score', header: 'HLA match', render: (c) => <HlaDots score={c.hla_match_score} /> },
                  { key: 'donor_blood_group', header: 'Blood group', render: (c) => (<>{c.donor_blood_group}{c.abo_identical ? <div className="t-sub">same as patient</div> : null}</>) },
                  { key: 'hospital_name', header: 'Stored at', render: (c) => (<><div>{c.hospital_name}</div><div className="t-sub">{c.district}, {c.state}</div></>) },
                  { key: 'cd34_count', header: 'CD34', render: (c) => <span className="num">{c.cd34_count ?? '—'}</span> },
                  { key: 'expiry_date', header: 'Expires', render: (c) => fmtDate(c.expiry_date) },
                  { key: 'existing_status', header: '', render: (c) => (c.existing_status ? <Badge value="CANDIDATE">shortlisted</Badge> : null) },
                ]}
              />
            </Card>
          )}

          <Card title="Shortlist" className="">
            <Table
              rows={data.candidates.map((c) => ({ ...c, id: `${c.request_id}:${c.sample_id}` }))}
              empty="No unit has been shortlisted yet."
              columns={[
                { key: 'sample_id', header: 'Unit', render: (c) => <a href={`#/samples/${c.sample_id}`} className="num">#{c.sample_id}</a> },
                { key: 'hla_match_score', header: 'HLA match', render: (c) => <HlaDots score={c.hla_match_score} /> },
                { key: 'search_tier', header: 'Found in', render: (c) => <TierBadge tier={c.search_tier} /> },
                { key: 'hospital_name', header: 'Stored at', render: (c) => (c.hospital_name ? <>{c.hospital_name}<div className="t-sub">{c.district}</div></> : <span className="t-sub">released from storage</span>) },
                { key: 'selection_status', header: 'Status', render: (c) => (<><Badge value={c.selection_status} />{c.allocation_date && <div className="t-sub">{fmtDate(c.allocation_date)}</div>}</>) },
                {
                  key: 'actions',
                  header: '',
                  render: (c) => (staff && c.selection_status === 'CANDIDATE' && data.request_status === 'APPROVED' ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-primary" disabled={!!busy}
                        onClick={() => run('allocate', () => api.post(`/requests/${id}/allocate`, { sample_id: c.sample_id }))}>Allocate</button>
                      <button className="btn btn-sm" disabled={!!busy}
                        onClick={() => run('reject', () => api.post(`/requests/${id}/candidates/${c.sample_id}/reject`))}>Remove</button>
                    </div>
                  ) : null),
                },
              ]}
            />
          </Card>
        </div>

        <div>
          <Card title="Patient">
            <dl className="kv">
              <dt>Name</dt><dd><a href={`#/patients/${data.patient.patient_id}`}>{data.patient.full_name}</a></dd>
              <dt>Age / sex</dt><dd>{data.patient.age} · {data.patient.gender}</dd>
              <dt>Blood group</dt><dd>{data.patient.blood_group}</dd>
              <dt>Diagnosis</dt><dd>{data.patient.diagnosis}</dd>
              <dt>HLA type</dt>
              <dd className="t-sub">
                {data.patient.hla_a_1
                  ? `${data.patient.hla_a_1}, ${data.patient.hla_a_2}, ${data.patient.hla_b_1}, ${data.patient.hla_b_2}, ${data.patient.hla_drb1_1}, ${data.patient.hla_drb1_2}`
                  : 'not typed'}
              </dd>
            </dl>
          </Card>

          <Card title="Progress" className="" >
            <div className="timeline">
              <div className="timeline-item">
                <div><strong>Raised</strong> by {data.doctor_name}</div>
                <div className="t-sub">{fmtDateTime(data.request_date)}</div>
              </div>
              {data.reviewed_at && (
                <div className="timeline-item">
                  <div><strong>{data.request_status === 'REJECTED' ? 'Rejected' : 'Approved'}</strong> by {data.reviewed_by_username}</div>
                  <div className="t-sub">{fmtDateTime(data.reviewed_at)}{data.review_remarks ? ` · ${data.review_remarks}` : ''}</div>
                </div>
              )}
              {allocated && (
                <div className="timeline-item">
                  <div><strong>Unit #{allocated.sample_id} allocated</strong> · {label(allocated.search_tier).toLowerCase()}</div>
                  <div className="t-sub">{fmtDateTime(allocated.allocation_date)}</div>
                </div>
              )}
              {data.transplant_id && (
                <div className="timeline-item">
                  <div><strong>Transplant {label(data.transplant_status).toLowerCase()}</strong></div>
                  <div className="t-sub">{fmtDate(data.transplant_date)} · outcome {label(data.outcome).toLowerCase()}</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              {staff && data.request_status === 'ALLOCATED' && !data.transplant_id && (
                <button className="btn btn-sm" disabled={!!busy} onClick={() => run('release', () => api.post(`/requests/${id}/release`))}>
                  Release the unit
                </button>
              )}
              {(doctor || user.role === 'ADMIN') && data.request_status === 'ALLOCATED' && !data.transplant_id && (
                <button className="btn btn-sm btn-primary" onClick={() => setDialog('schedule')}>Schedule transplant</button>
              )}
              {data.transplant_id && (
                <button className="btn btn-sm" onClick={() => navigate('/transplants')}>Open transplant record</button>
              )}
              {['PENDING', 'APPROVED', 'ALLOCATED'].includes(data.request_status) && (staff || doctor) && (
                <button className="btn btn-sm btn-danger" onClick={() => setDialog('cancel')}>Cancel request</button>
              )}
            </div>
          </Card>

          {staff && data.history?.length > 0 && (
            <Card title="Audit trail" className="">
              <div className="timeline">
                {data.history.map((h, i) => (
                  <div className="timeline-item" key={i}>
                    <div className="t-sub">{fmtDateTime(h.action_time)} · {h.username || 'system'}</div>
                    <div className="json-box">{JSON.stringify(h.new_value)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {dialog === 'review' && (
        <ReviewDialog onClose={() => setDialog(null)} onDone={(decision, remarks) => {
          setDialog(null);
          run('review', () => api.post(`/requests/${id}/review`, { decision, remarks }));
        }} />
      )}
      {dialog === 'schedule' && (
        <ScheduleDialog onClose={() => setDialog(null)} onDone={(transplant_date, remarks) => {
          setDialog(null);
          run('schedule', () => api.post('/transplants', { request_id: Number(id), transplant_date, remarks }));
        }} />
      )}
      {dialog === 'cancel' && (
        <CancelDialog onClose={() => setDialog(null)} onDone={(remarks) => {
          setDialog(null);
          run('cancel', () => api.post(`/requests/${id}/cancel`, { remarks }));
        }} />
      )}
    </>
  );
}

function ReviewDialog({ onClose, onDone }) {
  const [decision, setDecision] = useState('APPROVED');
  const [remarks, setRemarks] = useState('');
  return (
    <Modal title="Review this request" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onDone(decision, remarks)}>Save decision</button></>}>
      <Field label="Decision">
        <Select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="APPROVED">Approve</option>
          <option value="REJECTED">Reject</option>
        </Select>
      </Field>
      <Field label="Remarks">
        <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Clinical criteria met" />
      </Field>
    </Modal>
  );
}

function ScheduleDialog({ onClose, onDone }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  return (
    <Modal title="Schedule the transplant" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onDone(date, remarks)}>Schedule</button></>}>
      <Field label="Transplant date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Conditioning starts one week earlier" /></Field>
    </Modal>
  );
}

function CancelDialog({ onClose, onDone }) {
  const [remarks, setRemarks] = useState('');
  return (
    <Modal title="Cancel this request" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Keep it open</button>
        <button className="btn btn-danger" onClick={() => onDone(remarks)}>Cancel request</button></>}>
      <p>Any allocated unit goes back to the pool and a scheduled transplant is cancelled with it.</p>
      <Field label="Reason"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Patient transferred to another centre" /></Field>
    </Modal>
  );
}
