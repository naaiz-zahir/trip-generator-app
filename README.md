# Harbour Craft Message Generator App

A streamlined, mobile-friendly web application designed to generate standardized departure and arrival status updates for maritime operations, boat voyages, and dive trips. The application tracks crew compositions, diver registries, route metrics, and features a built-in time-based fuel calculation engine.

## 🚀 Features

- **Automated Message Formatting:** Instantly drafts clean text updates optimized for direct copy-pasting into communication logs or messaging groups.
- **Dynamic Divers List:** The `DIVERS LIST` block automatically hides itself from the final output if no divers are checked, ensuring zero empty spaces or unpopulated templates.
- **Smart UI Checklist Sorting:** Automatically groups and sorts **Boat Names**, **Crew Members**, and **Divers Registries** in ascending alphabetical (and numerical) order to make checklist selection rapid and efficient.
- **Hidden Contact Strings:** Stores raw data components containing phone numbers behind the scenes while displaying clean, professional names on the user interface checklists.
- **Time-Based Fuel Estimation Engine:** Utilizes an algorithm that calculates journey duration based on distance and speed, multiplying it by a maximum hourly fuel burn rate to derive optimal estimations.
- **Dual Message Copy System:** Generates separate **Departure** and **Arrival** status cards with dedicated clipboard utilities. The arrival log dynamically defaults to the active localized check-in time.

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
├── database.json    # Local fallback persistent store structure for backup configurations
└── README.md        # Project documentation
