# Stock Night 🍸📈

A live "drink stock exchange" board for a bar. Prices drift up when a drink
sells and decay back toward normal when it doesn't — like a stock ticker —
but the system is **display and staff-tooling only**. It never charges a
customer or talks to the bar's POS; a bartender still rings up every sale on
the real POS at whatever price the board happens to be showing.

- **`/display`** — the ticker board. Put this on a TV over the bar. No login,
  read-only, updates in real time.
- **`/admin`** — bartender/manager dashboard. Requires sign-in.
- **`/login`** — staff sign-in.

## Why it's built this way

Two independent price floors are enforced in code, not by policy:

1. **Legal floor (NY SLA).** New York's State Liquor Authority treats a
   drink price under 50% of its "regularly charged price" as an attempt to
   circumvent the ban on unlimited-drinks-for-a-fixed-price promos. Every
   drink has a fixed `listPrice` (the posted menu price) that the pricing
   algorithm never touches — only a manager can change it, and every change
   is logged with a required reason.
2. **Cost floor (business).** `wholesalePrice` is what the drink actually
   costs the bar. The system won't let a price fall below cost even in
   cases where the legal floor alone would technically allow it.

The effective floor at any moment is **whichever of the two is higher**
(`server/src/complianceRules.js`). The ceiling is capped at 175% of list
price so prices can't run away indefinitely either.

Every price movement — a sale, a decay tick, a manager's edit — writes an
append-only audit log entry with a timestamp and cause. Price mutations run
inside Firebase Realtime Database transactions, so two bartenders tapping
"Sold one" on the same drink at the same instant both land correctly
instead of one silently overwriting the other.

**This is not legal advice.** Confirm actual practice — hours, promotions,
local rules — with a lawyer or the SLA before this touches real money.

## Roles

Two roles, stored at `staff/{uid}/role` in the Realtime Database:

| | bartender | manager |
|---|---|---|
| Tap "Sold one" to record a sale | ✅ | ✅ |
| View the display board | ✅ (no login needed) | ✅ |
| Add / delete drinks | ❌ | ✅ |
| Edit list price / wholesale cost | ❌ | ✅ (reason required, logged) |
| Reset a price / mark a drink 86'd | ❌ | ✅ |
| View the audit log | ❌ | ✅ |

There's no public sign-up. Accounts are created with a CLI script
(`server/scripts/createStaff.js`) run by whoever has server access —
intentionally, so a stranger can't register themselves into the system.

## Architecture

```
stock-night/
├── server/                  Node/Express API + pricing engine
│   ├── src/
│   │   ├── index.js          app entry, mounts routes, error handler
│   │   ├── auth.js           verifies Firebase ID tokens, checks role
│   │   ├── pricingEngine.js  pure functions: sale bump / decay / reset
│   │   ├── complianceRules.js  the legal + cost floor, all in one place
│   │   ├── firebaseStore.js  RTDB-backed store, transactional writes
│   │   ├── memoryStore.js    in-memory fallback for local dev
│   │   ├── store.js          picks Firebase or memory based on env vars
│   │   ├── decayLoop.js      background tick that drifts prices to rest
│   │   └── routes/           drinks.js, admin.js (audit), me.js
│   ├── scripts/createStaff.js  CLI to create/update a staff login
│   └── database.rules.json   RTDB security rules
└── client/                  Vite + React app
    └── src/
        ├── firebase.js       browser Firebase config (client-safe values)
        ├── authContext.jsx   React auth state + role, wraps the app
        ├── api.js            fetch wrapper, attaches the ID token
        └── pages/            Display.jsx, Admin.jsx, Login.jsx
```

Reads (`GET /api/drinks`, history) are public and unauthenticated — the
display board is a TV, nobody's logging into it. Every write goes through
Express, which is what applies the compliance clamp and writes the audit
trail; clients can never write to `drinks` directly (see
`database.rules.json` — everything except `drinks`/`drinkHistory` reads is
locked to server-only access via the Admin SDK, which bypasses these rules
entirely).

## Local development

### 1. Set up Firebase

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Build → Realtime Database → Create Database.**
3. **Build → Authentication → Sign-in method → enable Email/Password.**
   (If Authentication shows a "Get started" button, click it first —
   enabling Realtime Database doesn't automatically enable Auth too.)
4. **Project settings → Service accounts → Generate new private key.**
   That JSON has `project_id`, `client_email`, `private_key` — these go in
   `server/.env`.
5. **Project settings → General → Your apps → Add app → Web.** That config
   object's values go in `client/.env`.

### 2. Configure environment files

```bash
cp server/.env.example server/.env   # fill in the service account values
cp client/.env.example client/.env   # fill in the web app config
```

### 3. Run both sides

```bash
# terminal 1
cd server && npm install && npm run dev     # http://localhost:4000

# terminal 2
cd client && npm install && npm run dev     # http://localhost:5173
```

Without any `.env` files, both sides fall back to an **unauthenticated dev
mode** (in-memory data, everyone treated as manager) so you can poke at the
UI before Firebase is wired up. Don't use that mode for a real bar night —
no auth, no persistence.

### 4. Deploy the database rules

```bash
cd server
firebase login
firebase init database   # point it at your project, use database.rules.json
firebase deploy --only database
```

### 5. Create your first staff account

```bash
cd server
node scripts/createStaff.js you@thebar.com "somePassword123" manager
```
Swap `manager` for `bartender` for staff who should only record sales.
Password must be at least 6 characters (Firebase Auth minimum).

## Deploying a public demo

The client and server deploy separately — GitHub Pages only serves static
files, it can't run the Express API's `setInterval` decay loop.

**API → Render** (free tier, no card required, ~30–60s cold start after
idling):
1. New Web Service → connect the repo → root directory `server` → build
   `npm install` → start `npm start`.
2. Add the same env vars as `server/.env` (`FIREBASE_PROJECT_ID`,
   `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_DATABASE_URL`).
3. Confirm it's live: `https://your-service.onrender.com/api/health` should
   return `{"ok":true}`.

**Client → GitHub Pages:**
1. `cd client && npm install --save-dev gh-pages`
2. In `vite.config.js`, set `base: "/your-repo-name/"`.
3. In `client/.env`, set `VITE_API_BASE` to your Render URL + `/api` (not
   `localhost` — that only works on your own machine).
4. Add to `client/package.json`: `"predeploy": "npm run build"`,
   `"deploy": "gh-pages -d dist"`.
5. `npm run deploy`, then enable Pages in repo Settings → Pages, source =
   `gh-pages` branch.

**Before showing it to anyone:** hit `/api/health` a few minutes early to
wake Render up, and seed a few drinks via `/admin` so the board isn't empty.

## Known gotchas (things that have actually gone wrong)

- **`firebase deploy` tries to deploy Data Connect and fails.** You didn't
  ask for Data Connect; `firebase init` scaffolded it anyway. Run
  `firebase deploy --only database` to skip it, or delete the
  `dataconnect` block from `firebase.json` entirely.
- **`firebase deploy --only database` says "No targets in firebase.json
  match."** Your `firebase.json` needs a `database` block pointing at the
  rules file's actual path, e.g. `{ "database": { "rules":
  "server/database.rules.json" } }`.
- **Deployed rules show `{ ".read": false, ".write": false }` instead of
  the real rules.** The path in `firebase.json` pointed at a different
  (blank, auto-generated) rules file than the one in this repo. Fix the
  path, redeploy.
- **`auth/configuration-not-found` from `createStaff.js`.** Authentication
  itself isn't enabled for the project yet — separate from Realtime
  Database. Firebase console → Authentication → Get started → enable
  Email/Password.
- **"Missing Authorization header" / role shows "no role" after signing
  in.** Almost always a stale deploy: either the server on Render doesn't
  have the latest `auth.js`/`routes/me.js` (push + let Render redeploy), or
  the client's built bundle predates the auth-token-provider fix in
  `authContext.jsx` (rebuild with `npm run deploy`, then hard-refresh —
  browsers cache old JS aggressively).
- **"Failed to fetch" on the deployed site.** The client is trying to
  reach `localhost:4000` because `client/.env`'s `VITE_API_BASE` still had
  its local default when you last ran `npm run deploy`. `VITE_*` values are
  baked into the build at build time — editing `.env` alone doesn't update
  an already-deployed site; you have to rebuild and redeploy.
- **A file named `firebase.js` ends up in `server/src/` instead of
  `client/src/`.** These are two different files with the same name and
  very different jobs — the client one holds public web config for the
  browser SDK, the server one (`firebaseStore.js`, not `firebase.js`) sets
  up the Admin SDK with service-account credentials. If one ends up in the
  wrong folder, imports break in confusing ways on both sides.
