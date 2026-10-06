import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Kpi, Loading, Table, fmtDate, fmtDateTime, label } from '../components/ui';

/** "Dr. Ananya Raghavan" -> "Ananya";  "staff.kavya" -> "Kavya" */
function greet(user) {
  const raw = user.name || user.username;
  const word = raw.replace(/^Dr\.?\s*/i, '').split(/[\s.]/).filter(Boolean).slice(-1)[0] || raw;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const TYPE_COLOURS = { CORD_BLOOD: '#e0218a', BONE_MARROW: '#8a2be2', PBSC: '#ffb01f' };

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/dashboard').then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <div className="error-bar">{error}</div>;
  if (!data) return <Loading what="Loading the registry" />;

  const { kpi, byType, byState, byStatus, outcomes, queue, expiring, activity } = data;
  const statusOf = (s) => byStatus.find((r) => r.request_status === s)?.n || 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good to see you, {greet(user)}</h1>
          <p>
            {user.role === 'DOCTOR'
              ? 'Your requests, the units you can still reach, and what needs a decision today.'
              : 'Inventory, requests waiting for review, and units close to expiry.'}
          </p>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <Kpi label="Units available" value={kpi.available_samples} note={`${kpi.in_testing} still in testing`} />
        <Kpi label="Requests waiting" value={statusOf('PENDING')} note={`${statusOf('APPROVED')} approved, ${statusOf('ALLOCATED')} allocated`}
          tone={statusOf('PENDING') ? 'warn' : ''} />
        <Kpi label="Expiring in 60 days" value={kpi.expiring_60d} note="review or offer these first" tone={kpi.expiring_60d ? 'alert' : ''} />
        <Kpi label="Storage used" value={`${kpi.storage_used_pct ?? 0}%`} note={`${kpi.active_hospitals} hospitals connected`} />
      </div>

      <div className="split" style={{ marginBottom: 14 }}>
        <Card title="Available units by state">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byState} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
              <defs>
                <linearGradient id="sunsetBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e0218a" />
                  <stop offset="70%" stopColor="#ff5e3a" />
                  <stop offset="100%" stopColor="#ffb01f" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#f6e3da" vertical={false} />
              <XAxis dataKey="state" tick={{ fontSize: 11, fill: '#7c5c7e' }} interval={0} angle={-18} textAnchor="end" height={54} />
              <YAxis tick={{ fontSize: 11, fill: '#7c5c7e' }} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(224,33,138,.07)' }}
                contentStyle={{ borderRadius: 12, border: '1px solid #f3dbd2', boxShadow: '0 14px 34px rgba(224,33,138,.16)' }} />
              <Bar dataKey="units" fill="url(#sunsetBar)" radius={[8, 8, 0, 0]} animationDuration={1100} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Inventory mix">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={byType} dataKey="units" nameKey="sample_type" innerRadius={54} outerRadius={88} paddingAngle={4}
                   cornerRadius={8} animationDuration={1100}>
                {byType.map((d) => <Cell key={d.sample_type} fill={TYPE_COLOURS[d.sample_type]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v, label(n)]}
                contentStyle={{ borderRadius: 12, border: '1px solid #f3dbd2', boxShadow: '0 14px 34px rgba(224,33,138,.16)' }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {byType.map((d) => (
              <span key={d.sample_type} className="t-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <i style={{ width: 9, height: 9, borderRadius: 2, background: TYPE_COLOURS[d.sample_type], display: 'inline-block' }} />
                {label(d.sample_type)} · {d.units}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Needs a decision" className="" action={<button className="btn btn-sm" onClick={() => navigate('/requests')}>All requests</button>}>
        <Table
          rows={queue.map((r) => ({ ...r, id: r.request_id }))}
          onRowClick={(r) => navigate(`/requests/${r.request_id}`)}
          empty="No open requests. Nothing is waiting on you."
          columns={[
            { key: 'request_id', header: 'Request', render: (r) => <strong className="num">#{r.request_id}</strong> },
            { key: 'patient_name', header: 'Patient', render: (r) => (<><div>{r.patient_name}</div><div className="t-sub">{label(r.required_sample_type)}</div></>) },
            { key: 'hospital_name', header: 'Requesting hospital', render: (r) => (<><div>{r.hospital_name}</div><div className="t-sub">{r.district}, {r.state}</div></>) },
            { key: 'urgency', header: 'Urgency', render: (r) => <Badge value={r.urgency} /> },
            { key: 'request_status', header: 'Status', render: (r) => <Badge value={r.request_status} /> },
            { key: 'request_date', header: 'Raised', render: (r) => fmtDate(r.request_date) },
          ]}
        />
      </Card>

      {user.role !== 'DOCTOR' && (
        <div className="split" style={{ marginTop: 14 }}>
          <Card title="Units close to expiry">
            <Table
              rows={expiring.map((s) => ({ ...s, id: s.sample_id }))}
              onRowClick={(s) => navigate(`/samples/${s.sample_id}`)}
              empty="No unit expires in the next 60 days."
              columns={[
                { key: 'sample_id', header: 'Unit', render: (s) => <span className="num">#{s.sample_id}</span> },
                { key: 'sample_type', header: 'Type', render: (s) => label(s.sample_type) },
                { key: 'hospital_name', header: 'Stored at' },
                { key: 'days_to_expiry', header: 'Expires', render: (s) => (
                  <Badge tone={s.days_to_expiry <= 7 ? 'red' : 'amber'}>{s.days_to_expiry} days</Badge>) },
              ]}
            />
          </Card>
          <Card title="Latest activity">
            {activity.length === 0 ? <div className="empty">Nothing recorded yet.</div> : (
              <div className="timeline">
                {activity.map((a) => (
                  <div className="timeline-item" key={a.audit_id}>
                    <div><strong>{label(a.action)}</strong> on {label(a.table_name)} #{a.record_id}</div>
                    <div className="t-sub">{a.username || 'system'} · {fmtDateTime(a.action_time)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {outcomes.length > 0 && (
        <Card title="Transplant outcomes" className="" >
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            {outcomes.map((o) => (
              <div key={o.outcome}>
                <div className="kpi-value num">{o.n}</div>
                <Badge value={o.outcome} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
