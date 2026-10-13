import { useEffect, useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { TierBadge } from '../components/TierRings';
import { Badge, Card, Field, HlaDots, Input, Skeleton, Modal, Select, Table, fmtDate, label, useToast } from '../components/ui';

export default function Transplants() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null);

  const load = () => api.get(`/transplants${qs({ status })}`).then(setRows).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, [status]);

  const canEdit = ['ADMIN', 'DOCTOR'].includes(user.role);

  async function act(fn) {
    try { const r = await fn(); toast(r.message); await load(); } catch (e) { toast(e.message, true); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transplants</h1>
          <p>Every scheduled and completed infusion, with the unit that was used and how the patient did afterwards.</p>
        </div>
      </div>

      <div className="filters">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {['SCHEDULED', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
      </div>

      <Card>
        {!rows ? <Skeleton rows={6} /> : (
          <Table
            rows={rows.map((t) => ({ ...t, id: t.transplant_id }))}
            empty="No transplant has been scheduled yet."
            columns={[
              { key: 'transplant_id', header: 'Record', render: (t) => <strong className="num">#{t.transplant_id}</strong> },
              { key: 'patient_name', header: 'Patient', render: (t) => (<><div>{t.patient_name}</div><div className="t-sub">{t.diagnosis}</div></>) },
              { key: 'sample_id', header: 'Unit', render: (t) => (<><a href={`#/samples/${t.sample_id}`} className="num">#{t.sample_id}</a><div className="t-sub">{label(t.sample_type)} · {t.donor_blood_group}</div></>) },
              { key: 'hla_match_score', header: 'Match', render: (t) => (<><HlaDots score={t.hla_match_score} /><div style={{ marginTop: 4 }}><TierBadge tier={t.search_tier} /></div></>) },
              { key: 'doctor_name', header: 'Team', render: (t) => (<><div>{t.doctor_name}</div><div className="t-sub">{t.hospital_name}</div></>) },
              { key: 'transplant_date', header: 'Date', render: (t) => fmtDate(t.transplant_date) },
              { key: 'transplant_status', header: 'Status', render: (t) => (<><Badge value={t.transplant_status} /><div style={{ marginTop: 4 }}><Badge value={t.outcome} /></div></>) },
              {
                key: 'actions',
                header: '',
                render: (t) => (canEdit ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {t.transplant_status !== 'CANCELLED' && <button className="btn btn-sm" onClick={() => setEditing(t)}>
                      {t.transplant_status === 'SCHEDULED' ? 'Mark done' : 'Update outcome'}
                    </button>}
                    {t.transplant_status === 'SCHEDULED' && (
                      <button className="btn btn-sm" onClick={() => act(() => api.post(`/transplants/${t.transplant_id}/cancel`, { remarks: 'Cancelled by the transplant team' }))}>Cancel</button>
                    )}
                  </div>
                ) : null),
              },
            ]}
          />
        )}
      </Card>

      {editing && (
        <OutcomeDialog transplant={editing} onClose={() => setEditing(null)}
          onDone={(outcome, remarks) => { setEditing(null); act(() => api.post(`/transplants/${editing.transplant_id}/complete`, { outcome, remarks })); }} />
      )}
    </>
  );
}

function OutcomeDialog({ transplant, onClose, onDone }) {
  const [outcome, setOutcome] = useState(transplant.outcome);
  const [remarks, setRemarks] = useState(transplant.remarks || '');
  const scheduled = transplant.transplant_status === 'SCHEDULED';
  return (
    <Modal title={scheduled ? 'Record the infusion' : 'Update the outcome'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onDone(outcome, remarks)}>Save</button></>}>
      {scheduled && <p className="t-sub">Marking this done consumes unit #{transplant.sample_id}: it leaves storage and the request closes.</p>}
      <Field label="Outcome">
        <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          {['PENDING', 'ENGRAFTED', 'GRAFT_FAILURE', 'COMPLICATIONS'].map((o) => <option key={o} value={o}>{label(o)}</option>)}
        </Select>
      </Field>
      <Field label="Clinical note"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Neutrophil engraftment on day +18" /></Field>
    </Modal>
  );
}
