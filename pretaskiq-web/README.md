# PreTaskIQ web app

PreTaskIQ (Petey, the pre-task hazard analysis companion) as a Vite + React project you can put online.

**This version adds the pilot foundation ("stage 1"):**

- **Real sign-in.** Only people you create accounts for can use the app. Three roles: Foreman, Construction Admin, Safety Admin. The roles are enforced on the server, not just hidden in the page.
- **Saved plans with history.** Every plan Petey writes is saved. Hand edits and Petey's mid-shift updates are saved as new revisions of the same plan. "My plans" in the top bar lists them and opens them again.
- **The site opens on planning.** The account menu has "Watch the overview video", which opens the promo video (`public/promo.mp4`, also public at `/promo.mp4`). The old narrated slideshow is retired from the menu; its code (`23-guided-demo.js`, `public/demo/`) is still in the project, and `?demo` in the address still opens it.
- **Crew sign-off, then Submit.** At the bottom of the hazard analysis the foreman lists who is on the crew (typed, or said aloud), each person signs with a finger, and only when everyone has signed does **Submit** work. Submitting saves the plan as submitted and opens Petey's shift companion automatically. See section 3.
- **Talking with Petey.** The morning planning conversation can be spoken: Petey reads each question aloud, listens for the answer, shows what he heard, and sends it after a short pause. The mid-shift companion screen has a "Tap and talk" button. Optional: a natural-sounding voice and more reliable iPhone listening, through an ElevenLabs account you set up yourself (section 3; it costs money and sends voice to ElevenLabs).
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
3. Open **SQL Editor**, start a new query, paste the whole contents of `supabase/setup.sql`, and run it. It is safe to run twice. It creates six tables (profiles, plans, plan_revisions, ai_usage, alerts, kb_entries) and locks them so that the browser's key can read nothing; only your server functions can.

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
| `ELEVENLABS_API_KEY` | *optional.* Switches on the natural voice and iPhone listening (section 3). Costs money. | Your ElevenLabs account |
| `ELEVENLABS_VOICE_ID` | *optional.* Which voice. Leave empty for the default | ElevenLabs voice library |
| `PRETASKIQ_SIGN_IN` | *optional.* `on` or `off`. Overrides the sign-in switch (below). | |
| `AI_CALLS_PER_HOUR` | *optional.* Default 150 per person | |
| `ANTHROPIC_MODEL` | *optional.* Leave empty to use `claude-sonnet-5-5` | |

Supabase's documentation says the Connect dialog shows the project URL and publishable key, and that secret keys live under Settings > API Keys. The **secret key** can do anything to your data. It goes only here, never in the browser, GitHub or a chat. (The app also refuses to start if only some of the three Supabase settings are filled in, and says which one is missing.)

`ACCESS_CODE` is only used when the three Supabase settings are **not** set (the older shared-code mode). With Supabase set, it is ignored.

**The sign-in switch.** `server/config.js` has a setting, `SIGN_IN_DEFAULT`, currently **`'on'`** (people sign in with an email and password; set it to `'off'` to go back to the shared code). While it is off, the site uses the shared `ACCESS_CODE` and **ignores the Supabase settings even if all three are filled in on Vercel**, so people are not asked to sign in. Nothing is deleted: the database, your account and the Vercel settings stay as they are, and `/api/health` says "sign-in is switched off". Plans are not saved while it is off. To turn sign-in back on, change `'off'` to `'on'` in that file and redeploy (or set `PRETASKIQ_SIGN_IN=on` on the host, which overrides the file). Turning the shared code off completely would let anyone who finds the address run up your Anthropic bill, so the switch only chooses between the two modes.

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
| `npm test` | Runs the 64 automated tests (no network, no real keys needed) |

---

## 3. Talking with Petey

**How to use it**

- **Planning, hands busy:** on the first screen tap **Talk to Petey**, say the day's tasks, and pause. Petey shows what he heard, then starts the conversation. He reads each question aloud, listens, shows your answer for about a second and a half, and sends it. **Typing in the box, or tapping the mic, cancels the automatic send.** Tapping the mic while Petey is talking cuts him off so you can answer. Tap it again to turn voice off. The mic button next to the answer box starts voice mode in the middle of a conversation.
- **On an iPhone** (with the voice service below switched on) Petey records your answer instead of using the phone's built-in listening. Say your answer; he finishes by himself after a short pause, or tap the mic as soon as you are done. The screen then says "working out what you said" for a moment before your words appear.
- **During the shift:** after you submit, Petey's companion screen opens by itself (you can also reach it from the plan: **Talk to Petey**, once the plan is submitted). **Tap and talk** needs no wake word: tap, say it, tap again when done (or pause), and Petey answers aloud. "Hey Petey" (always listening) is still there, but see the limits below.
- If a device cannot listen, Petey can still read his questions aloud while you type.
- **How long the planning conversation runs.** The crew is waiting to get to work, so Petey works to a budget: about **5 questions** for the whole day (never more than 7), no more than two sentences per reply, and **one** closing message at the end ("anything we missed?" plus each person saying out loud the one thing they are watching for) instead of two. Routine tasks share a single question. For the highest-risk work he first asks for the one real control (what keeps anyone out from under the load), then says the controls he would expect and asks which are **not** in place: anything named as missing is flagged, anything not named is treated as in place. The app tells him which question he is on at every turn (a "PACE" line added to his instructions, never shown on screen) and, past question 5 and again past question 7, to stop asking and close. The two numbers are `INTERVIEW_QUESTION_TARGET` and `INTERVIEW_QUESTION_MAX` at the top of `src/legacy/scripts/03-system-prompts.js`. He no longer asks "is your crew with you?" as a question; he asks them to gather in as a statement, which saves a turn.

### Crew sign-off, Submit, and the shift companion

**The steps**

1. Petey writes the hazard analysis. Read it with the crew; use **Edit** if something is wrong.
2. At the bottom, under **Crew Acknowledgment**, the foreman lists everyone on the crew: type the names (commas between them) and tap **Add**, or tap **Say the names** and say them ("Luis Ortega, Dave Smith and Mike Jones"), then check the spelling Petey shows. Include yourself. Each name gets a row.
3. Each person taps **Sign** next to their name and signs with a finger (iPad, iPhone) or a mouse, then taps **Save signature**. A single tap or a tiny mark is not accepted. **Clear** starts over.
4. When everyone listed has signed, tap **Submit and start shift with Petey** (at the top, under the document, or on the sticky bar at the bottom). If anyone has not signed, Submit does nothing except tell you who is missing and scroll to the list. A crew list with nobody on it also cannot be submitted.
5. Petey's shift companion screen opens by itself, with an "ON SHIFT" card for the plan, a greeting in the log, and the reminder of what to call him for: **plan changes** (tell him what changed and he updates the plan), **policy or OSHA questions**, and **procedure tracking** (tell him which procedure you are starting, such as lockout/tagout, and he tracks the steps). The greeting is spoken aloud only if the plan was made by voice.

**Rules worth knowing** (these are my design choices; tell me if you want any of them different)

- **A signature belongs to the revision it was signed on.** If the plan changes afterwards, by a hand edit or by Petey's mid-shift update, the old signatures stay on screen faded, the crew has to sign again, and the button becomes **Submit Rev 2** (and so on). The companion screen and Petey's log say so. The reasoning: the crew signed what they read, and the plan is not that any more. The cost: fixing a typo after signing means signing again, so do the editing first.
- **Late arrivals:** after the plan is submitted you can still add a person and have them sign. That does not need a new submission. People cannot be removed from the list after submission, so the record stays whole.
- **Nothing is sent to anyone.** Submit marks the plan as submitted and saves it. There is no approval step and no message to a supervisor or the safety department yet (stage 3).
- **"Hey Petey" always-listening is not switched on for you.** It needs the microphone permission and keeps the microphone open, so you tap **Enable Petey** (or just use **Tap and talk**). I can make it start by itself, but then a phone would ask for the microphone at the moment of Submit and the microphone would be open all shift without a deliberate tap; say so if you want that.
- **The rule is kept by the app, not by the server.** The page will not let Submit happen until everyone has signed, but the server only stores what it is sent; it does not check signatures. That is enough for a crew using the app as designed, not a defence against someone who deliberately edits what the browser sends.
- **A plan you may only read** (for example a construction administrator opening a foreman's plan) shows the crew and signatures but has no Sign, Add or Submit.

**What is stored and where**

- The crew names and signatures are saved **inside the plan** in your Supabase project, as part of the same plan and revision (no new tables or SQL). A signature is stored as a short drawing (a few hundred characters of coordinates) plus the time and the revision signed, not as a picture file. The history lists the sign-off and "Submitted" as notes on the revision.
- **The AI is never given the signatures.** It is given the crew names and whether each person has signed, so Petey can answer "who is on the crew".
- Signatures and names are personal information. They sit in your Supabase project with the rest of the plan, so the earlier note about who can open the Supabase dashboard applies. Without sign-in (the older shared-code mode) nothing is saved: the crew and signatures live only on that screen.
- **I do not know whether a finger-drawn signature on a screen satisfies your company's, a client's or any regulator's rules for a signed hazard analysis.** It is a drawing stored with a time and a revision. It does not prove who drew it (whoever holds the phone can write any name). Ask your safety lead before replacing paper sign-in sheets with it.

**Two ways Petey can talk and listen**

| | Without the voice service (the default) | With the voice service (optional) |
|---|---|---|
| Petey's voice | The device's built-in voice. Petey prefers a **male** voice if the device has one (a guess from the voice's name, see "Petey's voice is male" below), then the better ("natural", "enhanced", "premium") ones. Many devices only have robotic ones. | A natural-sounding male voice from ElevenLabs ("Brian", American accent, unless you choose another), the same on every device. |
| Listening on iPhone | The browser's built-in listening, with fixes for the problems reported on iPhones (below). | Petey records your answer and ElevenLabs turns it into text. |
| Listening elsewhere | The browser's built-in listening. | The same (the browser's). It can be switched to the recording method with `?listen=server`. |
| Cost | Nothing. | A paid ElevenLabs plan (see below). |
| If it fails | Nothing to fall back to: you type. | Petey quietly goes back to the left-hand column for a few minutes, so a conversation never stops. |

**Switching on the voice service (about 10 minutes)**

1. Create an account at elevenlabs.io. As I read ElevenLabs' documentation, the free plan has no commercial licence and requires attribution, and paid plans include a commercial licence. Using it for your company means a paid plan. **Check the current plans and licence terms yourself on their site.**
2. In your ElevenLabs account, create an **API key**. I do not know the exact menu names in their dashboard today (look for "API keys" in the account or developer settings). If you can set a spending or usage limit there, do that.
3. In Vercel, Project Settings > Environment Variables, add `ELEVENLABS_API_KEY` with that key, then redeploy. **The key goes only in Vercel. Never in GitHub or a chat.**
4. Optional: to choose the voice, copy a voice ID (see "Petey's voice is male" below) and add it as `ELEVENLABS_VOICE_ID`, then redeploy. If you do not, Petey uses "Brian". **I could not confirm that ID works on every account or plan.** If Petey is silent or falls back to the robotic voice, set a voice ID from your own account.
5. Check: `https://YOUR-SITE/api/health` should show `ELEVENLABS_API_KEY: true` (yes/no only, never the key), and `https://YOUR-SITE/api/speak` should answer `configured: true`. That only proves the key is present, not that ElevenLabs accepts it. Then open the site, start a conversation, and listen.

**Petey's voice is male**

Petey is a man's name, so he is meant to sound like one. How that works depends on which of the two ways above is in use:

- **Natural voice (ElevenLabs).** The default voice is "Brian", which ElevenLabs' "Default Voices" page (elevenlabs.io/docs/voices/default-voices) lists as male, American, "deep". I chose him because you asked for a male voice with an American accent; **I picked him from the description and have not heard him.** To use a different voice, copy one ID into `ELEVENLABS_VOICE_ID` in Vercel and redeploy (a value set there overrides the default). That page lists these American male voices: Bill `pqHfZKP75CvOlQylNhV4` (trustworthy), Brian `nPczCjzI2devNBz1zQrb` (deep), Chris `iP95p4xoKVk53GoZ742B` (casual), Eric `cjVigY5qzO86Huf0OWal` (friendly), Liam `TX3LPaxmHKxFdv7VOQHJ` (articulate), Will `bIHbv24MWmeRgasZH58o` (friendly). I read the page through a tool that summarises it, and the IDs agree with a second list (wavespeed.ai), but **I have not heard any of these voices**, and I do not know that every one is usable on your plan. The earlier default, "George" (`JBFqnCBsd6RMkjVDRZzb`), is male with a British accent. If you set `ELEVENLABS_VOICE_ID` to a female voice, Petey will be female.
- **The device's own voice.** A browser does not say whether a voice is male or female, so Petey **guesses from the voice's name**: Alex, Daniel, Aaron, Evan, Nathan, Tom, Arthur, Oliver, Gordon, Lee, Guy, Davis, Andrew, Brian, Christopher, Eric, Roger, Steffan, Ryan, Thomas, Mark, David, James, George, Richard, and anything with "Male" in its name (such as "Google UK English Male"). **This list is from my memory of the voice names Microsoft, Apple and Google use and has not been checked on real devices.** A device may have no such voice (many Android phones, for example, name their voices only by language and accent), or call it something not on the list. Then Petey uses the most natural-sounding American voice, which may be female.
- **Choosing by ear.** In **Settings > Petey Voice** the list is now: *Automatic (a male voice if this device has one)*, then the English male voices (marked "male"), then the other English voices, then other languages. Pick one, tap **Preview voice**, and **Save settings**. Choosing *Automatic* and saving clears an earlier choice. When the natural voice is on, Preview plays the natural voice (the list is then only the back-up voice). A voice only counts as your own choice if you picked it in the list: earlier versions saved whatever was shown whenever you pressed Save, and that is now ignored so it cannot keep a female voice in place. Settings is reachable from the menu of the safety and construction roles; a foreman's phone gets Automatic.
- A male voice is preferred even over a more natural-sounding female one (for example "Microsoft David" over "Microsoft Aria Online (Natural)"). If you would rather have the natural-sounding one, pick it in Settings.
- The guided tour's narration (the first-run walkthrough) still prefers a female voice, as in the prototype. I did not change it.

**Petey's voice getting cut off**

Fixed in this version: each spoken piece had a safety timer (5 seconds for the browser voice, 8 for the natural voice) meant only for "the sound never started". It was not restarted when the sound did start, so Petey's **first sentence was cut off if it took longer than that to say**, and the reply continued with the next piece. Now the timer is restarted when the sound starts and allows the whole piece (about twice the time speech normally takes); a voice that stalls part-way still moves on instead of freezing the conversation. A skipped piece that reports "finished" late can no longer skip the next piece too. If voices are still cut off on a real device, that may be a different cause (for example a phone ending speech when the screen locks or the page goes to the background), which I could not test here.

Two more optional settings exist (`ELEVENLABS_MODEL_ID` and `ELEVENLABS_STT_MODEL_ID`); the defaults are the fast speaking model and the "scribe_v2" listening model named in ElevenLabs' documentation. They are listed in `.env.example`.

**Trying it on an iPhone**

Open the site on the phone and have a conversation. To compare the two listening methods, add `?listen=server` (record and send) or `?listen=browser` (the phone's built-in) to the address once; the phone remembers the choice. `?listen=auto` returns to the default (recording on iPhone, built-in elsewhere). If it still fails, note which of these happened: it hears nothing, it hears the wrong words, it cuts you off too early, or it never stops. Those point to different fixes.

**One spoken answer is sent once.** Reported: Petey answered twice to one spoken sentence, first to a cut-off lowercase start of it ("...throughout the entire"), then to the complete, punctuated sentence. Reproduced with a stand-in recognizer, and fixed three ways: the page now waits up to four seconds (was one and a half) after the pause for the recognizer's final text before giving up; once a listening session is over, anything it says later is ignored (it can no longer write into the answer box); and a session that is thrown away on purpose (you start typing, or leave the screen) hands over nothing, where before it handed over whatever it had heard and the conversation sent that by itself. Not confirmed on a real device: I could not see which browser the report came from, and real recognizers differ in how late their final text arrives.

**The voice check page.** When Petey sounds like the phone's own voice and you want to know why, open the site with `?voicecheck=1` on the end (for example `https://YOUR-SITE/?voicecheck=1`). It shows: whether the site has the natural voice switched on (asked fresh, not what the page remembered); whether the access code has been entered in this tab; what the page will use right now and why; which English voices the phone has, with the app's male guesses marked and the back-up voice it would pick; a **Test the natural voice** button (sends one 12-character line to ElevenLabs, so it costs next to nothing, and reports the answer in plain words, for example "ElevenLabs rejected the key"); and a **Test this phone's own voice** button. It never shows a key or the access code. Take a screenshot of it when asking for help.

**Shared-code mode and the voice.** The access code is kept only in the tab (it is forgotten when the tab closes) and is first asked for when Petey first needs the AI. Until it has been entered, the voice service is treated as "not available yet": no request is made and nothing is put to rest, and the natural voice and iPhone recording switch on by themselves once the code is in. (Before this change, a code-less first request was refused, which put the natural voice and iPhone recording to rest for five minutes, so a conversation could run entirely on the phone's own voice and listening. That was reproduced with stand-ins, **not** confirmed on a real phone.) The first answer in a brand-new iPhone tab is still heard by the phone's built-in listening, because the code has not been typed yet.

Typing is always available, and so is the keyboard's own dictation key, which uses the phone's regular dictation instead of the page.

**Cost (verify these yourself)**

From ElevenLabs' pricing page as I read it, **approximately**: a paid plan from about $6 a month (Starter) and $22 a month (Creator); speaking is billed around $0.04 per 1,000 characters on the fast models, and speech-to-text around $0.20 per hour of audio. I read the page through a translation, so **these numbers may be wrong or out of date; confirm them on elevenlabs.io/pricing.** I also do not know whether a plan stops at its limit or bills extra, or whether that can be switched off. Rough illustration only, using those unconfirmed rates and my own guess of 3,000 characters of Petey's speech in one planning conversation: about 12 cents of speaking, and a 10-second spoken answer is a fraction of a cent of listening. Your real usage will differ.

**Privacy: what goes to ElevenLabs**

- **Petey's words.** Everything Petey says aloud while the voice service is on is sent to ElevenLabs as text, including job details he reads back (location, tasks, hazards, names).
- **Your voice.** On iPhones (and anywhere you use `?listen=server`), the recording of each answer, up to about a minute, is sent to ElevenLabs. Anyone talking near the phone is in that recording. Petey's own server passes it on and does not keep it.
- ElevenLabs' documentation says request logging is on by default and that turning it off ("zero retention") is for enterprise customers. I do not know how long ElevenLabs keeps anything. **Read their privacy policy and terms, and your company's policy, before using this with real job information.**
- "Hey Petey" always-listening is the prototype's own, still uses the browser's built-in listening, and is not sent to ElevenLabs. Browser listening itself sends audio to the browser maker (below).
- The voice service needs the same sign-in (or access code, in the older shared-code mode) as the AI, so people who are not signed in cannot run up your ElevenLabs bill. Speaking does not use up the hourly limit on AI requests.

**Limits you should know about**

- **I could not identify the narrator voice from the walkthrough video.** The voice service gives one consistent voice, but it is a voice I can set, not the one in the video. If you find out which service and voice made that narration, tell me, and it may be possible to set the same voice here (via `ELEVENLABS_VOICE_ID`) if it is available in ElevenLabs.
- **Browser listening sends audio to the browser maker.** Sources I found say Chrome and Edge send the audio to Google and Microsoft to turn it into text, and Safari uses Apple's speech service. It needs an internet connection. Firefox cannot listen at all. Check your company's policy before using voice near sensitive information.
- **The iPhone problems are from user reports, not from Apple.** The "doubled words", "goes deaf after Petey speaks" and "does not work from a Home Screen icon" problems come from reports on WebKit, GitHub and Apple developer forums. I could not confirm them with Apple's documentation, and they may differ by iOS version. That is why iPhones record the answer instead.
- **"Hey Petey" always-listening is unreliable on phones.** A source I found says browsers end listening sessions after silence, a time limit, or when the tab loses focus, and more aggressively on phones. A phone browser also cannot listen with the screen locked. Use **Tap and talk** on phones. A truly hands-free Petey on a phone needs a phone app, which is a bigger project.
- **Wrong words.** Recognition mishears, especially with machinery noise, accents and trade words. Recording near running equipment may pick up more noise than the phone's own listening does; I do not know how well it copes. That is why Petey shows what he heard before sending, and why the plan itself is always shown for the foreman to read and correct.
- **Not tested with real sound, a real iPhone, or the real ElevenLabs service.** Everything was checked with stand-ins: a fake microphone playing a recorded clip, a fake speaker, and a pretend ElevenLabs. That proves the logic (who speaks when, when listening starts and ends, what is sent, what happens on failures), not how it sounds or how accurate it is. In particular I do not know: whether ElevenLabs accepts the exact requests the server sends, how long a spoken answer takes to come back on a real connection, whether an iPhone keeps the microphone permission between visits, whether the phone's volume changes after the microphone has been used, or whether the speaker unlocks after the first tap on every iOS version.
- Petey speaks and listens in English only for now. The plan screens themselves are not read aloud.

### Incident reenactments (drafted by the AI, approved by a Safety Admin)

On an incident in the saved knowledge base, a **Safety Admin** sees **Create reenactment**. The AI drafts a short animated storyboard from the written incident record only (people by role, no names, no graphic injury, details the record does not state are listed as "what the record does not say", not drawn). The Safety Admin then edits the wording, **watches the preview**, ticks that they checked it, and approves. Only an approved reenactment is ever shown to crews (the "watch the reenactment" chip in Petey's replies and the lessons-learned part of the plan). The server re-checks every storyboard (fixed vocabulary of scene pieces, lengths, no markup), only a Safety Admin can attach one, and it stamps who approved it and when. If the record is too short, or the AI says it cannot be shown, nothing is drawn and the screen says why. Every replay is labelled "illustrative storyboard, not video footage". The two hand-made replays (INC-310, INC-270) are separate and never replaced.

**Not verified / limits:** checked only with a stand-in AI and a stand-in database, not with the real model or on a phone. Real drafts will vary in quality, which is why approval is mandatory. The scenes are simpler than the two hand-made ones (a fixed set of 11 pieces: ladder, platform, panel, overhead load, vehicle, trench, tool, barricade, sign, energy source). Each draft is one AI call. An incident uploaded as a PDF or photo has no kept written account, only the AI's summary, so its draft may be too thin. The whole feature does nothing until sign-in is turned on. The server code imports a shared file from `src/shared/`; I could not confirm on Vercel that this deploys, so check `/api/kb` still answers after deploying.

---

## 4. What is in the folder

```
api/claude.js            the AI proxy: checks who you are, applies the hourly limit, adds the key, calls Anthropic
api/config.js            tells the page how sign-in is set up (never returns a secret)
api/me.js                who am I, and what role
api/plans.js             save a plan, list plans, open a plan, revision history
api/health.js            the setup checklist
api/speak.js             optional: text to natural speech (ElevenLabs); checks who you are, keeps the key on the server
api/transcribe.js        optional: a recording of the foreman's answer to text (ElevenLabs), used on iPhones
api/alerts.js            the safety inbox: raise a hazard alert, list alerts, mark one as seen
api/kb.js                the saved knowledge base: list, add, change and remove incident reports, RCAs, policies, procedures and drawings
server/                  shared server code: sign-in checks, roles, limits, error handling
supabase/setup.sql       creates the tables and locks them (run once in the SQL Editor)
index.html, vercel.json  page shell; function timeout and two security headers
src/main.jsx, App.jsx    start-up; React draws the screens once, then the original scripts take over
src/auth/                sign-in state: who is signed in, token refresh, sign out
src/plans/               the saved-plans store: remembers which plan is on screen and saves changes in order
src/kb/                  the knowledge-base store: fills Petey's list from the database, saves and removes entries
src/alerts/              the safety inbox store: raises alerts, and checks for new ones every 30 seconds for safety admins
src/api/                 adds the person's token to AI calls and turns server errors into plain sentences; speech.js talks to the two voice functions and rests them after repeated trouble
src/components/          sign-in form, account menu, "My plans" list, safety alerts inbox and banner, save indicator, access-code dialog (React)
src/markup/              the prototype's screens as separate HTML pieces
src/styles/              the prototype's CSS plus auth.css and voice.css
src/data/kb.json         the built-in knowledge base
src/legacy/scripts/      the prototype's JavaScript in its original run order (01-28), plus
                         29-persistence-bridge.js, which saves plans and limits role views, and
                         30-voice-conversation.js, which lets Petey speak and listen (natural or built-in voice;
                         built-in or recorded listening), 31-crew-signoff.js (crew list and finger signatures)
                         and 32-submit-plan.js (Submit and the hand-off to the shift companion)
tests/                   87 tests: the proxy, the voice functions, sign-in and plans (against a stand-in Supabase and a stand-in ElevenLabs), and setup.sql run in a real Postgres
public/                  favicon and home-screen icon
```

### What the server does and does not do

- Every request to `api/me`, `api/plans` and `api/claude` must carry a valid sign-in. The server checks the token with Supabase and then checks the person's profile in the database: not approved means no access (403); wrong role means no access.
- A foreman asking for someone else's plan gets "not found", not "forbidden", so the plan's existence is not revealed.
- The browser holds only the publishable key. The tables have row-level security switched on with no rules and all browser access revoked, so the publishable key cannot read or write them even if someone tries it directly. Only the server's secret key can.
- Sends Anthropic only the messages, the system prompt and a token limit (capped at 8192). The model is chosen on the server.
- Never returns a key. Does not store or log what people type into Petey, except that each AI request is counted (who and when, no content) for the hourly limit. Saved plans are stored in full.

---

## 5. What was and wasn't checked

**Checked here (against stand-ins, not the real services)**

- **A browser test of 24 checks for the saved knowledge base** (not included in this folder): a Safety Admin's incident is saved, survives a new sign-in, reaches a foreman's next planning question without a reload, and can be removed; a failed save says NOT saved and Try again does not duplicate; text from an entry can't run as code; nothing is saved with no sign-in. Nine deliberate breakages of the code were each caught.
- **A browser test of 40 checks for the safety inbox** (not included in this folder): a foreman's flag reaches the database and a second browser signed in as a Safety Admin sees the badge, the tab count and the inbox; Mark as seen records who saw it and the foreman then sees that; another foreman sees nothing; a new alert shows as a banner on an open session; a failed delivery says NOT delivered and the warning stays; with no sign-in the app says nothing was sent to anyone; Petey is told what he may truthfully say; phone width. Eight deliberate breakages of the code were each caught.

- 87 automated tests pass (12 for the safety inbox, 10 for the knowledge base): the proxy, sign-in and roles, saved plans, the hourly limit, the setup check, and `setup.sql` run in a real (in-memory) Postgres, including that the browser keys are locked out and that the approve statement above works. 25 of them cover the two voice functions against a stand-in ElevenLabs: the key never leaves the server, people who are not signed in are refused before anything is sent, the browser cannot choose the voice, model or language, bad or oversized recordings are refused, ElevenLabs' own error messages are never passed on, and speaking does not use up the hourly AI limit.
- A browser test of 62 checks against the built site, the real `api/` functions, a stand-in Supabase and a stand-in Anthropic: sign-in and wrong password; an unapproved person gets no access; the setup questions then planning on a new device; a plan is saved at revision 1; a hand edit saves revision 2 and Petey's mid-shift update revision 3, all on the same plan; reload keeps you signed in; "My plans" lists, shows history, and reopens; a second foreman cannot see the first foreman's plan; the safety admin sees and can change everything; the construction admin can read but not change others' plans; the safety view stays closed to people without the role; a session timeout keeps the plan on screen and signing back in resumes it; the hourly limit gives a plain sentence; sign out clears this device; and neither secret key is in the page or built files. Deliberately breaking the role guard and the plan-overwrite guard makes the right checks fail. This browser test is not included in this folder.
- **22 checks that Petey's speech is not cut off** (not included in this folder), using a pretend speaker and audio player that take a realistic time to say each piece (about 70 to 75 ms a character) and a fake page clock so minutes run in a moment: a 10.5-second first sentence is spoken to the end (the browser voice used to be cut at 5 seconds, the natural voice's 9.75-second sentence at 8); three long pieces are all spoken in order; a voice that stalls part-way gets a fair wait and then moves on once; a skipped piece that reports "end" late does not skip the next piece; a voice that never starts is given up on after about 5 seconds (browser) or 8 seconds (natural, handing over to the browser voice). Before the fix 8 of these checks failed. To check they can fail I broke the code six ways (timer not restarted for each voice, a late "end" moving on twice, the allowance for each voice far too short, the natural voice never giving up) and each was caught.
- **36 checks that Petey has a male voice** (not included in this folder), with pretend voice lists: which names count as male and which do not ("Google UK English Female" and "Alexandra" do not); which voice is chosen from nine different lists; a voice the person picked is kept but one that was only saved automatically is ignored; Settings lists Automatic first and male voices first, Preview speaks the right voice, nothing is saved until Save, a choice is never wiped by saving other settings, and when the natural voice is on Preview asks it. To check they can fail I broke the code thirteen ways, and each was caught (the first round missed four; I added checks, and removed one redundant rule). **These prove the code follows the name list. They do not prove those names are what real iPhones, iPads, Windows or Android devices call their voices.**
- **19 checks on sending a spoken answer once** (not included in this folder): a final text that arrives 2.6 s and 3.6 s late is waited for and sent once, complete; a recognizer that never finishes is sent once and shut down, and a very late result is ignored; typing over a half-heard answer sends nothing and keeps your words; leaving the first screen while listening starts nothing later; an ordinary answer still goes once. 6 deliberately broken versions were each caught.
- **14 checks on the voice and the access code** and **33 checks on the voice check page** (neither is included in this folder): no request without a code and no resting for five minutes; the voice switches on as soon as the code is stored; a refused code still rests the service; the panel opens only when asked for, lists English voices only, names the back-up pick, shows each failure in plain words, never shows the code, and fits a phone's width. 13 deliberately broken versions were each caught.
- **50 checks on the shorter planning conversation** (not included in this folder): what the instructions say (time box, two-sentence replies, one follow-up on a vague answer, the sweep, a single closing, and that every hazard-capturing rule is still there: STKY screening, escalation, project hold points, excavation, the question about people below overhead work); the pace line on each of eight questions; that it goes in the instructions only, never into the conversation or to the plan builder; and a whole eight-turn conversation as the app sends it. 14 deliberately broken versions of the code were each caught by at least one check.
- A browser test of 47 checks for voice, with a stand-in microphone and speaker: Petey speaks, listens, shows what he heard, sends, and loops; typing cancels the send; the mic can cut Petey off; the microphone is closed when the plan is built; a browser that cannot listen, a blocked microphone, silence, and a browser that never starts speaking are all handled; and Tap and talk on the companion screen; and a reply that arrives cut off or empty is never shown as a broken bubble. This test is not included in this folder. It cannot prove real audio or phone behavior (see section 3).
- Two browser tests for the crew sign-off and Submit (not included in this folder). **87 checks** in a real browser: names are understood ("Luis Ortega, Dave and mike smith" gives three names; a spoken "the crew is ..." lead-in is dropped); Submit does nothing with an empty crew or with anyone unsigned and says who is missing; the signature pad (a tap is not a signature, Clear, Escape, Cancel, a real stroke saves, drawn with a mouse and with simulated touch on an iPhone-sized screen, the page does not scroll under the finger); names said aloud through a stand-in microphone; a hand edit makes the signatures old and everyone must sign again; Submit opens the companion screen with the ON SHIFT card and the greeting (spoken only if the plan was made by voice); Petey's mid-shift update keeps the crew, the signatures and the record of the submission even though the AI hands back a fresh copy without them; the AI is shown the names but never the handwriting; a late arrival can be added and sign; someone who may only read a plan gets no Sign, Add or Submit; a name containing markup and a tampered signature are shown harmlessly; and a sideways phone still fits the whole pad including Save. **28 checks** with sign-in, saved plans and a stand-in Supabase: the crew and signatures are saved to the same plan and revision (no second plan, no new revision), Submit is saved with the history note, the plan reopens on another device still submitted with its handwriting, a failed save does not stop the shift and "Try again" saves it, and the construction administrator (read only) and safety administrator (can change) see the right controls. To check that these tests can fail, I deliberately broke the new code 14 ways (Submit not needing signatures, old signatures still counting after a change, the crew or the record of the submission being lost when the AI hands back the plan, the AI being given the handwriting, Submit not opening the companion, a read-only viewer being offered Submit, any text accepted as a signature, a tiny scratch accepted, a second plan being created on Submit, people removable after submission, the pad letting the page scroll, someone else's plan not treated as read only, names not tidied) and each made checks fail. The first round missed two of them (a read-only plan that was already submitted, and a scratch accepted as a signature), so I added checks for those, and the code was then put back.

- Two more browser tests for the optional voice service (not included in this folder): **44 checks for the natural voice** with a pretend ElevenLabs returning a generated sound clip (Petey's reply is cut into pieces, the first sentence is fetched alone so he starts sooner, the next piece is fetched while the current one plays, tapping the mic stops him at once, acronyms such as JHA and PPE are spelled out, and when the service fails or returns something unplayable Petey carries on in the browser's voice and leaves the service alone for five minutes), and **44 checks for recorded listening** using Chromium's fake microphone playing a computer-generated clip of speech-like sound and a clip of silence (the page records, finds the end of the speech by itself, trims the silence, sends a 16 kHz recording, shows the returned words, closes the microphone afterwards, shows an error for a blocked microphone or no microphone, and falls back to the browser's listening if recording cannot start). Neither clip is a human voice, so these show the plumbing works, not that real speech is recognised. To check that the tests can actually fail, I deliberately broke the listening and voice code nine ways (never finding the end of speech, leaving the microphone open, sending the whole recording, not merging doubled phrases, keeping iPhone listening continuous, not stopping Petey's audio, throwing the answer away on the second tap, keeping sound tags in the text, accepting files that are not WAV recordings) and each one made the intended checks fail; the code was then put back.
- The three original prototype test suites (22, 27 and 28 checks) give the same results as before on this build, and the older shared-code mode still passes its own 30-check browser test.

**Not checked: please verify**

- **How the real model behaves with the shorter instructions.** Everything above checks what the app sends and how it reacts. I have not run a real planning conversation, so I do not know how many questions Petey actually asks for the crane-and-transformer scope, whether he keeps to two sentences, or whether "anything not named counts as in place" lets a hazard slip past when a foreman just says "yeah, all good" to the sweep. Run that scope again and see.

- **A real Supabase project and a real Vercel deployment of this version.** The stand-in Supabase answers the way I understand the real one does (checked against the installed client library's code), but I have not talked to the real thing.
- **Dashboard button names.** See the notes in section 1. "Add user > Create new user" and "Auto Confirm User" come from a community report, not current documentation.
- **Error codes from Supabase's sign-in.** The app recognises a wrong password by the code `invalid_credentials` or the words "invalid login credentials". If the real service words it differently, the person would see a generic "Could not sign in" message plus Supabase's own text.
- **A real iPad or iPhone for signing.** Finger drawing was tested with the browser's simulated touch, not on Safari on a real device. I do not know how it feels on a real screen, how Safari treats the page while you draw (scrolling, zooming, the keyboard, Home Screen icon mode), or how a signature looks when printed. I wrote print styles (the add and sign controls are hidden, the crew and signatures print) but did not test printing. Saying names aloud is as unreliable as any speech recognition with unusual names, which is why the list is editable and Petey asks you to check the spelling.
- **A phone shows a wider top bar to people with more than one role.** Found while testing: for a safety or construction administrator the three-view switcher makes the prototype's top bar wider than a phone screen. A foreman's view is not affected. This came with the prototype and I have not changed it.
- **Real ElevenLabs and a real iPhone.** Nothing here has been run against the real ElevenLabs service, with real speech, or on a real iPhone. See section 3 for the list of what that leaves unknown (whether ElevenLabs accepts the exact requests, whether the default voice ID exists on your account, how accurate and how fast the listening is on a noisy site, how iOS treats the microphone and speaker). The numbers for cost are from a page I read through a translation and must be confirmed.
- **A live Anthropic call and Vercel details**, as before: that the functions run as written with `"type": "module"`; that `maxDuration: 60` in `vercel.json` is allowed on your plan (if the deploy complains, lower or delete that block); and that request bodies over roughly 4.5 MB are refused. Check Vercel's current docs.
- **The model, and thinking.** The prototype asked for `claude-sonnet-4-6`. The proxy defaults to `claude-sonnet-5-5`. Anthropic's docs say that model "thinks" by default and that thinking counts against `max_tokens`, which made Petey's replies come back cut off or empty. The proxy now sends `thinking: {"type": "between_tools"}` (the lowest setting the docs name for this model; it rejects `disabled`), and if Anthropic ever refuses that setting the proxy repeats the request without it. The app also refuses to show a reply that hit its limit or is empty, and says "send that again". I could not call the live service from here, so the real effect is **unconfirmed until you try it**. The docs also say Sonnet 5.5 produces about 30 percent more tokens for the same text, so the limits for the written plan were raised (6000, and the server ceiling to 8192). Long plans take longer to write; if Vercel stops a request, `maxDuration` in `vercel.json` (60 seconds) may need raising on a plan that allows it. If you set `ANTHROPIC_MODEL` to a different model, check that model's thinking default in Anthropic's docs, because the proxy only adjusts `claude-sonnet-5-5`.

**Known limits of this stage**

- The **Safety Admin and Construction Admin dashboards still show the prototype's sample crew data**. Only plans are saved and role-protected so far.
- **The knowledge base is saved (with sign-in on).** Incident reports, root cause analyses, policies, procedures and revised drawings that a Safety Admin (any kind) or a Construction Admin (drawings only) uploads are saved in the `kb_entries` table and shared with everyone in the company. Foremen read them but cannot change them. Everyone's list refreshes every minute, when the tab comes back, and just before each planning-conversation question (at most every 10 seconds), so a revision uploaded a moment ago is not missed. **Remove** hides an entry for everyone but keeps it in the database. Each card says whether it is saved, saving, NOT saved (with Try again), or kept in this tab only (sign-in off). With sign-in off nothing is saved, as before. Entry text is now shown as plain text, never as page code, because it is shared. The original sample incidents inside the app (the ones with replays) are still built in, not stored. A "methodology template" RCA is still remembered only on the device that uploaded it. Run `supabase/setup.sql` again once to add the `kb_entries` table to an existing project.
- **Safety alerts are in-app only.** When a hazard is flagged and someone is signed in, it is saved to the safety inbox (the `alerts` table). Every signed-in **Safety Admin** sees it in the account menu (red count), in the tab title and in a banner, but **only while the app is open** and the check runs every 30 seconds. It is not emailed, texted or pushed, and the crew supervisor is not told by the app. For anything urgent the foreman must still tell people directly. Texting would need a provider and carrier registration (TCR for 10-digit numbers), which is not set up. With **sign-in off** (shared access code) there are no accounts to deliver to, so a flag shows on screen only and the app says so. If the inbox cannot be reached the app says "NOT delivered" and keeps the warning on screen. Petey is told to say the same. The scripted guided demo still shows its original "Escalation sent" scene. Run `supabase/setup.sql` again once to add the `alerts` table to an existing project.
- **The knowledge base is not saved per company yet** (stage 2), and it is sent to the AI inside the prompt, so very large libraries will need real search later.
- A plan opened from the offline cache or built on the offline form is treated as a new plan the first time it is changed. It never overwrites a saved one.
- On a new device the first sign-in shows the prototype's five short setup questions (they can be skipped).
- **No "change my password", no self-service password reset, and no screen for approving people.** Use the Supabase dashboard and the SQL above.
- **Voice** (section 3): without the optional ElevenLabs setup Petey uses the device's own voice. Even with it there is no hands-free phone mode, and I have not identified the narrator voice from the walkthrough video.
- Offline caching does not work as a web app (the prototype's service worker was created from inline text, which browsers refuse on a real website; it needs a real `public/sw.js`). Fonts load from Google Fonts, so the first load needs internet.
- The prototype's JavaScript is kept as it was (not broken into React components). It can be converted screen by screen later.
