import { useState, useSyncExternalStore } from 'react';
import { closeCompanies, createCompany, getSnapshot, subscribe, updateCompany } from '../company/store.js';
import { TIERS } from '../shared/licensing.js';

const tierOptions = Object.entries(TIERS).map(([v, t]) => <option key={v} value={v}>{t.label}</option>);

function Row({ c, busy }) {
  const [seats, setSeats] = useState(c.seatLimit == null ? '' : String(c.seatLimit));
  const saveSeats = () => updateCompany(c.id, { seatLimit: seats.trim() === '' ? null : Number(seats) });
  return (
    <li className="alert-row co-row">
      <div className="alert-main">
        <div className="alert-hazard">{c.name}{c.status === 'suspended' ? ' · SUSPENDED' : ''}</div>
        <div className="alert-meta">{c.seatsUsed} seats in use</div>
        <div className="co-controls">
          <select aria-label={`Tier for ${c.name}`} className="auth-input co-small" value={c.tier} disabled={busy} onChange={(e) => updateCompany(c.id, { tier: e.target.value })}>{tierOptions}</select>
          <input aria-label={`Seat limit for ${c.name}`} className="auth-input co-small" inputMode="numeric" placeholder="No limit" value={seats} onChange={(e) => setSeats(e.target.value)} onBlur={saveSeats} />
          <button type="button" className="plans-open" disabled={busy} onClick={() => updateCompany(c.id, { status: c.status === 'active' ? 'suspended' : 'active' })}>{c.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
        </div>
      </div>
    </li>
  );
}

// Platform owner only: every company, its tier, seat limit and status, and a form to create one with its first administrator.
export default function CompaniesDialog() {
  const s = useSyncExternalStore(subscribe, getSnapshot);
  const [f, setF] = useState({ name: '', tier: 'basic', seats: '', email: '', adminName: '' });
  const [made, setMade] = useState(null);
  if (!s.companiesOpen) return null;
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const create = async (e) => {
    e.preventDefault();
    const r = await createCompany({ name: f.name, tier: f.tier, seatLimit: f.seats.trim() === '' ? null : Number(f.seats), admin: { email: f.email, displayName: f.adminName } });
    if (r.ok) { setMade(r.out); setF({ name: '', tier: 'basic', seats: '', email: '', adminName: '' }); }
  };
  return (
    <div className="auth-overlay plans-overlay" role="dialog" aria-modal="true" aria-labelledby="cos-title" onKeyDown={(e) => e.key === 'Escape' && closeCompanies()}>
      <div className="plans-card">
        <div className="plans-head">
          <h2 id="cos-title" className="display plans-title">Companies</h2>
          <button type="button" className="plans-close" onClick={closeCompanies} aria-label="Close">✕</button>
        </div>
        {s.error && <p className="auth-error" role="alert">{s.error}</p>}
        {made && (
          <div className="team-created" role="status">
            <strong>{made.company.name} was created. Its administrator is {made.admin.email}.</strong>
            <p className="auth-text">Give them this temporary password now. It is shown only once:</p>
            <code className="team-pw" id="co-temp-password">{made.temporaryPassword}</code>
            <button type="button" className="plans-open" onClick={() => setMade(null)}>Done</button>
          </div>
        )}
        {!s.companies && !s.error && <p className="auth-text">Loading…</p>}
        <ul className="plans-list">{(s.companies || []).map((c) => <Row key={c.id + c.tier + c.status + c.seatLimit} c={c} busy={s.busy} />)}</ul>
        <h3 className="alert-heading">New company</h3>
        <form onSubmit={create}>
          <label className="auth-label" htmlFor="co-name">Company name</label>
          <input id="co-name" className="auth-input" value={f.name} onChange={up('name')} />
          <label className="auth-label" htmlFor="co-tier">Tier</label>
          <select id="co-tier" className="auth-input" value={f.tier} onChange={up('tier')}>{tierOptions}</select>
          <label className="auth-label" htmlFor="co-seats">Seats (blank = no limit)</label>
          <input id="co-seats" className="auth-input" inputMode="numeric" value={f.seats} onChange={up('seats')} />
          <label className="auth-label" htmlFor="co-admin-email">First administrator's email</label>
          <input id="co-admin-email" className="auth-input" type="email" value={f.email} onChange={up('email')} />
          <label className="auth-label" htmlFor="co-admin-name">First administrator's name</label>
          <input id="co-admin-name" className="auth-input" value={f.adminName} onChange={up('adminName')} />
          <button id="co-create" className="auth-submit" type="submit" disabled={s.busy || !f.name.trim() || !f.email.trim()}>{s.busy ? 'Creating…' : 'Create company'}</button>
        </form>
      </div>
    </div>
  );
}
