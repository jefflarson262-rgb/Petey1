import { useEffect, useRef, useState } from 'react';
import { demoMailto } from '../shared/site.js';
import '../styles/landing.css';

// The public front page, shown to visitors who are not signed in. Its job is to explain what PreTaskIQ does and lead safety leaders to
// request a demo. Every claim describes what the app does today; the screens are real screens with sample data, and the example is
// labelled as an illustration.
const ICON = {
  warn: <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.01" /></svg>,
  doc: <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4h6v3H9z" /><path d="M15 5h3v16H6V5h3" /><path d="M9 11h6M9 15h6M9 19h3" /></svg>,
  talk: <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H10l-5 4v-4H4z" /><path d="M8 9h8M8 12h5" /></svg>,
  shield: <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>,
};
// The wrong-breaker example: the safety admin records the lesson, a foreman describes similar work,
// Petey recalls the lesson and asks about it, and the answer goes in today's plan.
const FLOW = [
  { key: 'admin', label: 'Safety admin logs the lesson', text: 'An electrician was shocked after the crew locked out the wrong breaker. Root cause: the breaker labels were never checked against the panel schedule.' },
  { key: 'foreman', label: 'Foreman describes today\u2019s work', text: 'We\u2019re locking out the panel in Room 112 and pulling new wire to it.' },
  { key: 'petey', label: 'Petey recalls the lesson', text: 'Who will verify the correct isolation and absence of voltage at the point of work?' },
  { key: 'plan', label: 'Today\u2019s plan', text: 'The foreman holds the work until a qualified person verifies the isolation and confirms absence of voltage.' },
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
// Petey beyond the morning briefing: who asks him what, and what he draws on. The questions are illustrations.
const ASK = [
  { who: 'Foreman, mid-shift', q: 'We\u2019re moving the lift to the north side after lunch. What changes in the plan?', a: 'Petey works through the new hazards with the crew and updates the plan from the same screen.' },
  { who: 'Safety professional', q: 'What does our fall protection policy require for tie-off on the scissor lift?', a: 'Petey answers from the policy you uploaded and says which document it came from.' },
];
const SOURCES = [
  { t: 'Your company\u2019s policies and procedures', d: 'Whatever your safety team uploads to the knowledge base.' },
  { t: 'Your incident history', d: 'Past incidents, near misses, root cause analyses and the corrective actions that came out of them.' },
  { t: 'Owner and customer requirements', d: 'Upload them as policies, or file them in a job\u2019s folder so they apply on that job.' },
  { t: 'Job documents', d: 'Scope documents, RFIs, drawing revisions, permits and 811 tickets for the job the crew is on.' },
  { t: 'Construction standards', d: 'The OSHA, NFPA and ANSI standards that apply to construction work.' },
];

// What each role can do, as the app does it today.
const ROLES = [
  { key: 'foreman', label: 'Foreman', img: '/demo/conversation.jpg', alt: 'The foreman talking through the day’s work with Petey',
    intro: 'Describe the work by voice or text with Petey, review and brief the pre-task plan, collect crew signatures, and submit the plan.',
    items: [
      { id: 'f-plans', t: 'Pre-task plans with Petey', d: 'Talk or type through the day’s work. Petey asks follow-up questions and writes the steps, hazards and controls, including the high-risk activities to brief.' },
      { t: 'Brief and sign on the phone', d: 'Review the plan with the crew, collect each signature on the phone, and submit. Changes after submission are tracked as revisions.' },
      { t: 'Petey on through the shift', d: 'Talk to Petey by voice when the work changes, and update the plan from the same screen.', q: ASK[0].q },
    ] },
  { key: 'safety', label: 'Safety Admin', img: '/demo/dash.jpg', alt: 'The safety administrator’s Site Overview of today’s plans',
    intro: 'Review submitted plans, check whether controls are in place through audits and observations, manage incident reporting and root cause analysis, and track leading indicators.',
    items: [
      { t: 'Ask Petey', d: 'Ask by voice about a policy, a procedure, a regulation or a pattern in your incidents, and see which source the answer comes from.', q: ASK[1].q },
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

// The closing example: a few common tasks, each a short scripted exchange (not a live AI call). The incidents are fictional and labelled so.
const EXAMPLES = [
  { key: 'trench', label: 'Trench for a water line',
    foreman: 'Digging a trench for a water service line on the east side today.',
    lesson: 'Last spring a laborer was partly buried when a trench wall caved in. The spoil pile was right at the edge.',
    ask: 'How deep will you go, and what protective system will you use?',
    reply: 'About 6 feet. We have a trench box on site.',
    step: 'Excavate and set the trench box', hazard: 'Cave-in and soil falling from the spoil pile',
    controls: ['Trench box in place before anyone enters', 'Spoil kept at least 2 feet back from the edge', 'Competent person inspects the trench before each shift', 'Ladder within 25 feet of anyone in the trench'] },
  { key: 'crane', label: 'Set rooftop units with a crane',
    foreman: 'Setting two rooftop units with the crane this morning.',
    lesson: 'We had a near miss when a tag line slipped and a load swung toward a worker standing under it.',
    ask: 'Who will keep people out from under the load during each pick?',
    reply: 'Our signal person, plus a spotter at the barricade.',
    step: 'Rig and lift each unit', hazard: 'Struck by a swinging or falling load',
    controls: ['Barricade the swing radius and fall zone', 'Nobody under a suspended load', 'Tag lines on every pick', 'One qualified signal person in charge of the lift'] },
  { key: 'bolts', label: 'Cut overhead bolts from a ladder',
    foreman: 'Cutting old anchor bolts overhead from a ladder in Bay 4.',
    lesson: 'A worker standing below was hit in the eye by a metal fragment from overhead bolt cutting.',
    ask: 'Will anyone be working or walking below you while you cut?',
    reply: 'My helper hands me tools from below.',
    step: 'Cut the bolts overhead', hazard: 'Flying fragments striking people below',
    controls: ['Exclusion zone marked below the work', 'Helper stays outside the zone while cutting is under way', 'Face shield over safety glasses for anyone who must enter', 'Tools passed up between cuts, not during'] },
];

function TryExample() {
  const [pick, setPick] = useState(EXAMPLES[0].key);
  const [shown, setShown] = useState(0);
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ex = EXAMPLES.find((e) => e.key === pick);
  const TOTAL = 4;
  useEffect(() => {
    if (reduce) { setShown(TOTAL); return undefined; }
    setShown(1);
    const timers = [2, 3, 4].map((n, i) => setTimeout(() => setShown(n), 900 * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [pick, reduce]);
  return (
    <div className="lp-try-box">
      <div className="lp-try-picks" role="group" aria-label="Pick a task">
        {EXAMPLES.map((e) => <button key={e.key} type="button" className="lp-try-pick" aria-pressed={pick === e.key} onClick={() => setPick(e.key)}>{e.label}</button>)}
      </div>
      <div className="lp-try-grid" aria-live="polite">
        <div className="lp-pv-chat lp-try-chat">
          <div className="lp-pv-me"><span className="lp-pv-who lp-pv-who-me">Foreman</span>{ex.foreman}</div>
          {shown >= 2 && <Bubble><span className="lp-pv-tag">Past incident · fictional</span><p>{ex.lesson} {ex.ask}</p></Bubble>}
          {shown >= 3 && <div className="lp-pv-me"><span className="lp-pv-who lp-pv-who-me">Foreman</span>{ex.reply}</div>}
          {shown < TOTAL && <div className="lp-try-typing" aria-hidden="true"><span /><span /><span /></div>}
        </div>
        <div className={`lp-pv-plan lp-try-plan${shown >= TOTAL ? ' lp-try-on' : ''}`}>
          <div className="lp-pv-plan-h">Today&rsquo;s pre-task plan</div>
          {shown >= TOTAL ? (
            <div className="lp-pv-step"><b>{ex.step}</b>
              <div className="lp-pv-row"><span className="lp-pv-k">Hazard</span><span>{ex.hazard}</span></div>
              <div className="lp-pv-row lp-pv-hold"><span className="lp-pv-k">Controls</span><ul className="lp-try-ctl">{ex.controls.map((c) => <li key={c}>{c}</li>)}</ul></div>
            </div>
          ) : <p className="lp-try-wait">The plan fills in from the conversation&hellip;</p>}
        </div>
      </div>
      <p className="lp-try-note">A short scripted example, not a live conversation. The incidents are fictional. In the app, Petey asks more questions and the plan covers every step of the task.</p>
    </div>
  );
}

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
            <p className="lp-sub">Foremen describe the scope of work and the tasks their crews will perform. Petey asks follow-up questions, brings up relevant incidents and corrective actions from your company, and helps turn the conversation into a pre-task plan the crew can brief and sign.</p>
            <div className="lp-cta">
              {demoBtn('lp-btn lp-solid lp-big', 'lp-demo-hero')}
              {walkBtn(`lp-btn lp-big ${mail ? 'lp-outline' : 'lp-solid'}`, 'lp-video')}
            </div>
          </div>
          <figure className="lp-preview lp-try lp-hero-try" aria-labelledby="lp-hero-try-h">
            <div className="lp-hero-try-head">
              <h2 id="lp-hero-try-h">See a sample pre-task plan</h2>
              <p>Choose a task to follow the conversation and see the plan take shape.</p>
            </div>
            <TryExample />
          </figure>
        </section>

        <nav className="lp-feat-links" aria-label="Features">
          <ul>{LINKS.map((l) => <li key={l.id}><a href={'#' + l.id} onClick={(e) => openFeature(e, l)}>{l.label}</a></li>)}</ul>
        </nav>

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

        <section className="lp-story" id="lp-rx" aria-labelledby="lp-rx-h">
          <div className="lp-eyebrow"><i /><i />Incident reenactment</div>
          <h2 className="lp-h2" id="lp-rx-h">Replay a past incident before the crew starts</h2>
          <ol className="lp-flow lp-flow-row">
            {FLOW.map((f, k) => (
              <li key={f.key} className="lp-flow-item">
                <div className={`lp-flow-card lp-flow-${f.key}`}>
                  <div className="lp-flow-ico">{f.key === 'petey' ? <img src="/petey-head.png" alt="" aria-hidden="true" /> : f.key === 'plan' ? ICON.shield : f.key === 'foreman' ? ICON.talk : ICON.doc}</div>
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
                <li key={it.t} id={it.id} tabIndex={it.id ? -1 : undefined}><h3>{it.t}</h3><p>{it.d}</p>{it.q && <p className="lp-feat-q">Example: &ldquo;{it.q}&rdquo;</p>}</li>))}
              </ul>
              <p className="lp-panel-note">Real screens, sample data.</p>
            </div>
          </div>
          <div className="lp-src">
            <h3>What Petey draws on</h3>
            <ul>{SOURCES.map((x) => <li key={x.t}><b>{x.t}</b><span>{x.d}</span></li>)}</ul>
            <p className="lp-src-note">Petey&rsquo;s references to OSHA, NFPA and ANSI standards come from the AI&rsquo;s general knowledge, not a stored copy of the regulations. Check them against the current standard before relying on a specific requirement.</p>
          </div>
          <p className="lp-ask-ill">Example questions are illustrative.</p>
        </section>

        {mail && (
          <section className="lp-final" id="lp-demo" aria-labelledby="lp-final-h">
            <h2 className="lp-h2" id="lp-final-h">See Petey on your jobs</h2>
            <p>We&rsquo;ll walk you through a pre-task plan built from your own tasks and lessons.</p>
            <div className="lp-cta lp-cta-center">{demoBtn('lp-btn lp-solid lp-big', 'lp-demo-final')}</div>
          </section>
        )}
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
