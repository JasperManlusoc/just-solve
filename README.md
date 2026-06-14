# SolveForJas 🧮⭐

A colorful, playful math survival game PWA for kids aged 3–10. Built with pure HTML, Tailwind CSS (via CDN), and vanilla JavaScript — no frameworks, no backend.

## Features

- 5 math categories: Addition, Subtraction, Multiplication, Division, Mixed
- 3 difficulty modes: Easy (10s), Medium (7s), Hard (5s)
- Infinite procedural difficulty scaling
- Custom on-screen numeric keypad (no device keyboard)
- Persistent local leaderboard with filters
- Personal statistics dashboard (accuracy, streaks, personal bests)
- Sound effects with volume control (Web Audio API, no audio files)
- Confetti celebrations on level milestones
- Fully offline-capable via Service Worker
- Installable as a PWA ("Add to Home Screen")
- All data stored in `localStorage` — fully private, no server

## File Structure

```
solveforjas/
├── index.html          # App shell & all views (menu, game, leaderboard, stats...)
├── style.css           # Custom styles supplementing Tailwind
├── script.js           # All game logic (vanilla JS, modular sections)
├── manifest.json        # PWA manifest
├── service-worker.js    # Offline caching strategy
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-maskable-192.png
    └── icon-maskable-512.png
```

## Run Locally

Because the app uses a Service Worker, it must be served over `http://` (not `file://`). Any static server works:

```bash
cd solveforjas
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

## Deploy to GitHub Pages

1. Push this folder's contents to a GitHub repository (e.g. as the repo root, or inside a `/docs` folder).
2. In your repo settings, go to **Pages** → set the source branch and folder (e.g. `main` / root or `/docs`).
3. Wait for the deployment to finish — your app will be live at `https://<username>.github.io/<repo>/`.
4. Visit the URL on a mobile device and use "Add to Home Screen" to install it.

> **Note:** All paths in `index.html`, `manifest.json`, and `service-worker.js` use relative paths (`./`), so the app works correctly whether deployed at the domain root or in a subdirectory (typical for GitHub Pages project sites).

## Data Storage

All data is stored in the browser's `localStorage` under these keys:

- `sfj_leaderboard` — array of saved game results
- `sfj_stats` — aggregated lifetime statistics
- `sfj_settings` — sound on/off and volume preference

To reset all progress, use the "Reset All Data" button on the Stats screen, or clear site data in your browser.

## Customization

- **Colors / fonts**: edit the `tailwind.config` block at the top of `index.html` and the Google Fonts `<link>` tags.
- **Difficulty curve**: edit `getDifficultyRange()` and `getMaxTimeForLevel()` in `script.js`.
- **Scoring rules**: edit `CORRECT_BONUS` / `WRONG_PENALTY` constants in `script.js`.
