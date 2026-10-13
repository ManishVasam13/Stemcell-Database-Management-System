import { useEffect, useState } from 'react';
import { api, qs } from '../api';
import { Badge, Card, Skeleton, Select, Table, fmtDateTime, label, useToast } from '../components/ui';

const TABLES = ['stem_cell_sample', 'consent', 'transplant_request', 'request_sample', 'transplant'];

export default function Audit() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ table_name: '', action: '', offset: 0, limit: 50 });

  useEffect(() => { api.get(`/audit${qs(filters)}`).then(setData).catch((e) => toast(e.message, true)); },
    [filters.table_name, filters.action, filters.offset]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity log</h1>
          <p>Written by database triggers, not by the application. Rows here cannot be edited or deleted by anyone, including an administrator.</p>
        </div>
      </div>

      <div className="filters">
        <Select value={filters.table_name} onChange={(e) => setFilters({ ...filters, table_name: e.target.value, offset: 0 })}>
          <option value="">Any record type</option>
          {TABLES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </Select>
        <Select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value, offset: 0 })}>
          <option value="">Any action</option>
          {['INSERT', 'UPDATE', 'DELETE'].map((a) => <option key={a} value={a}>{label(a)}</option>)}
        </Select>
      </div>

      <Card>
        {!data ? <Skeleton rows={6} /> : (
          <>
            <Table
              rows={data.rows.map((r) => ({ ...r, id: r.audit_id }))}
              empty="Nothing recorded for this filter."
              columns={[
                { key: 'action_time', header: 'When', render: (r) => fmtDateTime(r.action_time) },
                { key: 'username', header: 'Who', render: (r) => (r.username ? <>{r.username}<div className="t-sub">{label(r.role)}</div></> : <span className="t-sub">system job</span>) },
                { key: 'action', header: 'Action', render: (r) => <Badge value={r.action} tone={r.action === 'DELETE' ? 'red' : r.action === 'INSERT' ? 'green' : 'teal'} /> },
                { key: 'table_name', header: 'Record', render: (r) => <>{label(r.table_name)} <span className="num">#{r.record_id}</span></> },
                { key: 'change', header: 'Change', render: (r) => (
                  <div style={{ maxWidth: 420 }}>
                    {r.old_value && <div className="json-box" style={{ marginBottom: 4 }}>before {JSON.stringify(r.old_value)}</div>}
                    {r.new_value && <div className="json-box">after {JSON.stringify(r.new_value)}</div>}
                  </div>) },
              ]}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span className="t-sub num">{data.offset + 1}–{Math.min(data.offset + data.limit, data.total)} of {data.total}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" disabled={filters.offset === 0}
                  onClick={() => setFilters({ ...filters, offset: Math.max(0, filters.offset - filters.limit) })}>Previous</button>
                <button className="btn btn-sm" disabled={data.offset + data.limit >= data.total}
                  onClick={() => setFilters({ ...filters, offset: filters.offset + filters.limit })}>Next</button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
