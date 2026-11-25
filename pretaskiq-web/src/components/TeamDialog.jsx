import { useState, useSyncExternalStore } from 'react';
import { addMember, closeTeam, getSnapshot, setActive, subscribe } from '../company/store.js';

const ROLES = [['foreman', 'Foreman'], ['safety', 'Safety Admin'], ['construction', 'Construction Admin']];
const roleLabel = (r) => (ROLES.find((x) => x[0] === r) || [r, r])[1];

// Shows a new account's temporary password once. It cannot be looked up again.
function Created({ made, onDone }) {
  return (
    <div className="team-created" role="status">
      <strong>{made.member.email} was added.</strong>
      <p className="auth-text">Give them this temporary password now. It is shown only once and cannot be looked up later:</p>
      <code className="team-pw" id="team-temp-password">{made.temporaryPassword}</code>
      <button type="button" className="plans-open" onClick={onDone}>Done</button>
    </div>
  );
}

// Company administrators: see the team and seats used, add people, switch people off or on.
export default function TeamDialog() {
  const s = useSyncExternalStore(subscribe, getSnapshot);
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [role, setRole] = useState('foreman');
  const [made, setMade] = useState(null);
  if (!s.teamOpen) return null;
  const t = s.team;
  const full = t && t.company.seatLimit != null && t.seatsUsed >= t.company.seatLimit;

  const add = async (e) => {
    e.preventDefault();
    const r = await addMember({ email, displayName: name, role });
    if (r.ok) { setMade(r.out); setEmail(''); setName(''); setRole('foreman'); }
  };

  return (
    <div className="auth-overlay plans-overlay" role="dialog" aria-modal="true" aria-labelledby="team-title" onKeyDown={(e) => e.key === 'Escape' && closeTeam()}>
      <div className="plans-card">
        <div className="plans-head">
          <h2 id="team-title" className="display plans-title">Team and access</h2>
          <button type="button" className="plans-close" onClick={closeTeam} aria-label="Close">✕</button>
        </div>
        {s.error && <p className="auth-error" role="alert">{s.error}</p>}
        {!t && !s.error && <p className="auth-text">Loading…</p>}
        {t && (
          <>
            <p className="auth-text" id="team-seats"><strong>{t.company.name}</strong> · {t.company.tier} license · {t.seatsUsed} of {t.company.seatLimit == null ? 'unlimited' : t.company.seatLimit} seats used</p>
            {made && <Created made={made} onDone={() => setMade(null)} />}
            <ul className="plans-list">
              {t.members.map((m) => (
                <li key={m.id} className="alert-row">
                  <div className="alert-main">
                    <div className="alert-hazard">{m.displayName || m.email}</div>
                    <div className="alert-meta">{m.email} · {roleLabel(m.role)}{m.active ? '' : ' · switched off'}</div>
                  </div>
                  <button type="button" className="plans-open" disabled={s.busy} onClick={() => setActive(m.id, !m.active)}>{m.active ? 'Switch off' : 'Switch on'}</button>
                </li>
              ))}
            </ul>
            <h3 className="alert-heading">Add a person</h3>
            {full ? <p className="auth-notice">All seats are in use. Switch someone off, or ask for more seats.</p> : (
              <form onSubmit={add}>
                <label className="auth-label" htmlFor="team-email">Email</label>
                <input id="team-email" className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <label className="auth-label" htmlFor="team-name">Name</label>
                <input id="team-name" className="auth-input" value={name} onChange={(e) => setName(e.target.value)} />
                <label className="auth-label" htmlFor="team-role">Role</label>
                <select id="team-role" className="auth-input" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <button id="team-add" className="auth-submit" type="submit" disabled={s.busy || !email.trim()}>{s.busy ? 'Adding…' : 'Add person'}</button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
