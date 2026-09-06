# Harbour Craft Message Generator App

A streamlined, mobile-friendly web application designed to generate standardized departure and arrival status updates for maritime operations, boat voyages, and dive trips. The application tracks crew compositions, diver registries, route metrics, and features a built-in time-based fuel calculation engine.

## 🚀 Features

- **Automated Message Formatting:** Instantly drafts clean text updates optimized for direct copy-pasting into communication logs or messaging groups.
- **Dynamic Divers List:** The `DIVERS LIST` block automatically hides itself from the final output if no divers are checked, ensuring zero empty spaces or unpopulated templates.
- **Smart UI Checklist Sorting:** Automatically groups and sorts **Boat Names**, **Crew Members**, and **Divers Registries** in ascending alphabetical (and numerical) order to make checklist selection rapid and efficient.
- **Hidden Contact Strings:** Stores raw data components containing phone numbers behind the scenes while displaying clean, professional names on the user interface checklists.
- **Time-Based Fuel Estimation Engine:** Utilizes an algorithm that calculates journey duration based on distance and speed, multiplying it by a maximum hourly fuel burn rate to derive optimal estimations.
- **Dual Message Copy System:** Generates separate **Departure** and **Arrival** status cards with dedicated clipboard utilities. The arrival log dynamically defaults to the active localized check-in time.
- **Live Shared Lists:** Boat, location, crew and diver lists are held in a Firebase Realtime Database and shared by everyone. Anyone can add a person from the app with no login or setup, and the change appears on every other open device within a second. The app falls back to the committed copy of `database.json` when offline.

---

## 🗂 How the data is stored

The shared lists live in a **Firebase Realtime Database**. Nobody needs a login, a token, or any setup: open the app and the current lists are there, and the **+** buttons add people for everyone. A change made on one phone appears on every other open device within a second.

`database.json` in this repository stays as the seed and the offline fallback. If Firebase is unreachable — or not configured yet — the app still runs off that committed copy, and anything added meanwhile is held on the device and uploaded automatically once the connection returns.

The badge under the title says which state the app is in:

| Badge | Meaning |
|---|---|
| `● Live` | Connected. Additions reach everyone immediately. |
| `● N not shared` | N entries are waiting on this device to upload. |
| `● Read only` | Firebase unreachable; showing the committed list. |
| `○ Offline` | Showing this device's cached copy. |
| `⚠ Not loaded` | Nothing could be loaded at all — check the connection and reload. |

---

## 🔧 Setting up Firebase

One-time, by one person. Everyone else just opens the app.

1. **Create the project** at [console.firebase.google.com](https://console.firebase.google.com) → Add project. Google Analytics is not needed.
2. **Create the database:** Build → Realtime Database → Create Database. Pick the region closest to you and start in **locked mode** — the rules below replace the defaults.
3. **Enable anonymous sign-in:** Build → Authentication → Get started → Sign-in method → Anonymous → Enable. This is what lets the rules require authentication without asking anyone to log in.
4. **Register a web app:** Project settings → General → Your apps → Web (`</>`). Copy the `firebaseConfig` object it shows you.
5. **Paste it into `firebase-config.js`** in this repository and commit. Paste the console's snippet as-is; either `firebaseConfig` or `FIREBASE_CONFIG` is accepted as the variable name. These values are *not* secrets — Firebase web config is meant to be public, and the rules below are what actually protect the data.
6. **Apply the security rules** under Realtime Database → Rules:

```json
{
  "rules": {
    "meta": {
      ".read": true,
      ".write": "auth != null && !data.exists()"
    },
    "lists": {
      ".read": true,
      "$category": {
        ".validate": "$category.matches(/^(boats|locations|crew|divers)$/)",
        "$entry": {
          ".write": "auth != null",
          ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 200"
        }
      }
    }
  }
}
```

These allow anyone to read, and any signed-in (anonymous) device to add or correct an entry. `meta/seeded` can only be written once, which is what stops two people opening the app simultaneously from seeding the lists twice.

On first run the app copies `database.json` into the database automatically, so the current roster carries over with no manual import.

**To confirm it worked:** open the app and check the badge under the title. `● Live` means everything is connected. `● Read only` means the app could not reach Firebase — check the browser console. The most common cause is anonymous sign-in not being enabled in step 3, which makes every write fail while reads still work.

> **⚠️ Anyone who can open the app can add and remove entries.** That is inherent to having no login. It suits an internal tool; it is not a permission system. If you later need one, replace anonymous sign-in with Google sign-in and change `auth != null` to check specific accounts.

> **⚠️ Crew phone numbers will be stored on Google servers** as well as in this public repository. If that is a problem, keep the numbers out of the crew entries.

---

## ✏️ Editing the lists by hand

Adding people is done from the app. For anything else — correcting a spelling, removing someone who has left, reordering — edit the database directly:

**[Firebase Console](https://console.firebase.google.com/) → your project → Build → Realtime Database → Data**

Expand `lists`, then the category. Click a value to edit it, use **+** to add a child, and **×** to delete one. Every open device updates within a second.

Entries are stored as `lists/<category>/<random-key>: "<value>"` rather than as an array, so two people adding at the same moment cannot overwrite each other. When adding by hand the key can be anything unique — only the value matters.

> **`database.json` in this repository is no longer the live data.** It is the seed the database was first populated from, and the fallback shown when Firebase is unreachable. Editing it does not change what the app shows. Update it only if you want to refresh that offline fallback.

To start the lists over from `database.json`, delete both the `lists` and `meta` nodes in the console and reload the app. Deleting `lists` alone also works: the seed claim in `meta` expires after a minute, so the next device to open the app re-seeds from the committed file.

---

## 🌐 Deploying to GitHub Pages

The app is static, so no build step is involved:

1. **Settings → Pages**
2. **Source:** Deploy from a branch
3. **Branch:** `main`, folder `/ (root)`

The site publishes at `https://naaiz-zahir.github.io/trip-generator-app/`. A commit made through the app triggers a Pages redeploy, which usually takes under a minute; devices with sync on read through the API and so see the change immediately, without waiting for that deploy.

---

## 📐 The Fuel Calculation Algorithm

Instead of computing consumption based on generic distance-to-burn ratios, this app uses a voyage duration workflow:

1. **Calculate Voyage Duration (Hours):**
   $$\text{Duration (hours)} = \frac{\text{Distance (nm)}}{\text{Speed (knots)}}$$

2. **Calculate Total Estimated Fuel (Liters):**
   $$\text{Fuel Consumed (L)} = \text{Duration (hours)} \times \text{Max Fuel Consumption Rate (L/h)}$$

*Note: Performance metric rows and Estimated Arrival Time calculations are entirely stripped from the final clipboard payload if the Distance or Speed inputs remain unentered or evaluate to zero.*

---

## 📁 File Structure

```text
trip-generator-app/
├── index.html          # Application interface layout, entry fields, and action buttons
├── style.css           # Responsive layouts, input grids, and status toast animations
├── app.js              # Core state management, text compiling, and calculation utilities
├── store.js            # Data layer: Firebase, offline cache, committed fallback
├── firebase-config.js  # Firebase project settings (public by design)
├── database.json       # Seed and offline fallback for the shared lists
├── .nojekyll           # Serves the files as-is on GitHub Pages
└── README.md           # Project documentation
