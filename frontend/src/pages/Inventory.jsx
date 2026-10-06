import { useEffect, useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { Card, Loading, Select, Table, fmtDate, label, useToast } from '../components/ui';

/** Doctor-facing view of the national inventory. Donor identity is never shown. */
export default function Inventory() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [geo, setGeo] = useState({});
  const [filters, setFilters] = useState({ sample_type: '', state: user.state || '', district: '', blood_group: '' });

  useEffect(() => { api.get('/meta/geo').then(setGeo).catch(() => {}); }, []);
  useEffect(() => { api.get(`/samples/available${qs(filters)}`).then(setData).catch((e) => toast(e.message, true)); },
    [filters.sample_type, filters.state, filters.district, filters.blood_group]);

  const districts = geo[filters.state] || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Find a unit</h1>
          <p>Units released for clinical use across the registry. Compatibility is decided per patient, so raise a request to see HLA matching.</p>
        </div>
      </div>

      <div className="filters">
        <Select value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value, district: '' })}>
          <option value="">Any state</option>
          {Object.keys(geo).map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={filters.district} onChange={(e) => setFilters({ ...filters, district: e.target.value })} disabled={!filters.state}>
          <option value="">Any district</option>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
        <Select value={filters.sample_type} onChange={(e) => setFilters({ ...filters, sample_type: e.target.value })}>
          <option value="">Any unit type</option>
          {['CORD_BLOOD', 'BONE_MARROW', 'PBSC'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </Select>
        <Select value={filters.blood_group} onChange={(e) => setFilters({ ...filters, blood_group: e.target.value })}>
          <option value="">Any blood group</option>
          {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((b) => <option key={b} value={b}>{b}</option>)}
        </Select>
      </div>

      {!data ? <Loading what="Loading inventory" /> : (
        <>
          <Card title={`${data.rows.length} unit(s) match these filters`}>
            <Table
              rows={data.rows.map((s) => ({ ...s, id: s.sample_id }))}
              empty="No unit matches. Try a wider area or another unit type."
              columns={[
                { key: 'sample_id', header: 'Unit', render: (s) => <span className="num">#{s.sample_id}</span> },
                { key: 'sample_type', header: 'Type', render: (s) => label(s.sample_type) },
                { key: 'blood_group', header: 'Blood group' },
                { key: 'cd34_count', header: 'CD34', render: (s) => <span className="num">{s.cd34_count ?? '—'}</span> },
                { key: 'hospital_name', header: 'Stored at', render: (s) => (<><div>{s.hospital_name}</div><div className="t-sub">{s.district}, {s.state}</div></>) },
                { key: 'collection_date', header: 'Collected', render: (s) => fmtDate(s.collection_date) },
                { key: 'expiry_date', header: 'Expires', render: (s) => (s.expiry_date ? fmtDate(s.expiry_date) : 'no fixed expiry') },
              ]}
            />
          </Card>

          <Card title="Units by district" className="">
            <Table
              rows={data.summary.map((s, i) => ({ ...s, id: i }))}
              empty="Nothing in store."
              columns={[
                { key: 'state', header: 'State' },
                { key: 'district', header: 'District' },
                { key: 'sample_type', header: 'Type', render: (s) => label(s.sample_type) },
                { key: 'units', header: 'Units', render: (s) => <span className="num">{s.units}</span> },
              ]}
            />
          </Card>
        </>
      )}
    </>
  );
}
