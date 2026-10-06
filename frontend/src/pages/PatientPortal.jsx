import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Card, Loading, fmtDate, label, useToast } from '../components/ui';

const STAGE_TEXT = {
  PENDING: 'Your doctor has raised the request. The bank is reviewing it.',
  APPROVED: 'Approved. The registry is searching for a matching unit.',
  ALLOCATED: 'A matching unit has been reserved for you.',
  COMPLETED: 'Your transplant has been recorded.',
  REJECTED: 'This request was not approved. Your doctor can explain why.',
  CANCELLED: 'This request was cancelled.',
};
const STAGES = ['PENDING', 'APPROVED', 'ALLOCATED', 'COMPLETED'];

export default function PatientPortal() {
  const toast = useToast();
  const [data, setData] = useState(null);

  useEffect(() => { api.get('/portal/patient').then(setData).catch((e) => toast(e.message, true)); }, []);
  if (!data) return <Loading what="Loading your record" />;

  const { patient, requests } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hello, {patient.full_name.split(' ')[0]}</h1>
          <p>{patient.diagnosis} · blood group {patient.blood_group} · HLA typing {patient.hla_typed ? 'on file' : 'still needed'}</p>
        </div>
        <Badge value={patient.status} />
      </div>

      {requests.length === 0 && (
        <Card><div className="empty"><h3>No request yet</h3><p>Your doctor raises a transplant request when you are ready for one.</p></div></Card>
      )}

      {requests.map((r) => {
        const stageIndex = STAGES.indexOf(r.request_status);
        return (
          <Card key={r.request_id} title={`Request #${r.request_id} · ${label(r.required_sample_type)}`}
            action={<Badge value={r.request_status} />} className="">
            <p style={{ marginTop: 0 }}>{STAGE_TEXT[r.request_status]}</p>
            <div className="timeline">
              {STAGES.slice(0, Math.max(stageIndex + 1, 1)).map((s) => (
                <div className="timeline-item" key={s}>
                  <div><strong>{label(s)}</strong></div>
                  <div className="t-sub">
                    {s === 'PENDING' && `Raised ${fmtDate(r.request_date)} by ${r.doctor_name}`}
                    {s === 'APPROVED' && `Reviewed ${fmtDate(r.reviewed_at)}`}
                    {s === 'ALLOCATED' && 'A unit was matched and reserved'}
                    {s === 'COMPLETED' && `Transplant on ${fmtDate(r.transplant_date)} · ${label(r.outcome)}`}
                  </div>
                </div>
              ))}
            </div>
            <dl className="kv" style={{ marginTop: 14 }}>
              <dt>Treating doctor</dt><dd>{r.doctor_name}</dd>
              <dt>Hospital</dt><dd>{r.hospital_name}, {r.district}</dd>
              <dt>Urgency</dt><dd><Badge value={r.urgency} /></dd>
              {r.transplant_status && <><dt>Transplant</dt><dd>{label(r.transplant_status)} · {fmtDate(r.transplant_date)}</dd></>}
            </dl>
          </Card>
        );
      })}
    </>
  );
}
