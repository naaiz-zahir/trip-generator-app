# Harbour Craft Message Generator App

A streamlined, mobile-friendly web application designed to generate standardized departure and arrival status updates for maritime operations, boat voyages, and dive trips. The application tracks crew compositions, diver registries, route metrics, and features a built-in time-based fuel calculation engine.

## 🚀 Features

- **Automated Message Formatting:** Instantly drafts clean text updates optimized for direct copy-pasting into communication logs or messaging groups.
- **Dynamic Divers List:** The `DIVERS LIST` block automatically hides itself from the final output if no divers are checked, ensuring zero empty spaces or unpopulated templates.
- **Smart UI Checklist Sorting:** Automatically groups and sorts **Boat Names**, **Crew Members**, and **Divers Registries** in ascending alphabetical (and numerical) order to make checklist selection rapid and efficient.
- **Hidden Contact Strings:** Stores raw data components containing phone numbers behind the scenes while displaying clean, professional names on the user interface checklists.
- **Time-Based Fuel Estimation Engine:** Utilizes an algorithm that calculates journey duration based on distance and speed, multiplying it by a maximum hourly fuel burn rate to derive optimal estimations.
- **Dual Message Copy System:** Generates separate **Departure** and **Arrival** status cards with dedicated clipboard utilities. The arrival log dynamically defaults to the active localized check-in time.
- **Serverless Data Store:** Runs as a plain static site on GitHub Pages with no backend, no database and no third-party service. Crew, boat, location and diver lists are editable from inside the app and can be committed straight back to this repository.

---

## 🗂 How the data is stored

There is no server. The app reads and writes `database.json`, and each change lands in one of two places depending on whether GitHub sync is switched on.

| | Where changes go | Who sees them |
|---|---|---|
| **Sync off** (default) | `localStorage` in that browser | That device only |
| **Sync on** | A commit to `database.json` in this repository, via the GitHub REST API | Everyone, once Pages redeploys |

The badge under the app title always says which mode is active, and every save toast says where the change actually landed.

On a device with sync off, edits are still durable — they survive reloads and stay in the browser — they simply never leave that device. **Export** / **Import** in the Data panel moves a database between devices without a token.

### Turning on sync

1. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new):
   - **Repository access:** only `naaiz-zahir/trip-generator-app`
   - **Permissions:** Repository permissions → **Contents: Read and write**
2. Open **⚙ Data** in the app, paste the token, confirm the repository and branch, and press **Connect**.

The token is validated before it is stored, and it is kept in that browser's `localStorage` only — it is never committed and never sent anywhere but `api.github.com`. Anyone who can use that device can read it, so set it up only on personal devices, and give each person their own token so one can be revoked without affecting the rest.

Concurrent edits are handled: a save that collides with someone else's commit is retried once against the newer file, taking the union of both sides, so a change made elsewhere is never overwritten.

> **⚠️ This repository is public.** Anything saved to `database.json` — including crew phone numbers — is readable by anyone on the internet, both through the repo and through the Pages site. If that is not intended, either keep phone numbers out of the crew entries, or move this to a private repository (note that Pages on a private repo requires a paid GitHub plan).

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
├── index.html       # Application interface layout, entry fields, and action buttons
├── style.css        # Responsive layouts, input grids, and status toast animations
├── app.js           # Core state management, text compiling, and calculation utilities
├── store.js         # Data layer: localStorage, GitHub sync, conflict merging
├── settings.js      # Data panel: sync setup, JSON editor, export/import
├── database.json    # The shared lists (boats, locations, crew, divers)
├── .nojekyll        # Serves the files as-is on GitHub Pages
└── README.md        # Project documentation
