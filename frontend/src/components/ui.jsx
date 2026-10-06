import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* ---------- status colours: one vocabulary across the whole app ---------- */
const TONES = {
  ACTIVE: 'green', OPERATIONAL: 'green', AVAILABLE: 'green', APPROVED: 'green', PASSED: 'green',
  COMPLETED: 'green', ENGRAFTED: 'green',
  PENDING: 'amber', QUARANTINE: 'amber', PROCESSING: 'amber', COLLECTED: 'amber', MAINTENANCE: 'amber',
  ON_LEAVE: 'amber', SCHEDULED: 'teal', ALLOCATED: 'teal', RELEASED: 'teal', CANDIDATE: 'teal',
  URGENT: 'amber', CRITICAL: 'red', ROUTINE: '',
  REJECTED: 'red', FAILED: 'red', DISCARDED: 'red', EXPIRED: 'red', SUSPENDED: 'red', LOCKED: 'red',
  GRAFT_FAILURE: 'red', COMPLICATIONS: 'amber', WITHDRAWN: 'red', DECEASED: 'red',
  SAME_DISTRICT: 'green', SAME_STATE: 'teal', NATIONAL: 'violet',
};
const LABELS = {
  SAME_DISTRICT: 'Same district', SAME_STATE: 'Same state', NATIONAL: 'Anywhere in India',
  NOT_AVAILABLE: 'Not available', GRAFT_FAILURE: 'Graft failure', CORD_BLOOD: 'Cord blood',
  BONE_MARROW: 'Bone marrow', PBSC: 'PBSC', ULT_FREEZER: 'Ultra-low freezer',
  LN2_LIQUID: 'Liquid nitrogen', LN2_VAPOUR: 'Nitrogen vapour', BANK_STAFF: 'Bank staff',
  HLA_TYPING: 'HLA typing', INFECTIOUS_SCREEN: 'Infectious screen', CD34_COUNT: 'CD34 count',
  CLINICAL_USE: 'Clinical use',
};
export const label = (v) => (v == null ? '' : LABELS[v] || String(v).charAt(0) + String(v).slice(1).toLowerCase().replace(/_/g, ' '));

export function Badge({ value, children, tone }) {
  const t = tone ?? TONES[value] ?? '';
  return <span className={`badge ${t}`}>{children ?? label(value)}</span>;
}

export function Card({ title, action, children, footer, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          <h3>{title}</h3>
          {action}
        </div>
      )}
      <div className="card-body">{children}</div>
      {footer}
    </section>
  );
}

/** counts up to a number when it first appears; text values pass through */
export function AnimatedNumber({ value, duration = 900 }) {
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.]/g, ''));
  const suffix = typeof value === 'string' ? String(value).replace(/[0-9.,]/g, '') : '';
  const [shown, setShown] = useState(0);
  const frame = useRef();

  useEffect(() => {
    if (!Number.isFinite(numeric)) return undefined;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(numeric);
      return undefined;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(numeric * (1 - (1 - t) ** 3));      // ease-out cubic
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [numeric, duration]);

  if (!Number.isFinite(numeric)) return <>{value}</>;
  const decimals = String(numeric).includes('.') ? 1 : 0;
  return <>{Number(shown).toFixed(decimals)}{suffix}</>;
}

export function Kpi({ label: l, value, note, tone }) {
  return (
    <div className={`kpi ${tone || ''}`}>
      <div className="kpi-label">{l}</div>
      <div className="kpi-value num"><AnimatedNumber value={value} /></div>
      {note && <div className="kpi-note">{note}</div>}
    </div>
  );
}

export function Field({ label: l, children }) {
  return (
    <div className="field">
      <label>{l}</label>
      {children}
    </div>
  );
}

export function Input(props) { return <input className="input" {...props} />; }
export function Select({ children, ...props }) { return <select className="input" {...props}>{children}</select>; }

export function Table({ columns, rows, onRowClick, empty = 'Nothing here yet' }) {
  if (!rows?.length) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className={onRowClick ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Loading({ what = 'Loading' }) {
  return <div className="loading"><span className="spinner" /> {what}…</div>;
}

/** shimmering placeholder rows while a table loads */
export function Skeleton({ rows = 5 }) {
  return (
    <div style={{ padding: 6 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 8px' }}>
          <div className="skeleton" style={{ width: `${18 + (i % 3) * 8}%` }} />
          <div className="skeleton" style={{ width: '26%' }} />
          <div className="skeleton" style={{ width: '18%' }} />
          <div className="skeleton" style={{ flex: 1 }} />
        </div>
      ))}
    </div>
  );
}

/* ---------- toasts ---------- */
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, bad = false) => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s, { id, message, bad }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack">
        {items.map((t) => <div key={t.id} className={`toast ${t.bad ? 'bad' : ''}`}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------- HLA match: six alleles (A, B, DRB1 x2) ---------- */
export function HlaDots({ score, max = 6, showLabel = true }) {
  const n = Number(score ?? 0);
  return (
    <span className="hla">
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}
      {showLabel && <span className="hla-label num">{n}/{max}</span>}
    </span>
  );
}

export const fmtDate = (d) => (d ? new Date(String(d).replace(' ', 'T')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(String(d).replace(' ', 'T')).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
