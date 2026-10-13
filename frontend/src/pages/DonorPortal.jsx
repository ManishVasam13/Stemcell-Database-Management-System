import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Card, Kpi, Loading, Modal, Table, fmtDate, label, useToast } from '../components/ui';

const WHAT_HAPPENED = {
  NOT_AVAILABLE: 'Held in storage, not offered for matching right now',
  AVAILABLE: 'In storage and offered to patients who match you',
  ALLOCATED: 'Reserved for a patient who matched you',
  TRANSPLANTED: 'Used in a transplant. Thank you.',
  EXPIRED: 'Past its storage life',
  DISCARDED: 'Discarded after testing',
};

export default function DonorPortal() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const load = () => api.get('/portal/donor').then(setData).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, []);
  if (!data) return <Loading what="Loading your donation record" />;

  const { donor, samples, consents } = data;
  const active = consents.filter((c) => c.status === 'ACTIVE');

  async function revoke(consent) {
    try {
      const r = await api.post(`/consents/${consent.consent_id}/revoke`, { reason: 'Revoked by donor from the portal' });
      toast(r.message);
      setRevoking(null);
      await load();
    } catch (e) { toast(e.message, true); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Thank you, {donor.full_name.split(' ')[0]}</h1>
          <p>Here is what happened to what you donated. Patient details are never shared with donors.</p>
        </div>
        <Badge value={donor.status} />
      </div>

      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <Kpi label="Units you donated" value={samples.length} note={`registered ${fmtDate(donor.registration_date)}`} />
        <Kpi label="Units used in a transplant" value={samples.filter((s) => s.availability_status === 'TRANSPLANTED').length} />
        <Kpi label="Active consents" value={active.length} note="you can withdraw at any time" />
      </div>

      <Card title="Your donations">
        <Table
          rows={samples.map((s) => ({ ...s, id: s.sample_id }))}
          empty="Nothing has been collected yet."
          columns={[
            { key: 'sample_id', header: 'Unit', render: (s) => <span className="num">#{s.sample_id}</span> },
            { key: 'sample_type', header: 'Type', render: (s) => label(s.sample_type) },
            { key: 'collection_date', header: 'Collected', render: (s) => fmtDate(s.collection_date) },
            { key: 'availability_status', header: 'Where it stands', render: (s) => (
              <><Badge value={s.availability_status} /><div className="t-sub">{WHAT_HAPPENED[s.availability_status]}</div></>) },
          ]}
        />
      </Card>

      <Card title="Your consent" className="">
        <Table
          rows={consents.map((c) => ({ ...c, id: c.consent_id }))}
          empty="No consent on record."
          columns={[
            { key: 'consent_type', header: 'Permission', render: (c) => label(c.consent_type) },
            { key: 'consent_date', header: 'Given', render: (c) => fmtDate(c.consent_date) },
            { key: 'valid_until', header: 'Valid until', render: (c) => (c.valid_until ? fmtDate(c.valid_until) : 'no expiry') },
            { key: 'status', header: 'Status', render: (c) => <Badge value={c.status} /> },
            { key: 'actions', header: '', render: (c) => (c.status === 'ACTIVE'
              ? <button className="btn btn-sm" onClick={() => setRevoking(c)}>Withdraw</button> : null) },
          ]}
        />
        <p className="t-sub" style={{ marginBottom: 0 }}>
          Withdrawing storage or clinical-use consent takes your units out of matching immediately. Units already used in a
          transplant cannot be taken back.
        </p>
      </Card>

      {revoking && (
        <Modal title={`Withdraw ${label(revoking.consent_type).toLowerCase()} consent`} onClose={() => setRevoking(null)}
          footer={<><button className="btn" onClick={() => setRevoking(null)}>Keep my consent</button>
            <button className="btn btn-danger" onClick={() => revoke(revoking)}>Withdraw consent</button></>}>
          <p>Your units stop being offered to patients as soon as you confirm. You can give consent again later by contacting the bank.</p>
        </Modal>
      )}
    </>
  );
}
