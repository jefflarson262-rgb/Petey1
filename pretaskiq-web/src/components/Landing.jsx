import { useEffect, useState } from 'react';
import { demoMailto } from '../shared/site.js';
import '../styles/landing.css';

// The public front page, shown to visitors who are not signed in. Everything on it describes what the app does today:
// the pictures are real screens, and there are no statistics or promises beyond that.
const I = (d) => <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
// The example the page leads with: one past incident, the question Petey asks because of it, and what ends up in today's plan.
// It is an illustration (not a real company's record) and is labelled that way on the page.
const ICON = {
  warn: <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.01" /></svg>,
  shield: <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>,
};
const FLOW = [
  { key: 'incident', label: 'Past incident', text: 'An electrician was shocked after the crew locked out the wrong breaker.' },
  { key: 'petey', label: 'Petey asks', text: 'Who will verify the correct isolation and absence of voltage at the point of work?' },
  { key: 'plan', label: 'Today\u2019s plan', text: 'The foreman holds the work until a qualified person verifies the isolation and confirms absence of voltage.' },
];
const STEPS = [
  { n: 1, t: 'The foreman describes today\u2019s work', d: 'Said out loud or typed, the way it would be at the tailgate. No forms to fill in.', img: '/demo/intake_typed.jpg', alt: 'The foreman screen, where the day\u2019s tasks are typed or spoken to Petey' },
  { n: 2, t: 'Petey brings up what your company already learned', d: 'He asks the follow-up questions a seasoned safety lead would, and raises your own incidents, policies and drawings when they match the work.', img: '/demo/conversation.jpg', alt: 'Petey telling a foreman about a past eye injury from overhead bolt cutting and asking who will be below' },
  { n: 3, t: 'The crew gets a plan they can brief and sign', d: 'Steps, hazards and controls written from the conversation. Everyone signs on the phone, the foreman submits, and safety sees it right away.', img: '/demo/doc_top.jpg', alt: 'A finished pre-task plan with its high-risk activities, ready to be signed and submitted' },
];
// Everything else the product does, shown after the daily workflow is clear.
const DEPTH = [
  { t: 'Audits and observations', d: 'Pass or fail audits with photos, and checks on whether life-saving controls are really in place.' },
  { t: 'Incident reporting', d: 'A two-minute first report from the field, then a full report and root cause analysis with Petey.' },
  { t: 'Current documents', d: 'Job folders for drawings, RFIs, permits and 811 tickets. Petey confirms the crew is on the latest revision.' },
  { t: 'Safety metrics', d: 'Leading indicators from what crews record every day, by month and by job, with a report to download.' },
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
          <div className="lp-eyebrow"><i /><i />The AI safety companion for construction</div>
          <h1 className="lp-h1">Keep lessons learned <em>in the hands of your crew.</em></h1>
          <p className="lp-sub">PreTaskIQ brings your company&rsquo;s past incidents and corrective actions into the pre-task plan your crew briefs and signs.</p>
          <div className="lp-cta">
            {demoBtn('lp-btn lp-solid lp-big')}
            <button type="button" className={`lp-btn lp-big ${mail ? 'lp-outline' : 'lp-solid'}`} id="lp-video" onClick={() => setVideo(true)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>Watch the walkthrough
            </button>
          </div>
        </div>
        <div className="lp-hero-art">
          <figure className="lp-flow" aria-label="Illustrative example: a past incident, the question Petey asks, and what goes in today's plan">
            {FLOW.map((f, k) => (
              <div key={f.key} className="lp-flow-item">
                {k > 0 && <div className="lp-flow-arrow" aria-hidden="true">&darr;</div>}
                <div className={`lp-flow-card lp-flow-${f.key}`}>
                  <div className="lp-flow-ico">{f.key === 'petey' ? <img src="/petey-head.png" alt="" aria-hidden="true" /> : f.key === 'plan' ? ICON.shield : ICON.warn}</div>
                  <div className="lp-flow-body"><span className="lp-flow-label">{f.label}</span><p>{f.text}</p></div>
                </div>
              </div>
            ))}
            <figcaption>Illustrative example</figcaption>
          </figure>
          <img className="lp-petey" src="/petey-full.png" alt="Petey, the PreTaskIQ safety companion" />
        </div>
      </section>

      <section className="lp-how" id="lp-how">
        <div className="lp-eyebrow"><i /><i />How it works</div>
        <h2 className="lp-h2">One conversation, every morning</h2>
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

      <section className="lp-depth" aria-labelledby="lp-depth-h">
        <div className="lp-eyebrow"><i /><i />Once the daily plan is in place</div>
        <h2 className="lp-h2" id="lp-depth-h">The same record does more work</h2>
        <div className="lp-benefits">{DEPTH.map((b) => <div key={b.t}><h3>{b.t}</h3><p>{b.d}</p></div>)}</div>
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
