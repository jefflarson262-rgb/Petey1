# PreTaskIQ web app

PreTaskIQ prototype (Petey, the pre-task hazard analysis companion) as a Vite + React project you can put online.

- **Behavior is the same as the prototype.** Screens, Petey's planning interview, STKY ("Stuff That Can Kill You"), the knowledge base, RCA assistant, reenactments and demos were moved over, not rewritten.
- **One real change:** the prototype called Claude straight from the browser, which only works inside Claude. Here the browser calls a small server function (`api/claude.js`) that holds your API key. Visitors must enter an **access code** before the live AI answers.

Not tested: a real deployment on Vercel and calls to the live Anthropic API. Everything was tested locally against a stand-in for Anthropic. Details are under "What was and wasn't checked" below.

---

## 1. Put it online (Vercel)

You need: a free GitHub account, a Vercel account, and an Anthropic API key (from the Anthropic Console).

1. **Put this folder on GitHub.** Create a new *private* repository and upload the contents of this folder. Do **not** upload `node_modules`, `dist` or any `.env` file (the included `.gitignore` already excludes them).
2. **Import it in Vercel.** In Vercel choose *Add New > Project*, pick the repository. Vercel should detect Vite on its own. If it asks: build command `npm run build`, output directory `dist`.
3. **Add two environment variables** before the first deploy (Project Settings > Environment Variables):

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your Anthropic API key |
   | `ACCESS_CODE` | a code you invent, hard to guess. Share it only with testers. |
   | `ANTHROPIC_MODEL` | *optional.* Leave empty to use `claude-sonnet-5-5` |

4. **Deploy.** Open the link Vercel gives you. The first time Petey needs the AI, the page asks for the access code. After that it remembers the code until the browser tab is closed.

**To change the access code later:** change `ACCESS_CODE` in Vercel, then redeploy. People with the old code are asked again.

The menu names above are from memory and Vercel changes its screens now and then. If something does not match, check Vercel's current documentation.

### Do these before you share the link

- **Set a spending limit in the Anthropic Console.** The access code is a gate, not a budget. Anyone who has it can use your credits, and there is no per-person rate limiting in this project.
- **The knowledge base is public.** The sample regulations, incidents and policies are built into the page, so anyone who can open the site can read them. The access code only protects the AI calls. Do not put real company incident data or confidential policies in this project unless the site itself is private (Vercel has options for protecting a whole deployment; check which plan they need).
- **Incidents INC-310 and INC-270** are drafted examples that need your safety lead's approval before crews see them.

---

## 2. Run it on your computer

You need Node.js 22.12 or newer (or 20.19 or newer).

```bash
npm install
cp .env.example .env.local      # then open .env.local and fill in the key and the access code
npm run dev                     # then open http://localhost:5173 in your browser
```

`npm run dev` also runs the proxy locally, so the AI works the same way it will online.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Builds the site into `dist/` |
| `npm run preview` | Serves the built site (the AI proxy is **not** included in this one; use `npm run dev` for that) |
| `npm test` | Runs the proxy tests (no network, no real key needed) |

---

## 3. What is in the folder

```
api/claude.js            the server proxy: checks the access code, adds the key, calls Anthropic
index.html               page shell, fonts, app icons
vercel.json              function timeout and two security headers
src/main.jsx, App.jsx    start-up; React draws the screens once, then the original scripts take over
src/markup/              the prototype's screens as separate HTML pieces (intro, onboarding, document, admin, ...)
src/styles/              the prototype's CSS, split into base, Petey, reenactment, STKY, access dialog
src/data/kb.json         the built-in knowledge base (regulations, incidents, RCAs, policies, procedures)
src/legacy/scripts/      the prototype's JavaScript, split into 28 files in the original run order
src/api/                 adds the access code to AI calls and opens the code dialog when needed
src/components/          the access-code dialog (React)
tests/proxy.test.mjs     15 tests for the proxy
public/                  favicon and home-screen icon
```

### What the proxy does and does not do

- Refuses to run (503) if the key or the access code is missing.
- Rejects wrong or missing access codes (401) before anything is sent to Anthropic.
- Sends Anthropic only the messages, the system prompt and a token limit (capped at 4096). The model is chosen on the server; the browser cannot pick a model, turn on tools, or ask for streaming.
- Never returns the key. Anthropic's own error messages are passed through so the app can show them.
- Does not store or log request contents. Vercel's platform has its own logs; check their documentation for what they keep.

---

## 4. What was and wasn't checked

**Checked here**

- The original browser tests for the prototype (22 + 27 + 28 checks, covering the planning flow, incident reenactments and STKY) give the same results on this Vite build as on the original single file.
- The proxy's 15 tests pass, and deliberately weakening the proxy (no access check, no token cap) makes the right tests fail.
- A browser test with the built site, the real proxy and a stand-in Anthropic server: dialog on first AI call, cancel, wrong code, right code, code remembered for the tab, rotated code asks again, key never present in the page or built files (30 checks, all passed).
- `npm run dev` serves the app and the proxy together.

**Not checked: please verify**

- **A real Vercel deployment and a real Anthropic call.** Expect to fix small things on the first deploy.
- **Vercel details I am not certain about:** that the `api/` function runs as written with `"type": "module"`; that `maxDuration: 60` in `vercel.json` is allowed on your plan (if the deploy complains, lower or delete that block); and that request bodies over roughly 4.5 MB are refused (large drawing or PDF uploads may fail). Check Vercel's current docs for each.
- **The model.** The prototype asked for `claude-sonnet-4-6`. I could not confirm that is still offered, so the proxy defaults to `claude-sonnet-5-5`, which is a behavior change from the prototype. Set `ANTHROPIC_MODEL` to use another model, and check the model name in Anthropic's current model list.

**Known limits of a faithful port**

- The prototype's JavaScript is kept as it was (not minified, not broken into React components). It works the same, but it is not yet "idiomatic React". It can be converted screen by screen later.
- Offline caching does not work. The prototype's service worker was created from inline text, which browsers refuse on a real website. It needs a real `public/sw.js` file.
- Fonts (Space Grotesk, Inter, JetBrains Mono) load from Google Fonts, so the first load needs internet.
