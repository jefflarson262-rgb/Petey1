# PreTaskIQ web app

PreTaskIQ (Petey, the pre-task hazard analysis companion) as a Vite + React project you can put online.

**This version adds the pilot foundation ("stage 1"):**

- **Real sign-in.** Only people you create accounts for can use the app. Three roles: Foreman, Construction Admin, Safety Admin. The roles are enforced on the server, not just hidden in the page.
- **Saved plans with history.** Every plan Petey writes is saved. Hand edits and Petey's mid-shift updates are saved as new revisions of the same plan. "My plans" in the top bar lists them and opens them again.
- **The site opens on planning,** not the guided demo. The demo is still there: account menu > Guided demo, or add `?demo` to the address.
- **Talking with Petey (first version).** The morning planning conversation can be spoken: Petey reads each question aloud, listens for the answer, shows what he heard, and sends it after a short pause. The mid-shift companion screen has a "Tap and talk" button. See section 3.
- **A per-person limit on AI requests** (150 per hour by default), so one lost password cannot quietly run up your Anthropic bill.

Everything else (screens, Petey's planning interview, STKY, the knowledge base, RCA assistant, reenactments) is the prototype, moved over, not rewritten.

**Not tested against the real services.** All testing was done against stand-ins for Supabase, Anthropic and Vercel. Expect one round of fixing small things on the first real setup. Details are under "What was and wasn't checked".

---

## 1. Setting it up (first time, in this order)

You need accounts with **GitHub**, **Vercel**, **Anthropic** (for the API key) and **Supabase** (the database and sign-in). Do not paste any key or password into a chat, an email or a GitHub file. Keys go only into Vercel's Environment Variables screen.

The screen and button names below come from Supabase's and Vercel's documentation as I found it, plus a few from community posts. Where I could only confirm a name from a community post, it says so. Their dashboards change, so if a name does not match, look for the closest one and check the current docs.

### A. Put the code on GitHub and Vercel

1. Create a new **private** GitHub repository and upload the contents of this folder, **keeping the folders** (`api`, `server`, `src`, `supabase` and so on). Do not upload `node_modules`, `dist` or any `.env` file.
2. In Vercel choose *Add New > Project* and pick the repository. It should detect Vite. If it asks: build command `npm run build`, output directory `dist`.

### B. Create the Supabase project

1. In Supabase, create a new project. You choose the region and a database password when you create it; keep that password somewhere safe (a password manager). This app does not need it.
2. **Upgrade the organization to Pro** if this will be used on real jobs. Supabase's pricing page lists Pro from $25 per month (check the current price). On the Free plan, projects pause after a week of inactivity and there are no automatic backups, which is a poor fit for a safety tool.
3. Open **SQL Editor**, start a new query, paste the whole contents of `supabase/setup.sql`, and run it. It is safe to run twice. It creates four tables (profiles, plans, plan_revisions, ai_usage) and locks them so that the browser's key can read nothing; only your server functions can.

### C. Turn off public sign-ups

Supabase's docs describe a setting named **"Allow new users to sign up"**: "If this config is disabled, only existing users can sign in." Their page links it to the dashboard's Auth providers page but does not give a menu path, so look in the Authentication section for it and turn it **off**. Without this, anyone who finds your site address could create an account. (They would still start unapproved and see nothing, but turn it off anyway.)

### D. Create the accounts

Supabase's built-in email only reaches members of your own Supabase organization (and is limited to a couple of messages an hour), so emailed invitations will not work for testers. Create accounts with passwords instead:

1. In the dashboard open **Authentication > Users**, click **Add user**, and choose the option that creates a user with an **email and password** ("Create new user"). Tick **Auto Confirm User** so they can sign in straight away. *I found these button names in a community bug report on GitHub, not in Supabase's current documentation, so they may have changed. Supabase's documented route is "Send invitation", which relies on email.*
2. **Create your own account first.** The first account ever created becomes the **approved Safety Admin** automatically. This only works if you ran `setup.sql` (step B.3) *before* creating accounts, because each person's profile is made at the moment their account is created. If you made an account earlier, delete it on the Users page and create it again.
3. Every account after that starts as an **unapproved Foreman** and sees nothing until you approve it. In **SQL Editor** run, once per person (change the email and the role):

```sql
update public.profiles set approved = true, role = 'foreman' where email = 'tester@example.com';
```

The role is one of `foreman`, `construction` or `safety`.

| Role | Sees | Can change |
|---|---|---|
| Foreman | the planning screen; their own plans | their own plans |
| Construction Admin | foreman view and construction view; all plans | their own plans |
| Safety Admin | all three views; all plans | all plans |

Tell each person their email and password in person or by phone. There is no "change my password" screen in the app yet, and I have not confirmed how to change a password from the Supabase dashboard (check their current docs).

**To cut someone off** (they leave the project, or lose a phone), run this in SQL Editor. It keeps their plans and blocks them from everything:

```sql
update public.profiles set approved = false where email = 'tester@example.com';
```

Deleting an account that has saved plans is refused by the database on purpose, so plans are never lost by accident. An account with no plans can be deleted on the Users page.

### E. Add the settings in Vercel

Project Settings > Environment Variables. Add these, then redeploy:

| Name | Value | Where to find it |
|---|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic API key | Anthropic Console |
| `SUPABASE_URL` | your project URL, like `https://abcdefgh.supabase.co` | Supabase **Connect** dialog |
| `SUPABASE_PUBLISHABLE_KEY` | starts with `sb_publishable_` | Supabase **Connect** dialog |
| `SUPABASE_SECRET_KEY` | starts with `sb_secret_` | Supabase **Settings > API Keys** |
| `AI_CALLS_PER_HOUR` | *optional.* Default 150 per person | |
| `ANTHROPIC_MODEL` | *optional.* Leave empty to use `claude-sonnet-5-5` | |

Supabase's documentation says the Connect dialog shows the project URL and publishable key, and that secret keys live under Settings > API Keys. The **secret key** can do anything to your data. It goes only here, never in the browser, GitHub or a chat. (The app also refuses to start if only some of the three Supabase settings are filled in, and says which one is missing.)

`ACCESS_CODE` is only used when the three Supabase settings are **not** set (the older shared-code mode). With Supabase set, it is ignored.

### F. Check it

Open `https://YOUR-SITE/api/health` in a browser. It shows a plain checklist: which settings are present (yes/no, never the values), whether each of the four tables is reachable, and whether at least one approved user exists. Fix anything it flags, then open the site itself and sign in with the account you created first.

### Before you share the link

- **Set a spending limit in the Anthropic Console.** The per-person limit helps but is not a budget.
- **The knowledge base is public.** The sample regulations, incidents and policies are built into the page, so anyone who can open the site's files can read them, even without signing in. Do not put real company incident data or confidential policies in this project yet. (Saving a company's own knowledge base privately is planned for stage 2.)
- **Incidents INC-310 and INC-270** are drafted examples that need your safety lead's approval before crews see them.
- **Plans you save are stored in your Supabase project.** Plans contain job details. Decide who should have access to the Supabase dashboard itself, because anyone with it can read the data.

---

## 2. Run it on your computer

You need Node.js **22.12 or newer**.

```bash
npm install
cp .env.example .env.local      # then open .env.local and fill it in (same names as the table above)
npm run dev                     # then open http://localhost:5173 in your browser
```

`npm run dev` also runs the `api/` functions locally, so sign-in, saved plans and the AI work the same way they will online.

| Command | What it does |
|---|---|
| `npm run build` | Builds the site into `dist/` |
| `npm run preview` | Serves the built site. The `api/` functions are **not** included, so it falls back to the old shared-code mode. Use `npm run dev` for the full app. |
| `npm test` | Runs the 39 automated tests (no network, no real keys needed) |

---

## 3. Talking with Petey

**How to use it**

- **Planning, hands busy:** on the first screen tap **Talk to Petey**, say the day's tasks, and pause. Petey shows what he heard, then starts the conversation. He reads each question aloud, listens, shows your answer for about a second and a half, and sends it. **Typing in the box, or tapping the mic, cancels the automatic send.** Tapping the mic while Petey is talking cuts him off so you can answer. Tap it again to turn voice off. The mic button next to the answer box starts voice mode in the middle of a conversation.
- **During the shift:** open the plan, then **Petey**. **Tap and talk** needs no wake word: tap, say it, and Petey answers aloud. "Hey Petey" (always listening) is still there, but see the limits below.
- If a browser cannot listen, Petey can still read his questions aloud while you type.

**What this version uses.** The browser's built-in speech: the browser turns your voice into text and reads Petey's words aloud. There is nothing extra to buy or set up. The voice you hear is whatever voice your device offers (or the one chosen in Settings), so it sounds different on different devices. Sources I found say Chrome and Edge on a computer offer decent voices, while phone voices vary by phone and browser (see the sources list in my message; they are articles, not the browsers' own documentation).

**Limits you should know about**

- **It is not a single "narrator" voice.** A consistent, natural narrator voice on every phone and laptop needs a cloud voice service (a paid service that turns text into audio). That is a separate decision with a monthly cost, an account, a key and a privacy question (Petey's words go to that company). It is not built. The code is arranged so it would change in one place (`Voice.speak` in `30-voice-conversation.js`).
- **Listening sends audio to the browser maker.** Sources I found say Chrome and Edge send the audio to Google and Microsoft to turn it into text, and Safari uses Apple's speech service. It needs an internet connection. Firefox cannot listen at all. I replaced the prototype's line "does not record or listen to background conversations" with a plain description of this, because with "Hey Petey" the microphone stays open. Check your company's policy before using voice near sensitive information.
- **"Hey Petey" always-listening is unreliable on phones.** A source I found says browsers end listening sessions after silence, a time limit, or when the tab loses focus, and more aggressively on phones. A phone browser also cannot listen with the screen locked. Use **Tap and talk** on phones. A truly hands-free, always-listening Petey on a phone needs a phone app or a speech service, which is a bigger project.
- **Wrong words.** Speech recognition mishears, especially with machinery noise, accents and trade words. That is why Petey shows what he heard before sending, and why the plan itself is always shown for the foreman to read and correct.
- **Not tested with real sound.** Everything was checked with a stand-in microphone and speaker (46 checks of the logic: who speaks when, when it listens, when it sends, what happens when the microphone is blocked or nothing is heard). I have not heard it, and I have not tried it on a real phone. In particular I do not know whether iPhone and Android browsers will let Petey speak after the first question without another tap; the code speaks a silent sound inside your tap to try to allow it, but that is a known workaround I could not test.
- Petey speaks in English (US) only for now. The plan screens themselves are not read aloud.

---

## 4. What is in the folder

```
api/claude.js            the AI proxy: checks who you are, applies the hourly limit, adds the key, calls Anthropic
api/config.js            tells the page how sign-in is set up (never returns a secret)
api/me.js                who am I, and what role
api/plans.js             save a plan, list plans, open a plan, revision history
api/health.js            the setup checklist
server/                  shared server code: sign-in checks, roles, limits, error handling
supabase/setup.sql       creates the tables and locks them (run once in the SQL Editor)
index.html, vercel.json  page shell; function timeout and two security headers
src/main.jsx, App.jsx    start-up; React draws the screens once, then the original scripts take over
src/auth/                sign-in state: who is signed in, token refresh, sign out
src/plans/               the saved-plans store: remembers which plan is on screen and saves changes in order
src/api/                 adds the person's token to AI calls and turns server errors into plain sentences
src/components/          sign-in form, account menu, "My plans" list, save indicator, access-code dialog (React)
src/markup/              the prototype's screens as separate HTML pieces
src/styles/              the prototype's CSS plus auth.css and voice.css
src/data/kb.json         the built-in knowledge base
src/legacy/scripts/      the prototype's JavaScript in its original run order (01-28), plus
                         29-persistence-bridge.js, which saves plans and limits role views, and
                         30-voice-conversation.js, which lets Petey speak and listen
tests/                   39 tests: the proxy, sign-in and plans (against a stand-in Supabase), and setup.sql run in a real Postgres
public/                  favicon and home-screen icon
```

### What the server does and does not do

- Every request to `api/me`, `api/plans` and `api/claude` must carry a valid sign-in. The server checks the token with Supabase and then checks the person's profile in the database: not approved means no access (403); wrong role means no access.
- A foreman asking for someone else's plan gets "not found", not "forbidden", so the plan's existence is not revealed.
- The browser holds only the publishable key. The tables have row-level security switched on with no rules and all browser access revoked, so the publishable key cannot read or write them even if someone tries it directly. Only the server's secret key can.
- Sends Anthropic only the messages, the system prompt and a token limit (capped at 4096). The model is chosen on the server.
- Never returns a key. Does not store or log what people type into Petey, except that each AI request is counted (who and when, no content) for the hourly limit. Saved plans are stored in full.

---

## 5. What was and wasn't checked

**Checked here (against stand-ins, not the real services)**

- 39 automated tests pass: the proxy, sign-in and roles, saved plans, the hourly limit, the setup check, and `setup.sql` run in a real (in-memory) Postgres, including that the browser keys are locked out and that the approve statement above works.
- A browser test of 62 checks against the built site, the real `api/` functions, a stand-in Supabase and a stand-in Anthropic: sign-in and wrong password; an unapproved person gets no access; the setup questions then planning on a new device; a plan is saved at revision 1; a hand edit saves revision 2 and Petey's mid-shift update revision 3, all on the same plan; reload keeps you signed in; "My plans" lists, shows history, and reopens; a second foreman cannot see the first foreman's plan; the safety admin sees and can change everything; the construction admin can read but not change others' plans; the safety view stays closed to people without the role; a session timeout keeps the plan on screen and signing back in resumes it; the hourly limit gives a plain sentence; sign out clears this device; and neither secret key is in the page or built files. Deliberately breaking the role guard and the plan-overwrite guard makes the right checks fail. This browser test is not included in this folder.
- A browser test of 46 checks for voice, with a stand-in microphone and speaker: Petey speaks, listens, shows what he heard, sends, and loops; typing cancels the send; the mic can cut Petey off; the microphone is closed when the plan is built; a browser that cannot listen, a blocked microphone, silence, and a browser that never starts speaking are all handled; and Tap and talk on the companion screen; and a reply that arrives cut off or empty is never shown as a broken bubble. This test is not included in this folder. It cannot prove real audio or phone behavior (see section 3).
- The three original prototype test suites (22, 27 and 28 checks) give the same results as before on this build, and the older shared-code mode still passes its own 30-check browser test.

**Not checked: please verify**

- **A real Supabase project and a real Vercel deployment of this version.** The stand-in Supabase answers the way I understand the real one does (checked against the installed client library's code), but I have not talked to the real thing.
- **Dashboard button names.** See the notes in section 1. "Add user > Create new user" and "Auto Confirm User" come from a community report, not current documentation.
- **Error codes from Supabase's sign-in.** The app recognises a wrong password by the code `invalid_credentials` or the words "invalid login credentials". If the real service words it differently, the person would see a generic "Could not sign in" message plus Supabase's own text.
- **A live Anthropic call and Vercel details**, as before: that the functions run as written with `"type": "module"`; that `maxDuration: 60` in `vercel.json` is allowed on your plan (if the deploy complains, lower or delete that block); and that request bodies over roughly 4.5 MB are refused. Check Vercel's current docs.
- **The model, and thinking.** The prototype asked for `claude-sonnet-4-6`. The proxy defaults to `claude-sonnet-5-5`. Anthropic's docs say that model "thinks" by default and that thinking counts against `max_tokens`, which made Petey's replies come back cut off or empty. The proxy now sends `thinking: {"type": "between_tools"}` (the lowest setting the docs name for this model; it rejects `disabled`), and if Anthropic ever refuses that setting the proxy repeats the request without it. The app also refuses to show a reply that hit its limit or is empty, and says "send that again". I could not call the live service from here, so the real effect is **unconfirmed until you try it**. The docs also say Sonnet 5.5 produces about 30 percent more tokens for the same text, so the limits for the written plan were raised (6000, and the server ceiling to 8192). Long plans take longer to write; if Vercel stops a request, `maxDuration` in `vercel.json` (60 seconds) may need raising on a plan that allows it. If you set `ANTHROPIC_MODEL` to a different model, check that model's thinking default in Anthropic's docs, because the proxy only adjusts `claude-sonnet-5-5`.

**Known limits of this stage**

- The **Safety Admin and Construction Admin dashboards still show the prototype's sample crew data**. Only plans are saved and role-protected so far.
- **Escalation alerts are not sent anywhere yet** (stage 3). They show on screen only. Email or text needs an extra service.
- **The knowledge base is not saved per company yet** (stage 2), and it is sent to the AI inside the prompt, so very large libraries will need real search later.
- A plan opened from the offline cache or built on the offline form is treated as a new plan the first time it is changed. It never overwrites a saved one.
- On a new device the first sign-in shows the prototype's five short setup questions (they can be skipped).
- **No "change my password", no self-service password reset, and no screen for approving people.** Use the Supabase dashboard and the SQL above.
- **Voice is a first version** (section 3): no single narrator voice, no hands-free phone mode.
- Offline caching does not work as a web app (the prototype's service worker was created from inline text, which browsers refuse on a real website; it needs a real `public/sw.js`). Fonts load from Google Fonts, so the first load needs internet.
- The prototype's JavaScript is kept as it was (not broken into React components). It can be converted screen by screen later.
