import { useEffect, useRef, useState } from 'react';
import { demoMailto } from '../shared/site.js';
import '../styles/landing.css';

// The public front page, shown to visitors who are not signed in. Its job is to explain what PreTaskIQ does and lead safety leaders to
// request a demo. Every claim describes what the app does today; the screens are real screens with sample data, and the example is
// labelled as an illustration.
const ICON = {
  warn: <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.01" /></svg>,
  shield: <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>,
};
// The wrong-breaker example: one past incident, the question Petey asks because of it, and what goes in today's plan.
const FLOW = [
  { key: 'incident', label: 'Past incident', text: 'An electrician was shocked after the crew locked out the wrong breaker.' },
  { key: 'petey', label: 'Petey asks', text: 'Who will verify the correct isolation and absence of voltage at the point of work?' },
  { key: 'plan', label: 'Today’s plan', text: 'The foreman holds the work until a qualified person verifies the isolation and confirms absence of voltage.' },
];
const STEPS = [
  { n: 1, t: 'Tell Petey what the crew is doing', d: 'Said out loud or typed, the way it would be at the morning briefing. No forms to fill in.', img: '/demo/intake_typed.jpg', alt: 'The foreman screen, where the day’s tasks are typed or spoken to Petey' },
  { n: 2, t: 'Review the questions, hazards, and lessons that apply', d: 'Petey asks the follow-up questions a seasoned safety lead would, and raises your own incidents, policies and drawings when they match the work.', img: '/demo/conversation.jpg', alt: 'Petey asking a foreman a follow-up question about the work, drawing on a past incident' },
  { n: 3, t: 'Brief, sign, and submit the plan', d: 'Steps, hazards and controls are written from the conversation. The crew signs on the phone, the foreman submits, and safety sees it right away.', img: '/demo/doc_top.jpg', alt: 'A finished pre-task plan with its high-risk activities, ready to be signed and submitted' },
];
// The feature row under the hero. Each opens its role tab below and scrolls to the matching feature.
const LINKS = [
  { id: 'f-plans', tab: 'foreman', label: 'Pre-Task Plans' },
  { id: 'f-audits', tab: 'safety', label: 'Audits & Observations' },
  { id: 'f-incidents', tab: 'safety', label: 'Incident Reporting & RCA' },
  { id: 'f-jobs', tab: 'construction', label: 'Job Documents' },
  { id: 'f-metrics', tab: 'safety', label: 'Safety Metrics' },
];
// What each role can do, as the app does it today.
const ROLES = [
  { key: 'foreman', label: 'Foreman', img: '/demo/conversation.jpg', alt: 'The foreman talking through the day’s work with Petey',
    intro: 'Describe the work by voice or text with Petey, review and brief the pre-task plan, collect crew signatures, and submit the plan.',
    items: [
      { id: 'f-plans', t: 'Pre-task plans with Petey', d: 'Talk or type through the day’s work. Petey asks follow-up questions and writes the steps, hazards and controls, including the high-risk activities to brief.' },
      { t: 'Brief and sign on the phone', d: 'Review the plan with the crew, collect each signature on the phone, and submit. Changes after submission are tracked as revisions.' },
      { t: 'Petey on through the shift', d: 'Ask Petey a question by voice when the work changes, and update the plan from the same screen.' },
    ] },
  { key: 'safety', label: 'Safety Admin', img: '/demo/dash.jpg', alt: 'The safety administrator’s Site Overview of today’s plans',
    intro: 'Review submitted plans, check whether controls are in place through audits and observations, manage incident reporting and root cause analysis, and track leading indicators.',
    items: [
      { t: 'Review submitted plans', d: 'Site Overview shows today’s plans, which are submitted and signed, and any changed after submission.' },
      { id: 'f-audits', t: 'Audits & observations', d: 'Pass or fail audits with comments and photos, and observations that check whether life-saving controls are really in place.' },
      { id: 'f-incidents', t: 'Incident reporting & RCA', d: 'A quick first report from the field, then a full report and a root cause analysis with Petey. Approved reenactments help crews see what happened.' },
      { id: 'f-metrics', t: 'Safety metrics', d: 'Leading indicators from what crews record every day, by month and by job, with a spreadsheet report to download.' },
    ] },
  { key: 'construction', label: 'Construction Admin', img: '/demo/jobs.jpg', alt: 'A job folder with drawing revisions, permits and 811 tickets',
    intro: 'Give crews access to job folders with drawings, RFIs, revisions, permits, and 811 tickets.',
    items: [
      { id: 'f-jobs', t: 'Job documents', d: 'One folder per job for scope documents, RFIs, drawing revisions, permits and 811 tickets, with the original files kept.' },
      { t: 'Current revisions reach the crew', d: 'When a foreman plans work on a job, Petey uses its documents and checks the crew is working from the current revision.' },
      { t: 'Expiry dates flagged', d: 'Permits and 811 tickets carry the expiry date from the document, and expired or expiring items are flagged.' },
    ] },
];

function Bubble({ children }) {
  return (
    <div className="lp-pv-msg">
      <img className="lp-pv-face" src="/petey-head.png" alt="" aria-hidden="true" />
      <div className="lp-pv-bubble"><span className="lp-pv-who">Petey</span>{children}</div>
    </div>
  );
}

export default function Landing({ onLogin }) {
  const [video, setVideo] = useState(false);
  const [tab, setTab] = useState('foreman');
  const mail = demoMailto();
  const rxRef = useRef(null);
  const tabRefs = useRef({});
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior = reduceMotion ? 'auto' : 'smooth';
  const [rxPlaying, setRxPlaying] = useState(false);
  const playRx = () => { const v = rxRef.current; if (!v) return; v.scrollIntoView({ behavior, block: 'center' }); try { v.currentTime = 0; } catch { /* not loaded yet */ } v.play().catch(() => {}); };
  const toggleRx = () => { const v = rxRef.current; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause(); };
  // Section links scroll inside the page (the page is its own scrolling layer, so a plain #link would not move it on every browser).
  const go = (e, id) => { if (e) e.preventDefault(); const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior, block: 'start' }); };
  const openFeature = (e, link) => {
    e.preventDefault(); setTab(link.tab);
    requestAnimationFrame(() => { const el = document.getElementById(link.id); if (!el) return; el.scrollIntoView({ behavior, block: 'center' }); el.classList.remove('lp-flash'); void el.offsetWidth; el.classList.add('lp-flash'); try { el.focus({ preventScroll: true }); } catch { /* old browser */ } });
  };
  const onTabKey = (e) => {
    const keys = ROLES.map((r) => r.key); const i = keys.indexOf(tab); let n = null;
    if (e.key === 'ArrowRight') n = keys[(i + 1) % keys.length]; else if (e.key === 'ArrowLeft') n = keys[(i - 1 + keys.length) % keys.length];
    else if (e.key === 'Home') n = keys[0]; else if (e.key === 'End') n = keys[keys.length - 1];
    if (n) { e.preventDefault(); setTab(n); const b = tabRefs.current[n]; if (b) b.focus(); }
  };
  useEffect(() => {
    if (!video) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setVideo(false); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [video]);
  // One demo destination for the header, the hero and the closing section. With none configured the buttons are left out.
  const demoBtn = (cls, id) => (mail ? <a className={cls} href={mail} data-lp-demo id={id}>Request a Demo <span aria-hidden="true">›</span></a> : null);
  const walkBtn = (cls, id) => (
    <button type="button" className={cls} id={id} onClick={() => setVideo(true)}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>Watch the Walkthrough
    </button>
  );
  const role = ROLES.find((r) => r.key === tab);
  return (
    <div className="lp" id="landing">
      <a className="lp-skip" href="#lp-main" onClick={(e) => go(e, 'lp-main')}>Skip to content</a>
      <header className="lp-nav">
        <img className="lp-logo" src="/logo-wordmark-light.png" alt="PreTaskIQ" />
        <nav className="lp-links" aria-label="Site">
          <a href="#lp-how" onClick={(e) => go(e, 'lp-how')}>How It Works</a>
          <a href="#lp-features" onClick={(e) => go(e, 'lp-features')}>Features</a>
        </nav>
        <div className="lp-nav-btns">
          <button type="button" className="lp-btn lp-ghost" id="lp-login" onClick={onLogin}>Log in</button>
          {demoBtn('lp-btn lp-solid lp-nav-demo', 'lp-demo-nav')}
        </div>
      </header>

      <main id="lp-main" tabIndex={-1}>
        <section className="lp-hero" aria-labelledby="lp-h1">
          <div className="lp-sky" aria-hidden="true" />
          <div className="lp-hero-text">
            <div className="lp-eyebrow"><i /><i />AI-powered pre-task planning for construction</div>
            <h1 className="lp-h1" id="lp-h1">Build today&rsquo;s plan with <em>yesterday&rsquo;s lessons.</em></h1>
            <p className="lp-sub">Foremen tell Petey what the crew is doing. Petey asks follow-up questions, brings up relevant incidents and corrective actions from your company, and helps build a pre-task plan the crew can brief and sign.</p>
            <div className="lp-cta">
              {demoBtn('lp-btn lp-solid lp-big', 'lp-demo-hero')}
              {walkBtn(`lp-btn lp-big ${mail ? 'lp-outline' : 'lp-solid'}`, 'lp-video')}
            </div>
          </div>
          <figure className="lp-preview" aria-label="Illustrative example of a foreman's planning screen: Petey's question and the resulting entry in today's pre-task plan">
            <div className="lp-pv-bar"><span>Talk to Petey</span><span className="lp-pv-job">Panel LP-2 · Level 3</span></div>
            <div className="lp-pv-grid">
              <div className="lp-pv-chat">
                <div className="lp-pv-me">Replacing breakers in panel LP-2 today. Locking out at the main.</div>
                <Bubble>
                  <span className="lp-pv-tag">From your incident history</span>
                  <p>An electrician was shocked after the crew locked out the wrong breaker. Who will verify the correct isolation and absence of voltage at the point of work?</p>
                </Bubble>
              </div>
              <div className="lp-pv-plan">
                <div className="lp-pv-plan-h">Today&rsquo;s pre-task plan</div>
                <div className="lp-pv-step"><b>Step 2 · Isolate the circuit</b>
                  <div className="lp-pv-row"><span className="lp-pv-k">Hazard</span><span>Contact with energized conductors if the wrong breaker is locked out</span></div>
                  <div className="lp-pv-row lp-pv-hold"><span className="lp-pv-k">Hold point</span><span>The foreman holds the work until a qualified person verifies the isolation and confirms absence of voltage.</span></div>
                </div>
                <div className="lp-pv-sign">Crew signatures · 0 of 4</div>
              </div>
            </div>
            <figcaption>Illustrative example</figcaption>
          </figure>
        </section>

        <nav className="lp-feat-links" aria-label="Features">
          <ul>{LINKS.map((l) => <li key={l.id}><a href={'#' + l.id} onClick={(e) => openFeature(e, l)}>{l.label}</a></li>)}</ul>
        </nav>

        <section className="lp-story" id="lp-rx" aria-labelledby="lp-rx-h">
          <div className="lp-eyebrow"><i /><i />Incident reenactment</div>
          <h2 className="lp-h2" id="lp-rx-h">See how a past incident changes today&rsquo;s plan</h2>
          <ol className="lp-flow lp-flow-row">
            {FLOW.map((f, k) => (
              <li key={f.key} className="lp-flow-item">
                <div className={`lp-flow-card lp-flow-${f.key}`}>
                  <div className="lp-flow-ico">{f.key === 'petey' ? <img src="/petey-head.png" alt="" aria-hidden="true" /> : f.key === 'plan' ? ICON.shield : ICON.warn}</div>
                  <div className="lp-flow-body"><span className="lp-flow-label"><span className="lp-flow-n">{k + 1}</span>{f.label}</span><p>{f.text}</p></div>
                </div>
                {k < FLOW.length - 1 && <div className="lp-flow-arrow" aria-hidden="true">&rarr;</div>}
              </li>
            ))}
          </ol>
          <div className="lp-rx">
            <figure className="lp-rx-video">
              {/* The captions are drawn in the bottom of the picture, so the browser's own control bar (which would cover them) is not used. */}
              <video ref={rxRef} src="/reenactment.mp4" poster="/reenactment-poster.jpg" muted loop playsInline preload="metadata"
                onClick={toggleRx} onPlay={() => setRxPlaying(true)} onPause={() => setRxPlaying(false)}
                aria-label="Animated reenactment: an electrician is shocked after the wrong breaker was locked out, then the same task with the isolation verified and absence of voltage confirmed" />
              <figcaption>Illustrative example. An animation drawn from an incident record, not video footage.</figcaption>
            </figure>
            <div className="lp-rx-text">
              <button type="button" className="lp-btn lp-solid lp-big lp-rx-play" id="lp-rx-play" onClick={rxPlaying ? toggleRx : playRx}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">{rxPlaying ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}</svg>
                {rxPlaying ? 'Pause the reenactment' : 'Watch the reenactment'}
              </button>
              <p>PreTaskIQ drafts a short animated replay from the written incident record: what happened, then the same task with the corrective actions in place. When Petey raises that lesson, the crew can open the replay from the conversation or the plan.</p>
              <ul>
                <li>Drawn only from what is in the incident record</li>
                <li>Reviewed and approved by a safety administrator before crews see it</li>
                <li>Ready for a toolbox talk or a safety meeting</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="lp-how" id="lp-how" aria-labelledby="lp-how-h">
          <div className="lp-eyebrow"><i /><i />How it works</div>
          <h2 className="lp-h2" id="lp-how-h">From the morning briefing to a signed plan</h2>
          <ol className="lp-steps">{STEPS.map((s) => (
            <li key={s.n}>
              <div className="lp-phone lp-phone-sm"><img src={s.img} alt={s.alt} loading="lazy" /></div>
              <div className="lp-step-text"><span className="lp-num">{s.n}</span><h3>{s.t}</h3><p>{s.d}</p></div>
            </li>))}
          </ol>
        </section>

        <section className="lp-feat-sec" id="lp-features" aria-labelledby="lp-feat-h">
          <div className="lp-eyebrow"><i /><i />Features</div>
          <h2 className="lp-h2" id="lp-feat-h">What your team can do with PreTaskIQ</h2>
          <div className="lp-tabs" role="tablist" aria-label="Roles">
            {ROLES.map((r) => (
              <button key={r.key} type="button" role="tab" id={'lp-tab-' + r.key} aria-controls={'lp-panel-' + r.key} aria-selected={tab === r.key} tabIndex={tab === r.key ? 0 : -1}
                ref={(el) => { tabRefs.current[r.key] = el; }} onClick={() => setTab(r.key)} onKeyDown={onTabKey} className="lp-tab">{r.label}</button>
            ))}
          </div>
          <div className="lp-panel" role="tabpanel" id={'lp-panel-' + role.key} aria-labelledby={'lp-tab-' + role.key}>
            <div className="lp-phone lp-phone-sm lp-panel-shot"><img src={role.img} alt={role.alt} loading="lazy" /></div>
            <div className="lp-panel-text">
              <p className="lp-panel-intro">{role.intro}</p>
              <ul className="lp-feat-list">{role.items.map((it) => (
                <li key={it.t} id={it.id} tabIndex={it.id ? -1 : undefined}><h3>{it.t}</h3><p>{it.d}</p></li>))}
              </ul>
              <p className="lp-panel-note">Real screens, sample data.</p>
            </div>
          </div>
        </section>

        <section className="lp-final" id="lp-demo" aria-labelledby="lp-final-h">
          <h2 className="lp-h2" id="lp-final-h">See PreTaskIQ on one of your scopes</h2>
          <p>Bring a scope your crews perform regularly. We&rsquo;ll walk through how a foreman builds a plan with Petey and what your safety team sees after it&rsquo;s submitted.</p>
          <div className="lp-cta lp-cta-center">{mail ? demoBtn('lp-btn lp-solid lp-big', 'lp-demo-final') : walkBtn('lp-btn lp-solid lp-big', 'lp-video-final')}</div>
        </section>
      </main>

      <footer className="lp-foot">
        <span>© {new Date().getFullYear()} PreTaskIQ · Beta</span>
        <span>Petey supports your safety process. He does not replace your competent person, your policies or the law.</span>
        <button type="button" className="lp-link" onClick={onLogin}>Log in</button>
      </footer>

      {video && (
        <div className="lp-video" role="dialog" aria-modal="true" aria-label="PreTaskIQ walkthrough video" onClick={(e) => { if (e.target === e.currentTarget) setVideo(false); }}>
          <div className="lp-video-box">
            <button type="button" className="lp-video-x" onClick={() => setVideo(false)} aria-label="Close the video" autoFocus>✕</button>
            <video src="/promo.mp4" controls autoPlay playsInline />
          </div>
        </div>
      )}
    </div>
  );
}
