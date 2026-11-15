import { useEffect, useSyncExternalStore } from 'react';
import { getSnapshot as auth, subscribe as subscribeAuth } from '../auth/session.js';
import { acknowledge, closeDialog, getSnapshot, refresh, subscribe } from '../alerts/store.js';

const when = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };

// The safety inbox. A safety administrator sees every alert and can acknowledge it; everyone else sees only the alerts they raised, and whether someone has seen them.
export default function AlertsDialog() {
  const me = useSyncExternalStore(subscribeAuth, auth);
  const s = useSyncExternalStore(subscribe, getSnapshot);
  const safety = me.profile?.role === 'safety';
  useEffect(() => { if (s.dialogOpen) refresh(); }, [s.dialogOpen]);
  if (!s.dialogOpen) return null;

  const open = s.alerts.filter((a) => a.status === 'open');
  const done = s.alerts.filter((a) => a.status !== 'open');
  const row = (a) => (
    <li key={a.id} className={`alert-row${a.status === 'open' ? ' is-open' : ''}`}>
      <div className="alert-main">
        <div className="alert-hazard">{a.hazard}</div>
        <div className="alert-meta">
          {a.job ? <>{a.job} · </> : null}{a.context ? <>{a.context} · </> : null}{safety && a.raised_by_name ? <>raised by {a.raised_by_name} · </> : null}{when(a.created_at)}
        </div>
        {a.status !== 'open' && <div className="alert-ack">✓ Seen by {a.acknowledged_by_name || 'a safety administrator'}{a.acknowledged_at ? ` · ${when(a.acknowledged_at)}` : ''}</div>}
        {a.status === 'open' && !safety && <div className="alert-wait">Waiting for a safety administrator to open it. Tell them directly if it can't wait.</div>}
      </div>
      {safety && a.status === 'open' && <button type="button" className="plans-open alert-seen" onClick={() => acknowledge(a.id)}>Mark as seen</button>}
    </li>
  );

  return (
    <div className="auth-overlay plans-overlay" role="dialog" aria-modal="true" aria-labelledby="alerts-title" onKeyDown={(e) => e.key === 'Escape' && closeDialog()}>
      <div className="plans-card">
        <div className="plans-head">
          <h2 id="alerts-title" className="display plans-title">{safety ? 'Safety alerts' : 'Hazards I flagged'}</h2>
          <button type="button" className="plans-close" onClick={closeDialog} aria-label="Close">✕</button>
        </div>
        <p className="auth-notice">Alerts show here while the app is open. Nothing is emailed or texted, so for anything urgent, call or tell the person directly.</p>
        {s.error && <p className="auth-error" role="alert">{s.error} <button type="button" className="plans-link" onClick={refresh}>Try again</button></p>}
        {!s.loaded && !s.error && <p className="auth-text">Loading…</p>}
        {s.loaded && s.alerts.length === 0 && <p className="auth-text">{safety ? 'No alerts yet.' : 'You have not flagged any hazards.'}</p>}
        {open.length > 0 && <h3 className="alert-heading">Waiting ({open.length})</h3>}
        <ul className="plans-list">{open.map(row)}</ul>
        {done.length > 0 && <h3 className="alert-heading">Seen</h3>}
        <ul className="plans-list">{done.map(row)}</ul>
      </div>
    </div>
  );
}
