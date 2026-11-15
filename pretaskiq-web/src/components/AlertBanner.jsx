import { useEffect, useSyncExternalStore } from 'react';
import { dismissFresh, getSnapshot, openDialog, subscribe } from '../alerts/store.js';

// Safety administrators: a banner when a new alert arrives while the app is open. It stays until dismissed or opened.
export default function AlertBanner() {
  const s = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => { if (s.fresh.length) { try { navigator.vibrate && navigator.vibrate(200); } catch { /* not supported */ } } }, [s.fresh.length]);
  if (!s.fresh.length || s.dialogOpen) return null;
  const a = s.fresh[0];
  return (
    <div className="alert-banner" role="alert">
      <div className="alert-banner-body">
        <div className="alert-banner-title">🚩 New hazard alert{s.fresh.length > 1 ? ` (${s.fresh.length})` : ''}</div>
        <div className="alert-banner-text">{a.hazard}{a.raised_by_name ? ` — ${a.raised_by_name}` : ''}</div>
      </div>
      <button type="button" className="alert-banner-open" onClick={openDialog}>View</button>
      <button type="button" className="alert-banner-x" onClick={dismissFresh} aria-label="Dismiss">✕</button>
    </div>
  );
}
