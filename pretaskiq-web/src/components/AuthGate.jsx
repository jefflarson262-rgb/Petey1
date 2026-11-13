import { useState, useSyncExternalStore } from 'react';
import { getSnapshot, retryAuth, signIn, subscribe } from '../auth/session.js';
import '../styles/auth.css';

function SignInForm({ notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true); setError('');
    try { await signIn(email, password); }
    catch (err) { setError(err.message || 'Could not sign in.'); }
    finally { setBusy(false); }
  };

  return (
    <form className="auth-card" onSubmit={onSubmit}>
      <div className="auth-brand">PreTaskIQ</div>
      <h1 className="display auth-title">Sign in</h1>
      <p className="auth-text">Use the email and password your administrator set up for you.</p>
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      <label className="auth-label" htmlFor="signin-email">Email</label>
      <input id="signin-email" className="auth-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="auth-label" htmlFor="signin-password">Password</label>
      <input id="signin-password" className="auth-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button id="signin-submit" className="auth-submit" type="submit" disabled={busy || !email.trim() || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}

export default function AuthGate() {
  const auth = useSyncExternalStore(subscribe, getSnapshot);
  if (auth.phase === 'signed_in' || auth.phase === 'code') return null;

  let body;
  if (auth.phase === 'loading') {
    body = <div className="auth-card auth-loading" role="status"><div className="auth-brand">PreTaskIQ</div><p className="auth-text">Loading…</p></div>;
  } else if (auth.phase === 'misconfigured') {
    body = (
      <div className="auth-card">
        <div className="auth-brand">PreTaskIQ</div>
        <h1 className="display auth-title">Sign-in is not set up yet</h1>
        <p className="auth-text">The server has only some of the Supabase settings it needs.</p>
        {auth.missing.length > 0 && <p className="auth-text">Missing: <strong>{auth.missing.join(', ')}</strong></p>}
        {auth.problem && <p className="auth-text">{auth.problem}</p>}
        <p className="auth-text">Open <a href="/api/health">/api/health</a> to see the full checklist.</p>
      </div>
    );
  } else if (auth.phase === 'error') {
    body = (
      <div className="auth-card">
        <div className="auth-brand">PreTaskIQ</div>
        <h1 className="display auth-title">Something is not working</h1>
        <p className="auth-error" role="alert">{auth.error}</p>
        <button className="auth-submit" type="button" onClick={retryAuth}>Try again</button>
      </div>
    );
  } else {
    body = <SignInForm notice={auth.notice} />;
  }
  return <div className="auth-overlay">{body}</div>;
}
