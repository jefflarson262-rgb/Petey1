import { useSyncExternalStore } from 'react';
import { approve, close, edit, generate, getSnapshot, preview, removeReplay, setUnknownsOk, subscribe } from '../reenact/store.js';
import { LIMITS } from '../shared/storyboard.js';

// The Safety Admin's screen for a reenactment: draft it from the incident record, correct the wording, watch it, then approve it.
// Crews only ever see what was approved here.
export default function ReenactDialog() {
  const s = useSyncExternalStore(subscribe, getSnapshot);
  if (!s.open) return null;
  const d = s.draft;
  const live = !!(s.entry && s.entry.reenactment && s.entry.reenactment.status === 'approved');
  const busy = s.busy || s.phase === 'drafting';

  return (
    <div className="auth-overlay plans-overlay" role="dialog" aria-modal="true" aria-labelledby="rx-dlg-title" onKeyDown={(e) => e.key === 'Escape' && !busy && close()}>
      <div className="plans-card rx-dlg">
        <div className="plans-head">
          <h2 id="rx-dlg-title" className="display plans-title">Incident reenactment</h2>
          <button type="button" className="plans-close" onClick={close} aria-label="Close" disabled={busy}>✕</button>
        </div>
        <p className="auth-notice"><strong>{s.entry && s.entry.title}</strong><br />A simple animated storyboard drawn from the written record. It is an illustration, not video footage. Crews see it only after you approve it.</p>
        {s.error && <p className="auth-error" role="alert">{s.error}</p>}

        {s.phase === 'start' && (
          <div className="rx-actions">
            <p className="auth-text">The AI will draft the scenes from this record only. It may not know every detail, so you review and correct everything before it goes live.</p>
            <button type="button" className="plans-open rx-btn" onClick={generate}>Draft the reenactment</button>
          </div>
        )}

        {s.phase === 'drafting' && <p className="auth-text" role="status">Drafting from the incident record… this can take up to a minute.</p>}

        {s.phase === 'insufficient' && (
          <div className="rx-actions">
            <p className="auth-text" role="status"><strong>No reenactment drafted.</strong> {s.reason}</p>
            <p className="auth-text">Nothing was drawn, so nothing wrong can be shown to crews.</p>
            <button type="button" className="plans-open rx-btn" onClick={generate}>Try again</button>
          </div>
        )}

        {s.phase === 'review' && d && (
          <div>
            <label className="rx-label" htmlFor="rx-title">Title</label>
            <input id="rx-title" className="settings-input" maxLength={LIMITS.title} value={d.title} onChange={(e) => edit((x) => { x.title = e.target.value; })} />

            <h3 className="alert-heading">Scenes (what the crew will read)</h3>
            <ol className="rx-beats">
              {d.beats.map((b, i) => (
                <li key={i} className="rx-beat">
                  <span className={`rx-phase ${b.phase}`}>{b.phase === 'happened' ? 'What happened' : 'With controls'}</span>
                  <input aria-label={`Scene ${i + 1} line 1`} className="settings-input" maxLength={LIMITS.line} value={b.caption[0]} onChange={(e) => edit((x) => { x.beats[i].caption[0] = e.target.value; })} />
                  <input aria-label={`Scene ${i + 1} line 2`} className="settings-input" maxLength={LIMITS.line} value={b.caption[1]} onChange={(e) => edit((x) => { x.beats[i].caption[1] = e.target.value; })} />
                </li>
              ))}
            </ol>

            {d.controls.length > 0 && <h3 className="alert-heading">Controls shown at the end</h3>}
            <ul className="rx-beats">
              {d.controls.map((c, i) => (
                <li key={i} className="rx-beat">
                  <input aria-label={`Control ${i + 1}`} className="settings-input" maxLength={LIMITS.control} value={c.short} onChange={(e) => edit((x) => { x.controls[i].short = e.target.value; })} />
                  <input aria-label={`Control ${i + 1} detail`} className="settings-input" maxLength={LIMITS.controlFull} value={c.full} onChange={(e) => edit((x) => { x.controls[i].full = e.target.value; })} />
                </li>
              ))}
            </ul>

            <label className="rx-label" htmlFor="rx-note">Note under the replay (optional)</label>
            <textarea id="rx-note" className="settings-input" rows={2} maxLength={LIMITS.note} value={d.note} onChange={(e) => edit((x) => { x.note = e.target.value; })} />

            {d.unknowns.length > 0 && (
              <div className="rx-unknowns">
                <h3 className="alert-heading">What the record does not say</h3>
                <ul>{d.unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul>
                <label className="rx-check"><input type="checkbox" checked={s.unknownsOk} onChange={(e) => setUnknownsOk(e.target.checked)} /> I have checked the replay against the record. Anything listed above is not shown as fact.</label>
              </div>
            )}

            <div className="rx-actions rx-row">
              <button type="button" className="plans-open rx-btn" onClick={preview} disabled={busy}>▶ Watch preview</button>
              <button type="button" className="plans-open rx-btn rx-primary" onClick={approve} disabled={busy}>{s.busy ? 'Saving…' : live ? 'Save changes & keep live' : 'Approve & publish to crews'}</button>
            </div>
            <div className="rx-actions rx-row rx-minor">
              <button type="button" className="plans-link" onClick={generate} disabled={busy}>Draft again from the record (replaces your edits)</button>
              {live && <button type="button" className="plans-link" onClick={removeReplay} disabled={busy}>Take reenactment down</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
