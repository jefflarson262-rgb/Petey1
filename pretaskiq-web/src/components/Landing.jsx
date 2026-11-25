import { useEffect, useState } from 'react';
import { demoMailto } from '../shared/site.js';
import '../styles/landing.css';

// The public front page, shown to visitors who are not signed in. Everything on it describes what the app does today:
// the pictures are real screens, and there are no statistics or promises beyond that.
const I = (d) => <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const FEATURES = [
  { t: 'Smart Work Planning', i: I(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6v3H9zM8.5 11l2 2 4-4M8.5 17h7" /></>) },
  { t: 'Hazards Caught Early', i: I(<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.01" /></>) },
  { t: 'Field-Ready Answers', i: I(<path d="M13 2L4 14h7l-1 8 9-12h-7z" />) },
  { t: 'Built for Your Crew', i: I(<><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.2c3-.6 6 1.5 6 4.8" /></>) },
];
const BENEFITS = [
  { t: 'Build Safer Plans', d: 'Talk through the day’s work. Petey asks the questions a safety pro would and writes the pre-task plan.' },
  { t: 'Identify Hazards', d: 'Petey flags high-risk activities, checks the controls, and draws on your own incidents and policies.' },
  { t: 'Work From Current Documents', d: 'Job folders hold drawings, RFIs, permits and 811 tickets. Petey confirms the crew is on the latest revision.' },
  { t: 'Empower Your Crew', d: 'Every crew member signs the plan on the phone, and Petey stays on through the shift for questions.' },
];
const STEPS = [
  { n: 1, t: 'Tell Petey the plan', d: 'Say or type the day’s tasks, the way you would at the tailgate.', img: '/demo/intake_typed.jpg', alt: 'The foreman screen, where the day’s tasks are typed or spoken to Petey' },
  { n: 2, t: 'Answer a few questions', d: 'Petey asks about the hazards that matter for that work and what controls are in place.', img: '/demo/conversation.jpg', alt: 'Petey asking a foreman about people working below overhead cutting' },
  { n: 3, t: 'Review, sign and start', d: 'The plan is written for you. The crew signs, you submit, and safety sees it right away.', img: '/demo/doc_top.jpg', alt: 'A finished job hazard analysis ready to be submitted' },
];

export default function Landing({ onLogin }) {
  const [video, setVideo] = useState(false);
  const mail = demoMailto();
  useEffect(() => {
    if (!video) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setVideo(false); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [video]);
  const demoBtn = (cls) => (mail ? <a className={cls} href={mail} data-lp-demo>Request a Demo <span aria-hidden="true">›</span></a> : null);
  return (
    <div className="lp" id="landing">
      <header className="lp-nav">
        <img className="lp-logo" src="/logo-wordmark-light.png" alt="PreTaskIQ" />
        <nav className="lp-links" aria-label="Site">
          <a href="#lp-how">How It Works</a>
        </nav>
        <div className="lp-nav-btns">
          <button type="button" className="lp-btn lp-ghost" id="lp-login" onClick={onLogin}>Log in</button>
          {demoBtn('lp-btn lp-solid lp-nav-demo')}
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-sky" aria-hidden="true" />
        <div className="lp-hero-text">
          <div className="lp-eyebrow"><i /><i />Construction safety, simplified</div>
          <h1 className="lp-h1">The AI Safety Companion <em>for the Construction Industry.</em></h1>
          <p className="lp-sub">Plan safer work, identify hazards, and keep your crews aligned, with Petey, your AI-powered safety partner.</p>
          <ul className="lp-features">{FEATURES.map((f) => <li key={f.t}><span>{f.i}</span>{f.t}</li>)}</ul>
          <div className="lp-cta">
            {demoBtn('lp-btn lp-solid lp-big')}
            <button type="button" className={`lp-btn lp-big ${mail ? 'lp-outline' : 'lp-solid'}`} id="lp-video" onClick={() => setVideo(true)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>See How It Works
            </button>
          </div>
        </div>
        <div className="lp-hero-art">
          <div className="lp-phone lp-phone-back"><img src="/demo/dash.jpg" alt="The safety administrator's Site Overview screen" loading="lazy" /></div>
          <div className="lp-phone"><img src="/demo/intake_typed.jpg" alt="The foreman's planning screen with Petey" /></div>
          <img className="lp-petey" src="/petey-full.png" alt="Petey, the PreTaskIQ safety companion" />
        </div>
      </section>

      <section className="lp-benefits" aria-label="What PreTaskIQ does">
        {BENEFITS.map((b) => <div key={b.t}><h3>{b.t}</h3><p>{b.d}</p></div>)}
      </section>

      <section className="lp-how" id="lp-how">
        <div className="lp-eyebrow"><i /><i />How it works</div>
        <h2 className="lp-h2">From tailgate talk to a signed plan</h2>
        <ol className="lp-steps">{STEPS.map((s) => (
          <li key={s.n}>
            <div className="lp-phone lp-phone-sm"><img src={s.img} alt={s.alt} loading="lazy" /></div>
            <div className="lp-step-text"><span className="lp-num">{s.n}</span><h3>{s.t}</h3><p>{s.d}</p></div>
          </li>))}
        </ol>
        <div className="lp-cta lp-cta-center">
          <button type="button" className="lp-btn lp-outline lp-big" onClick={() => setVideo(true)}>Watch the overview video</button>
          {demoBtn('lp-btn lp-solid lp-big')}
        </div>
      </section>

      <footer className="lp-foot">
        <span>© {new Date().getFullYear()} PreTaskIQ · Beta</span>
        <span>Petey supports your safety process. He does not replace your competent person, your policies or the law.</span>
        <button type="button" className="lp-link" onClick={onLogin}>Log in</button>
      </footer>

      {video && (
        <div className="lp-video" role="dialog" aria-modal="true" aria-label="PreTaskIQ overview video" onClick={(e) => { if (e.target === e.currentTarget) setVideo(false); }}>
          <div className="lp-video-box">
            <button type="button" className="lp-video-x" onClick={() => setVideo(false)} aria-label="Close the video">✕</button>
            <video src="/promo.mp4" controls autoPlay playsInline />
          </div>
        </div>
      )}
    </div>
  );
}
