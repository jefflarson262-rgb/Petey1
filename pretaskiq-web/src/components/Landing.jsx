import { useEffect, useState } from 'react';
import { demoMailto } from '../shared/site.js';
import '../styles/landing.css';

// The public front page, shown to visitors who are not signed in. Everything on it describes what the app does today:
// the pictures are real screens, and there are no statistics or promises beyond that.
const I = (d) => <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
// The example the page leads with. It is the sample conversation from the app's own demo data (a made-up company's incident history),
// shown as an example and labelled that way.
const STORY = [
  { who: 'foreman', label: 'Foreman', text: 'Cut bolts off the Bay 4 structure from a ladder, then stage the cut sections.' },
  { who: 'petey', label: 'Petey', tag: 'From your company\u2019s incident history', text: 'Heads up: we had a worker hit in the eye by a metal fragment from overhead bolt cutting while standing below in safety glasses. Will anyone be working or walking below you while you cut?' },
  { who: 'foreman', label: 'Foreman', text: 'Yes, my helper will be handing me tools from below.' },
  { who: 'petey', label: 'Petey', text: 'Good to know. Your helper below changes the plan. What face and eye protection will he have on?' },
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
          <h1 className="lp-h1">Your foreman describes the job. <em>Petey remembers what went wrong last time.</em></h1>
          <p className="lp-sub">PreTaskIQ turns the morning talk into a pre-task plan the crew can brief and sign, and brings your company&rsquo;s own lessons into the conversation before the work starts.</p>
          <div className="lp-cta">
            {demoBtn('lp-btn lp-solid lp-big')}
            <button type="button" className={`lp-btn lp-big ${mail ? 'lp-outline' : 'lp-solid'}`} id="lp-video" onClick={() => setVideo(true)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>See How It Works
            </button>
          </div>
        </div>
        <div className="lp-hero-art">
          <figure className="lp-story" aria-label="Example conversation between a foreman and Petey">
            <figcaption>Example · planning a bolt-cutting task</figcaption>
            {STORY.map((m, k) => (
              <div key={k} className={`lp-msg lp-msg-${m.who}`}>
                {m.who === 'petey' && <img className="lp-msg-face" src="/petey-head.png" alt="" aria-hidden="true" />}
                <div className="lp-bubble">
                  <span className="lp-msg-who">{m.label}</span>
                  {m.tag && <span className="lp-msg-tag">{m.tag}</span>}
                  <p>{m.text}</p>
                </div>
              </div>
            ))}
            <div className="lp-story-end"><b>Plan ready to brief and sign</b><span>Steps, hazards and controls, with the helper&rsquo;s face protection written in.</span></div>
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
