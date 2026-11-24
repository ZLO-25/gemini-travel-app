# AGENTS.md — AI Agent Instructions for `gemini-travel-app`

Welcome! This repository powers **VoyageOS · 通用旅遊助手**, a zero-build, offline-capable multi-trip PWA hosted on GitHub Pages.

## 🚨 Golden Rule: Pure Data-Driven Trip Onboarding (DO NOT Touch UI / Architecture!)

When the user asks you to **plan a new trip**, **import a trip**, or **modify an itinerary**:

1. **MUST READ FIRST**: Immediately read [`PROMPTS/ADD_NEW_TRIP.md`](PROMPTS/ADD_NEW_TRIP.md) and follow its 3-stage workflow strictly.
2. **INTERVIEW BEFORE GENERATING**: If the user only tells you a destination or partial info (e.g., *"我要去東京 6 天"*), **do NOT guess blindly** — ask concise clarifying questions for missing essentials (dates/duration, companions & expense-splitting members, self-drive vs transit, hotel style/budget, must-visit spots) as specified in `PROMPTS/ADD_NEW_TRIP.md`.
3. **ZERO UI / CODE MODIFICATIONS**:
   - **NEVER** modify `index.html`, `css/styles.css`, `js/app.js`, `js/map.js`, `js/sync.js`, `js/storage.js`, `js/auth.js`, `js/photos.js`, or `sw.js` when adding or editing trips.
   - To add a new trip, ONLY:
     1. Create `data/trips/trip_<slug>_<year>.json` following the schema in `PROMPTS/ADD_NEW_TRIP.md` (use `data/trips/trip_okinawa_2027.json` as your gold-standard reference).
     2. Register the new trip at the top of `data/manifest.json` (and optionally update `defaultTripId` if the user wants it selected by default).
     3. Run `python scripts/rebuild_seed.py` so the offline fallback bundle (`js/seed-bundle.js`) stays in sync.
     4. Commit and push to `main` when requested by the user.
