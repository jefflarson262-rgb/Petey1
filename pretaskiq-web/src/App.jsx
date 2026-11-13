import { memo, useEffect, useRef, useSyncExternalStore } from 'react';
import { APP_MARKUP } from './markup/index.js';
import AccessCodeDialog from './components/AccessCodeDialog.jsx';
import AuthGate from './components/AuthGate.jsx';
import AccountMenu from './components/AccountMenu.jsx';
import SaveStatus from './components/SaveStatus.jsx';
import { allowedViews, getSnapshot, initAuth, subscribe } from './auth/session.js';

// The prototype's screens are plain HTML that its own scripts manage (they rewrite parts of it constantly).
// React must therefore render this markup once and never touch it again, hence memo() with no props.
const PrototypeMarkup = memo(function PrototypeMarkup() {
  return <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: APP_MARKUP }} />;
});

// The prototype's scripts start a moment after React draws; wait for them if we are early.
function whenLegacyReady(fn) {
  let tries = 0;
  const attempt = () => { if (window.PreTaskIQ && window.PreTaskIQ.startApp) fn(); else if (tries++ < 100) setTimeout(attempt, 50); };
  attempt();
}

export default function App() {
  const auth = useSyncExternalStore(subscribe, getSnapshot);
  const startedFor = useRef(null);

  useEffect(() => { initAuth(); }, []);

  // Open the app on the planning screen once per person. (Signing back in after a timeout is not a new start,
  // so a plan in progress is not thrown away.)
  useEffect(() => {
    if (auth.phase === 'code' && startedFor.current !== 'code') {
      startedFor.current = 'code';
      whenLegacyReady(() => window.PreTaskIQ.startApp({}));
    } else if (auth.phase === 'signed_in' && startedFor.current !== auth.user.id) {
      startedFor.current = auth.user.id;
      const allowed = allowedViews(auth.profile.role);
      whenLegacyReady(() => window.PreTaskIQ.startApp({ allowed }));
    }
  }, [auth.phase, auth.user, auth.profile]);

  return (
    <>
      <PrototypeMarkup />
      <AccessCodeDialog />
      <AccountMenu />
      <SaveStatus />
      <AuthGate />
    </>
  );
}
