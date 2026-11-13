import { useEffect, useState, useSyncExternalStore } from 'react';
import { getSnapshot, retrySave, subscribe } from '../plans/store.js';

// A small pill, bottom left: "Saving…", "Saved" (for a few seconds), or what went wrong.
export default function SaveStatus() {
  const s = useSyncExternalStore(subscribe, getSnapshot);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (s.status !== 'saved') { setFresh(false); return undefined; }
    setFresh(true);
    const t = setTimeout(() => setFresh(false), 4000);
    return () => clearTimeout(t);
  }, [s.status, s.savedAt]);

  if (s.status === 'saving') return <div className="save-pill" role="status">Saving…</div>;
  if (s.status === 'error') {
    return (
      <div className="save-pill save-error" role="alert">
        <span>Not saved: {s.error}</span>
        {s.canRetry && <button type="button" onClick={retrySave}>Try again</button>}
      </div>
    );
  }
  if (s.status === 'saved' && fresh) return <div className="save-pill save-ok" role="status">Saved · revision {s.revision}</div>;
  return null;
}
