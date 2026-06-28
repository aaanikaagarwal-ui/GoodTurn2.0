# GoodTurn

A neighborhood help platform that connects **volunteers** with verified local
residents for small jobs — yard work, tech help, tutoring, pet care, grocery runs.
Anyone can volunteer; for volunteers **under 18**, a parent/guardian is built into
every step (approval, message visibility, check-ins, distance & category limits).

**Tech:** vanilla HTML / CSS / JavaScript (no framework, no bundler) on the front end,
**Firebase** (Authentication + Cloud Firestore) on the back end. Deployable as a
static site to Netlify.

---

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Landing / marketing home |
| `about.html`, `how-it-works.html`, `safety.html`, `contact.html` | Marketing pages |
| `login.html` | Sign in / sign up / password reset |
| `app.html` | The signed-in app (job board, dashboards, messages, leaderboard, profile) |
| `404.html` | Not-found page (served automatically by Netlify) |
| `app.js` | Shared application logic (Firebase, data layer, all screens) |
| `styles.css` | Shared styles |
| `firebase-config.js` | **Your Firebase keys — gitignored**, created from `firebase-config.example.js` |
| `firestore.rules` | Firestore security rules |
| `generate-config.js` | Build step that writes `firebase-config.js` from env vars (Netlify) |

`goodturn.html` is the original single-file prototype, kept for reference.

---

## Run locally

1. Copy the config template and fill in your Firebase web-app config:
   ```bash
   cp firebase-config.example.js firebase-config.js
   ```
   (See **FIREBASE_SETUP.md** for how to create the Firebase project, enable
   Email/Password auth, create Firestore, and publish the rules.)

2. Open `index.html` in a browser, or serve the folder with any static server, e.g.:
   ```bash
   npx serve .
   ```

`firebase-config.js` is gitignored, so your keys are never committed.

---

## Deploy to Netlify

1. Push this repo to GitHub.
2. In Netlify: **Add new site → Import from Git**, pick the repo.
3. Build settings (Netlify reads `netlify.toml`, but to confirm):
   - **Build command:** `node generate-config.js`
   - **Publish directory:** `.`
4. Add your Firebase config as **environment variables**
   (Site settings → Environment variables):
   ```
   FIREBASE_API_KEY
   FIREBASE_AUTH_DOMAIN
   FIREBASE_PROJECT_ID
   FIREBASE_STORAGE_BUCKET
   FIREBASE_MESSAGING_SENDER_ID
   FIREBASE_APP_ID
   FIREBASE_MEASUREMENT_ID   (optional)
   ```
   The build step writes these into `firebase-config.js` at deploy time.
5. **Deploy.** Then, in the Firebase console:
   - **Authentication → Settings → Authorized domains** → add your Netlify domain
     (e.g. `your-site.netlify.app`), or auth will be blocked.
   - Make sure Email/Password sign-in is enabled and `firestore.rules` is published.

---

## Security notes

- Firebase web config keys are **not secrets** — they identify your project and are
  meant for client code. Your data is protected by `firestore.rules` and the
  authorized-domains list. Keeping the config out of the repo (via env vars) is good
  hygiene, not a hard requirement.
- The shipped Firestore rules allow any **signed-in** user to read/write the shared
  collections (the app's guardian/admin features rely on cross-user reads). Tighten
  them before a wide public launch — see **FIREBASE_SETUP.md → Hardening**.
- The wallet/escrow is **mock** (numbers in Firestore). For real money, integrate
  Stripe via a server/Cloud Function — never move funds from client code.
- Demo "Try a demo" logins use public credentials and seed sample data; remove them
  for a strict production launch.

🤖 Built with [Claude Code](https://claude.com/claude-code)
