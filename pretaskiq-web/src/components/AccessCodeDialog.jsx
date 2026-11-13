import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cancelAccessCode, getSnapshot, submitAccessCode, subscribe } from '../api/accessCode.js';
import '../styles/access-dialog.css';

export default function AccessCodeDialog() {
  const { open, wrong } = useSyncExternalStore(subscribe, getSnapshot);
  const [code, setCode] = useState('');
  const input = useRef(null);

  useEffect(() => { if (open) { setCode(''); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  if (!open) return null;

  const onSubmit = (e) => { e.preventDefault(); if (code.trim()) submitAccessCode(code); };

  return (
    <div className="acd-overlay" role="dialog" aria-modal="true" aria-labelledby="acd-title" onKeyDown={(e) => e.key === 'Escape' && cancelAccessCode()}>
      <form className="acd-card" onSubmit={onSubmit}>
        <h2 id="acd-title" className="display acd-title">Access code needed</h2>
        <p className="acd-text">
          {wrong ? 'That code was not accepted. Try again, or ask whoever shared this link.' : 'Petey’s live AI is limited to people with the access code. Enter it to continue.'}
        </p>
        <input ref={input} className="acd-input" type="password" autoComplete="off" placeholder="Access code" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Access code" />
        <div className="acd-actions">
          <button type="button" className="acd-cancel" onClick={cancelAccessCode}>Not now</button>
          <button type="submit" className="acd-submit" disabled={!code.trim()}>Continue</button>
        </div>
      </form>
    </div>
  );
}
