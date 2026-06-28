// Build step (run by Netlify): writes firebase-config.js from environment variables
// so your Firebase keys live in Netlify's settings, not in the Git repo.
//
// Set these in Netlify → Site settings → Environment variables:
//   FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
//   FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID
//   (optional) FIREBASE_MEASUREMENT_ID
const fs = require('fs');

const cfg = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};
if (process.env.FIREBASE_MEASUREMENT_ID) cfg.measurementId = process.env.FIREBASE_MEASUREMENT_ID;

const ok = cfg.apiKey && cfg.projectId;

// Don't clobber an existing local firebase-config.js when env vars aren't set
// (e.g. running this locally during development).
if (!ok && fs.existsSync('firebase-config.js')) {
  console.log('[generate-config] env vars missing but firebase-config.js exists — leaving it as is.');
  process.exit(0);
}

if (!ok) {
  console.warn('\n[generate-config] WARNING: Firebase env vars not set — writing a placeholder.\n' +
    '  The deployed site will load but will NOT connect to Firebase until you add the\n' +
    '  FIREBASE_* environment variables in Netlify and redeploy.\n');
}

const placeholder = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

const out = 'window.firebaseConfig = ' + JSON.stringify(ok ? cfg : placeholder, null, 2) + ';\n';
fs.writeFileSync('firebase-config.js', out);
console.log('[generate-config] wrote firebase-config.js (' + (ok ? 'from env vars' : 'placeholder') + ')');
