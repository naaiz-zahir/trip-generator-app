// ── Firebase project settings ─────────────────────────────────────────────────
// Paste the config object from the Firebase console here:
//   Project settings → General → Your apps → Web app → SDK setup → Config
//
// These values are NOT secrets. Firebase web config is meant to be public; what
// protects the data is the security rules on the database, not hiding this file.
// See README.md → "Setting up Firebase" for the rules to apply.
//
// While databaseURL is left blank the app runs in read-only mode: everyone still
// sees the list committed in database.json, but additions stay on their device.

const FIREBASE_CONFIG = {
    apiKey:      "",
    authDomain:  "",
    databaseURL: "",   // https://<project-id>-default-rtdb.<region>.firebasedatabase.app
    projectId:   "",
    appId:       ""
};
