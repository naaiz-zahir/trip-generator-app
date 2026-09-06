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

There is no server. `database.json` in this repository is the shared list, and everyone reads from it.

**Reading needs no setup.** Whoever opens the app gets the current lists, and the app re-checks for changes whenever the tab is brought back into view, so a name added by one person appears for the rest without anyone reloading.

**Adding for everyone needs a token.** A static site cannot commit on an anonymous visitor's behalf, so the person adding must supply GitHub credentials of their own:

| | Sees everyone's entries | Can add for everyone |
|---|---|---|
| **No token** | Yes, always current | No — additions stay on that device |
| **Token connected** | Yes | Yes, committed to `database.json` |

Without a token an addition still works immediately on that device, and the badge shows how many entries have not been shared yet (`● 2 not shared`). They stay on top of the shared list until someone with a token adds them properly, at which point they merge in without duplicating.

The badge always says which mode is active: `● Reading shared list`, `● N not shared`, `● Shared`, or `○ Offline` when the app is showing a cached copy.

### Giving someone add-for-everyone rights

1. They create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new):
   - **Repository access:** only this repository
   - **Permissions:** Repository permissions → **Contents: Read and write**
2. In the app: **⚙ Data** → paste the token → **Connect**.

Give each person their own token so one can be revoked without disturbing the others. The token is validated before it is stored, kept in that browser's `localStorage`, never committed, and sent nowhere but `api.github.com`. Anyone who can use that device can read it, so avoid shared machines.

> **⚠️ A Contents: Read and write token can change any file in the repository, not just `database.json`.** Hand one out only to people trusted with the app's source, and prefer letting one or two people do the adding for the rest.

Simultaneous edits are safe: a save that collides with someone else's commit is retried once against the newer file, taking the union of both sides, so nobody's addition is overwritten.

Deleting a shared entry requires a token — without one, a removal made in the JSON editor reappears on the next load, because the shared copy is the base. The editor says so when it happens.

> **⚠️ This repository is public.** Everything in `database.json`, crew phone numbers included, is readable by anyone via the repo and the Pages site, and stays in git history permanently. Making the repository private later hides it from that point on but does not retract copies already taken.

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
