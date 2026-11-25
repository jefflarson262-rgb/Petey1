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
        {c.usage && (
          <div className="alert-meta co-usage">
            Last 30 days: {c.usage.aiRequests.toLocaleString()} request{c.usage.aiRequests === 1 ? '' : 's'} to Petey
            {c.usage.aiRequests > 0 && <> ({c.usage.inputTokens.toLocaleString()} tokens in, {c.usage.outputTokens.toLocaleString()} out)</>}
            {' · '}{c.usage.speechChars.toLocaleString()} characters spoken{' · '}{(Math.round(c.usage.transcribeSeconds / 6) / 10).toLocaleString()} min transcribed
          </div>
        )}
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
  const [t, setT] = useState({ email: '', name: '' });
  if (!s.companiesOpen) return null;
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const create = async (e) => {
    e.preventDefault();
    const r = await createCompany({ name: f.name, tier: f.tier, seatLimit: f.seats.trim() === '' ? null : Number(f.seats), admin: { email: f.email, displayName: f.adminName } });
    if (r.ok) { setMade(r.out); setF({ name: '', tier: 'basic', seats: '', email: '', adminName: '' }); }
  };
  // A tester gets a practice company of their own (every feature, one seat) as its administrator, so they can try all three views
  // without seeing or changing anyone's real data.
  const addTester = async (e) => {
    e.preventDefault();
    const who = t.name.trim() || t.email.trim();
    const r = await createCompany({ name: ('Tester: ' + who).slice(0, 120), tier: 'full', seatLimit: 1, admin: { email: t.email, displayName: t.name } });
    if (r.ok) { setMade({ ...r.out, tester: true }); setT({ email: '', name: '' }); }
  };
  return (
    <div className="auth-overlay plans-overlay" role="dialog" aria-modal="true" aria-labelledby="cos-title" onKeyDown={(e) => e.key === 'Escape' && closeCompanies()}>
      <div className="plans-card">
        <div className="plans-head">
          <h2 id="cos-title" className="display plans-title">Testers and companies</h2>
          <button type="button" className="plans-close" onClick={closeCompanies} aria-label="Close">✕</button>
        </div>
        {s.error && <p className="auth-error" role="alert">{s.error}</p>}
        {made && (
          <div className="team-created" role="status">
            <strong>{made.tester ? `${made.admin.email} can now sign in as a tester, in a practice company of their own.` : `${made.company.name} was created. Its administrator is ${made.admin.email}.`}</strong>
            <p className="auth-text">Give them this temporary password now. It is shown only once:</p>
            <code className="team-pw" id="co-temp-password">{made.temporaryPassword}</code>
            <button type="button" className="plans-open" onClick={() => setMade(null)}>Done</button>
          </div>
        )}
        <h3 className="alert-heading">Add a tester</h3>
        <p className="auth-text">A tester sees all three views and every feature, in a practice company of their own. Your data stays separate.</p>
        <form onSubmit={addTester}>
          <label className="auth-label" htmlFor="tester-email">Tester's email</label>
          <input id="tester-email" className="auth-input" type="email" value={t.email} onChange={(e) => setT({ ...t, email: e.target.value })} />
          <label className="auth-label" htmlFor="tester-name">Tester's name</label>
          <input id="tester-name" className="auth-input" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
          <button id="tester-add" className="auth-submit" type="submit" disabled={s.busy || !t.email.trim()}>{s.busy ? 'Adding…' : 'Add tester'}</button>
        </form>
        <h3 className="alert-heading">Companies</h3>
        <p className="auth-text">Usage is what each company cost you to serve: multiply the tokens, characters and minutes by the rates on your Anthropic and ElevenLabs bills.</p>
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
