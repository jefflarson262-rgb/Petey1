import { useState, useSyncExternalStore } from 'react';
import { getSnapshot, retryAuth, signIn, signOut, subscribe } from '../auth/session.js';
import Landing from './Landing.jsx';
import '../styles/auth.css';

function SignInForm({ notice, onBack }) {
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
      {onBack && <button type="button" className="auth-back" id="signin-back" onClick={onBack}>← Back to the home page</button>}
    </form>
  );
}

export default function AuthGate() {
  const auth = useSyncExternalStore(subscribe, getSnapshot);
  // Visitors who are not signed in see the public home page first. "Log in" (or a link ending in ?login) shows the sign-in form;
  // so does a notice, such as "your session ended", so the person is not sent back to the start.
  const [wantsLogin, setWantsLogin] = useState(() => { try { return new URLSearchParams(window.location.search).has('login'); } catch { return false; } });
  if (auth.phase === 'signed_in' && auth.company && auth.company.status !== 'active') {
    return (
      <div className="auth-overlay"><div className="auth-card" role="alert">
        <div className="auth-brand">PreTaskIQ</div>
        <h1 className="display auth-title">License not active</h1>
        <p className="auth-text">The license for {auth.company.name} is not active right now. Contact your company administrator or PreTaskIQ.</p>
        <button className="auth-submit" type="button" onClick={signOut}>Sign out</button>
      </div></div>
    );
  }
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
    if (!wantsLogin && !auth.notice) return <Landing onLogin={() => setWantsLogin(true)} />;
    body = <SignInForm notice={auth.notice} onBack={() => setWantsLogin(false)} />;
  }
  return <div className="auth-overlay">{body}</div>;
}
