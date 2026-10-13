import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { label } from './ui';

const NAV = {
  ADMIN: [
    ['Overview', '/'],
    ['Requests', '/requests'],
    ['Transplants', '/transplants'],
    ['Samples', '/samples'],
    ['Donors', '/donors'],
    ['Patients', '/patients'],
    ['Storage', '/storage'],
    ['Hospitals', '/hospitals'],
    ['Doctors', '/doctors'],
    ['Accounts', '/users'],
    ['Activity log', '/audit'],
  ],
  BANK_STAFF: [
    ['Overview', '/'],
    ['Requests', '/requests'],
    ['Transplants', '/transplants'],
    ['Samples', '/samples'],
    ['Donors', '/donors'],
    ['Patients', '/patients'],
    ['Storage', '/storage'],
    ['Hospitals', '/hospitals'],
  ],
  DOCTOR: [
    ['Overview', '/'],
    ['My requests', '/requests'],
    ['Transplants', '/transplants'],
    ['Find a unit', '/inventory'],
    ['Patients', '/patients'],
  ],
  DONOR: [['My donation', '/']],
  PATIENT: [['My transplant', '/']],
};


/* one simple line icon per destination — drawn inline so there is no icon dependency */
const ICONS = {
  Overview: 'M3 12l9-8 9 8M5 10v10h14V10',
  Requests: 'M5 4h11l3 3v13H5zM9 10h6M9 14h6',
  'My requests': 'M5 4h11l3 3v13H5zM9 10h6M9 14h6',
  Transplants: 'M12 20s-7-4.5-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.5-7 9-7 9z',
  Samples: 'M9 3h6M10 3v7L6 19a2 2 0 002 2h8a2 2 0 002-2l-4-9V3',
  Donors: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1',
  Patients: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1',
  Storage: 'M4 6h16v5H4zM4 13h16v5H4zM8 8.5h.01M8 15.5h.01',
  Hospitals: 'M4 21V8l8-5 8 5v13M10 21v-5h4v5M12 9v4M10 11h4',
  Doctors: 'M9 3v5a3 3 0 006 0V3M12 11v4a4 4 0 008 0v-1M8 19a2 2 0 104 0 2 2 0 00-4 0z',
  Accounts: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1',
  'Activity log': 'M4 6h16M4 12h16M4 18h10',
  'Find a unit': 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4.5-4.5',
  'My donation': 'M12 20s-7-4.5-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.5-7 9-7 9z',
  'My transplant': 'M12 20s-7-4.5-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.5-7 9-7 9z',
};

function NavIcon({ name }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] || ICONS.Overview} />
    </svg>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const links = NAV[user.role] || [];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SV</div>
          <div>
            <div className="brand-name">StemVault</div>
            <div className="brand-sub">Stem cell bank</div>
          </div>
        </div>
        <nav>
          {links.map(([text, to]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="nav-label"><NavIcon name={text} />{text}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          {user.hospitalName ? <div>{user.hospitalName}</div> : null}
          <div>{label(user.role)}</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <strong>{user.hospitalName || 'National stem cell registry'}</strong>
          <div className="topbar-user">
            <span>{user.name || user.username}</span>
            <div className="avatar">{(user.name || user.username).slice(0, 1).toUpperCase()}</div>
            <button className="btn btn-sm" onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
          </div>
        </header>
        <div className="page" key={location.pathname}><Outlet /></div>
      </div>
    </div>
  );
}
