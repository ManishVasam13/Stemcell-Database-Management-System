import { useState } from 'react';
import { useAuth } from '../auth';
import { Field, Input } from '../components/ui';

const DEMO = [
  ['Administrator', 'admin'],
  ['Bank staff', 'staff.kavya'],
  ['Doctor', 'dr.ananya'],
  ['Donor', 'donor.karthik'],
  ['Patient', 'patient.meena'],
];

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-art">
        <div>
          <div className="brand" style={{ padding: 0 }}>
            <div className="brand-mark">SV</div>
            <div>
              <div className="brand-name">StemVault</div>
              <div className="brand-sub">Stem cell bank management</div>
            </div>
          </div>
          <h1 style={{ marginTop: 34 }}>Every donated unit, traced from consent to transplant.</h1>
          <p style={{ marginTop: 14 }}>
            StemVault keeps cord blood, bone marrow and peripheral blood units searchable across
            hospitals. When a doctor raises a request, the registry looks in the patient's own
            district first, then the state, then the rest of India.
          </p>
        </div>
        <div className="flow">
          {['Donor consent', 'Collection and testing', 'Cryogenic storage', 'Matching and allocation', 'Transplant and follow-up']
            .map((step, i) => (
              <div className="flow-step" key={step}><span className="i">{i + 1}</span>{step}</div>
            ))}
        </div>
      </div>

      <div className="login-form">
        <div className="login-box">
          <h2>Sign in</h2>
          <p className="t-sub" style={{ marginTop: 4, marginBottom: 18 }}>Use the account given to you by the bank administrator.</p>
          {error && <div className="error-bar">{error}</div>}
          <form onSubmit={submit}>
            <Field label="Username">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
              {busy ? 'Signing in' : 'Sign in'}
            </button>
          </form>
          <p className="t-sub" style={{ marginTop: 18, marginBottom: 0 }}>Demo accounts (password StemVault@123):</p>
          <div className="demo-chips">
            {DEMO.map(([role, name]) => (
              <button type="button" key={name} className="chip"
                onClick={() => { setUsername(name); setPassword('StemVault@123'); }}>
                {role}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
