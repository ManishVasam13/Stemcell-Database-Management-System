import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api';
import { Badge, Card, Input, Skeleton, Select, Table, fmtDate, label, useToast } from '../components/ui';

export default function Samples() {
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState({ q: '', availability_status: '', processing_status: '', sample_type: '' });

  useEffect(() => {
    api.get(`/samples${qs(filters)}`).then(setRows).catch((e) => toast(e.message, true));
  }, [filters.q, filters.availability_status, filters.processing_status, filters.sample_type]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Stem cell units</h1>
          <p>Every collected unit and where it stands: testing, storage, allocation or transplant.</p>
        </div>
      </div>

      <div className="filters">
        <Input placeholder="Unit number, donor or location" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <Select value={filters.availability_status} onChange={(e) => setFilters({ ...filters, availability_status: e.target.value })}>
          <option value="">Any availability</option>
          {['AVAILABLE', 'NOT_AVAILABLE', 'ALLOCATED', 'TRANSPLANTED', 'EXPIRED', 'DISCARDED'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
        <Select value={filters.processing_status} onChange={(e) => setFilters({ ...filters, processing_status: e.target.value })}>
          <option value="">Any processing stage</option>
          {['COLLECTED', 'PROCESSING', 'QUARANTINE', 'RELEASED', 'REJECTED'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
        <Select value={filters.sample_type} onChange={(e) => setFilters({ ...filters, sample_type: e.target.value })}>
          <option value="">Any type</option>
          {['CORD_BLOOD', 'BONE_MARROW', 'PBSC'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </Select>
      </div>

      <Card>
        {!rows ? <Skeleton rows={6} /> : (
          <Table
            rows={rows.map((s) => ({ ...s, id: s.sample_id }))}
            onRowClick={(s) => navigate(`/samples/${s.sample_id}`)}
            empty="No unit matches these filters."
            columns={[
              { key: 'sample_id', header: 'Unit', render: (s) => <strong className="num">#{s.sample_id}</strong> },
              { key: 'sample_type', header: 'Type', render: (s) => (<><div>{label(s.sample_type)}</div><div className="t-sub">{s.volume_ml} ml · CD34 {s.cd34_count ?? '—'}</div></>) },
              { key: 'donor_name', header: 'Donor', render: (s) => (<><div>{s.donor_name}</div><div className="t-sub">{s.blood_group}</div></>) },
              { key: 'processing_status', header: 'Processing', render: (s) => <Badge value={s.processing_status} /> },
              { key: 'availability_status', header: 'Availability', render: (s) => <Badge value={s.availability_status} /> },
              { key: 'hospital_name', header: 'Stored at', render: (s) => (s.hospital_name ? <>{s.hospital_name}<div className="t-sub">{s.location_code} · {s.storage_position}</div></> : '—') },
              { key: 'expiry_date', header: 'Expiry', render: (s) => (s.expiry_date
                ? <>{fmtDate(s.expiry_date)}{s.days_to_expiry <= 60 && s.availability_status === 'AVAILABLE'
                    ? <div><Badge tone={s.days_to_expiry <= 7 ? 'red' : 'amber'}>{s.days_to_expiry} days</Badge></div> : null}</>
                : <span className="t-sub">no fixed expiry</span>) },
            ]}
          />
        )}
      </Card>
    </>
  );
}
