import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { getSnapshot, signOut, subscribe } from '../auth/session.js';
import PlansDialog from './PlansDialog.jsx';
import { getSnapshot as alertsSnapshot, openCount, openDialog as openAlerts, subscribe as subscribeAlerts } from '../alerts/store.js';

const ROLE_LABEL = { foreman: 'Foreman', safety: 'Safety Admin', construction: 'Construction Admin' };

// Lives in the top bar (the empty #account-slot in the prototype's markup). With an account: name, My plans, the overview video, Sign out.
// With the old shared-code mode there is no account, so it offers just the overview video.
export default function AccountMenu() {
  const auth = useSyncExternalStore(subscribe, getSnapshot);
  const alerts = useSyncExternalStore(subscribeAlerts, alertsSnapshot);
  const [slot, setSlot] = useState(null);
  const [open, setOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => { setSlot(document.getElementById('account-slot')); }, []);
  // The "My Plans" tile on the foreman home screen asks for the same dialog
  useEffect(() => {
    const openPlans = () => setPlansOpen(true);
    window.addEventListener('pretaskiq:open-plans', openPlans);
    return () => window.removeEventListener('pretaskiq:open-plans', openPlans);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const signedIn = auth.phase === 'signed_in';
  if (!slot || !(signedIn || auth.phase === 'code')) return null;

  const video = () => { setOpen(false); window.open('/promo.mp4', '_blank', 'noopener'); };
  const isSafety = signedIn && auth.profile.role === 'safety';
  const waiting = isSafety ? openCount(alerts) : 0;
  const name = signedIn ? (auth.profile.displayName || auth.user.email || 'Account') : 'Menu';

  return (
    <>
      {createPortal(
        <div className="acct" ref={wrap}>
          <button type="button" className="acct-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <span className="acct-name">{name}</span>
            {waiting > 0 && <span className="acct-badge" aria-label={`${waiting} safety alerts waiting`}>{waiting}</span>}
            <span className="acct-caret">▾</span>
          </button>
          {open && (
            <div className="acct-menu" role="menu">
              {signedIn && <div className="acct-who"><div>{auth.user.email}</div><div className="acct-role">{ROLE_LABEL[auth.profile.role] || auth.profile.role}</div></div>}
              {signedIn && <button type="button" role="menuitem" className="acct-item" onClick={() => { setOpen(false); openAlerts(); }}>{isSafety ? `Safety alerts${waiting ? ` (${waiting})` : ''}` : 'Hazards I flagged'}</button>}
              {signedIn && <button type="button" role="menuitem" className="acct-item" onClick={() => { setOpen(false); setPlansOpen(true); }}>My plans</button>}
              <button type="button" role="menuitem" className="acct-item" onClick={video}>Watch the overview video</button>
              {signedIn && <button type="button" role="menuitem" className="acct-item acct-signout" onClick={signOut}>Sign out</button>}
            </div>
          )}
        </div>,
        slot,
      )}
      {plansOpen && signedIn && <PlansDialog onClose={() => setPlansOpen(false)} />}
    </>
  );
}
