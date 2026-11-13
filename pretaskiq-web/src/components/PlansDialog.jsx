import { useEffect, useState, useSyncExternalStore } from 'react';
import { getSnapshot as auth, subscribe as subscribeAuth } from '../auth/session.js';
import { getPlan, getRevisions, listPlans } from '../plans/store.js';

const SOURCE_LABEL = { planning: 'Created from the planning conversation', petey_update: 'Petey updated it mid-shift', edit: 'Edited by hand' };
const when = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };

export default function PlansDialog({ onClose }) {
  const me = useSyncExternalStore(subscribeAuth, auth);
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState('');
  const [openingId, setOpeningId] = useState('');
  const [history, setHistory] = useState({});      // plan id -> { loading, rows, error }

  const load = () => { setError(''); setPlans(null); listPlans().then(setPlans).catch((e) => setError(e.message)); };
  useEffect(load, []);

  const open = async (id) => {
    setOpeningId(id); setError('');
    try { const plan = await getPlan(id); window.PreTaskIQ.openPlan(plan); onClose(); }
    catch (e) { setError(e.message); setOpeningId(''); }
  };
  const toggleHistory = async (id) => {
    if (history[id] && !history[id].error) { setHistory((h) => { const n = { ...h }; delete n[id]; return n; }); return; }
    setHistory((h) => ({ ...h, [id]: { loading: true } }));
    try { const rows = await getRevisions(id); setHistory((h) => ({ ...h, [id]: { rows } })); }
    catch (e) { setHistory((h) => ({ ...h, [id]: { error: e.message } })); }
  };

  return (
    <div className="auth-overlay plans-overlay" role="dialog" aria-modal="true" aria-labelledby="plans-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="plans-card">
        <div className="plans-head">
          <h2 id="plans-title" className="display plans-title">{me.profile?.role === 'foreman' ? 'My plans' : 'Saved plans'}</h2>
          <button type="button" className="plans-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <p className="auth-error" role="alert">{error} {plans === null && <button type="button" className="plans-link" onClick={load}>Try again</button>}</p>}
        {plans === null && !error && <p className="auth-text">Loading…</p>}
        {plans && plans.length === 0 && <p className="auth-text">No saved plans yet. A plan is saved the moment Petey finishes writing it.</p>}
        <ul className="plans-list">
          {(plans || []).map((p) => (
            <li key={p.id} className="plans-row">
              <div className="plans-main">
                <div className="plans-name">{p.title}</div>
                <div className="plans-meta">
                  Revision {p.current_revision} · updated {when(p.updated_at)}{p.created_by !== me.user?.id && p.owner_name ? ` · by ${p.owner_name}` : ''}
                </div>
              </div>
              <div className="plans-actions">
                <button type="button" className="plans-link" onClick={() => toggleHistory(p.id)}>{history[p.id] && !history[p.id].error ? 'Hide history' : 'History'}</button>
                <button type="button" className="plans-open" disabled={openingId === p.id} onClick={() => open(p.id)}>{openingId === p.id ? 'Opening…' : 'Open'}</button>
              </div>
              {history[p.id] && (
                <div className="plans-history">
                  {history[p.id].loading && 'Loading history…'}
                  {history[p.id].error && history[p.id].error}
                  {history[p.id].rows && history[p.id].rows.length === 0 && 'No history recorded.'}
                  {history[p.id].rows && history[p.id].rows.map((r) => (
                    <div key={r.revision} className="plans-rev"><strong>Rev {r.revision}</strong> · {SOURCE_LABEL[r.source] || r.source} · {when(r.created_at)}{r.note ? <div className="plans-note">“{r.note}”</div> : null}</div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
