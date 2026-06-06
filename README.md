# 🧩 HappyTiles

Ad-free, offline-friendly **Progressive Web App** of simple games for kids:

- **Shape Sudoku** — kid-friendly 4×4 (and 6×6) with colorful shapes or numbers, instant error checking, undo, and a new-puzzle button.
- **Slide Puzzle** — a 3×3 sliding-tile puzzle with built-in pictures, an optional number overlay, shuffle, and a move counter.

**Built for kids and parents who care about privacy:**

- 🚫 No ads, no analytics, no trackers, no third-party cookies.
- 📴 Works **fully offline** after the first load (installable PWA).
- 🌐 No network requests to anyone after load — everything is local.
- ♿ Accessible: WCAG-AA contrast, visible focus, keyboard-playable, respects *reduced motion*.
- 📱 Mobile-first, big touch targets (48×48px min), responsive on phones / tablets / iPads.
- 🛠️ Zero build step, zero npm, zero frameworks — just static HTML/CSS/JS.

---

## 📁 Project layout

```
HappyTiles/
├─ src/                  ← the entire app lives here (deploy this folder)
│  ├─ index.html
│  ├─ style.css
│  ├─ app.js
│  ├─ manifest.json
│  ├─ sw.js              ← service worker (offline cache)
│  └─ icons/icon.svg
├─ docs/
│  ├─ ARCHITECTURE.md
│  └─ DECISIONS.md
├─ .github/workflows/deploy.yml   ← optional one-click GitHub Pages deploy
└─ README.md
```

---

## ▶️ Run it locally

A service worker needs to be served over `http://` (not opened as a `file://` path),
so use any tiny static server. Pick whichever tool you already have:

### Option A — Python 3
```bash
cd src
python -m http.server 8000
```
Then open <http://localhost:8000>

> On Windows the `python` command may open the Microsoft Store. If so, install Python
> from <https://python.org> (tick "Add to PATH"), or use one of the options below.

### Option B — Node.js
```bash
cd src
npx serve .          # or:  npx http-server -p 8000
```
Then open the URL it prints.

### Option C — VS Code
Install the **Live Server** extension, right-click `src/index.html` → **Open with Live Server**.

To install as an app, use your browser's **Install / Add to Home Screen** option.

### "I edited a file but the browser shows the old version!"

This is the service worker doing its job (cache-first = offline support), but it makes
code edits invisible until the cache updates. Two things handle this:

1. **On localhost the service worker is disabled automatically.** The app detects
   `localhost`/`127.0.0.1`/`file:` and unregisters any SW + clears its caches, so a normal
   reload always shows your latest code. (Trade-off: to test *offline* behavior, do it on a
   deployed URL, or temporarily comment out the `isLocalDev` branch in `app.js`.)
2. **One-time cleanup** if you're still seeing the old version (the old SW is already
   installed and is serving the old `app.js`, which doesn't yet contain the auto-disable
   code). Do ONE of these once:
   - DevTools (F12) → **Application** → **Storage** → **Clear site data**, then reload; or
   - DevTools → **Application** → **Service Workers** → **Unregister**, then reload; or
   - Hard-reload a couple of times: **Ctrl+Shift+R**.

   After that one cleanup, plain reloads always reflect your edits on localhost.

**Pro tip for active development:** in DevTools → **Application** → **Service Workers**, tick
**“Update on reload”**, and in the **Network** tab tick **“Disable cache.”** With those on,
every reload fetches fresh files regardless of any service worker.

To test **offline mode** (on a deployed URL): load once, then DevTools → *Network* →
**Offline** (or turn off Wi-Fi) and reload — it still works.

---

## 🚀 Deploy (free static hosting)

The app is the contents of the **`src/`** folder. There is nothing to build.

### Netlify (easiest)
1. Push this repo to GitHub (or drag-and-drop the `src` folder at <https://app.netlify.com/drop>).
2. For a Git-connected site, in **Site settings → Build & deploy**:
   - **Build command:** *(leave empty)*
   - **Publish directory:** `src`
3. Deploy. Done — Netlify serves `src/` as the site root, so all paths work.

### GitHub Pages

**Easiest — use the included Action (recommended):**
1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included `.github/workflows/deploy.yml` publishes the `src/` folder automatically on
   every push to `main`. Your site appears at `https://<user>.github.io/<repo>/`.

**Manual alternative (no Actions):** GitHub Pages can only serve from the repo root or a
`/docs` folder, so copy the contents of `src/` into one of those, then **Settings → Pages →
Deploy from a branch** and pick that folder.

> All asset paths in the app are **relative** (`./style.css`, `./app.js`, …), so it works
> whether it's served from a domain root or a `/<repo>/` subpath.

---

## 🔄 Releasing updates

The service worker caches the app. When you change any file, **bump the cache version** so
visitors get the update:

- Edit `src/sw.js` → change `const CACHE_VERSION = 'happytiles-v1';` to `v2`, `v3`, …

Old caches are cleaned up automatically on the next load.

---

## 🧪 Testing

The pure game logic (Sudoku generation/validation, sliding-puzzle moves/solvability)
lives in `src/games-core.js`, separated from the DOM so it can be tested directly.
One shared suite (`tests/smoke-tests.js`) runs in **three** ways — pick whatever you have:

**In a browser (zero install):**
serve the project and open `tests/index.html` — you'll see a green/red pass list.

**With Node.js:**
```bash
node tests/run-node.js
```

**On Windows with no installs at all** (uses the built-in Windows Script Host):
```powershell
cscript //nologo tests\run-cscript.js
```

All three report the same result. Current status: **13 passed, 0 failed.** The suite covers:

- Sudoku: generated 4×4 / 6×6 solutions are fully valid; puzzles dig exactly the
  configured number of holes; every dug puzzle is still solvable; conflict detection
  catches row/column/box duplicates; solved/incomplete detection.
- Puzzle: solved-board shape; neighbor calculation; **shuffles are always solvable and
  never start pre-solved**; parity check rejects unsolvable boards; a real slide
  sequence reaches the solved state.

Runners exit non-zero on failure, so `node tests/run-node.js` drops straight into CI.

## 🔒 Privacy & safety

HappyTiles is designed to be safe for children (COPPA / GDPR friendly): it collects nothing,
sends nothing, shows no ads, and has no outbound links. The only thing it stores is a few
**local** preferences (sound on/off, chosen grid size, etc.) in your browser's `localStorage` —
that never leaves the device.

---

## 🧩 How to play

**Sudoku** — Tap an empty square, then tap a shape (or number) below to place it. Each shape can
appear only once per row, column, and box. Conflicts flash red. Use **Undo** to step back, the
**🔷/🔢** button to switch shapes/numbers, **4×4 / 6×6** to change size, and **New** for a fresh puzzle.

**Slide Puzzle** — Tap a tile next to the empty gap (or use the **arrow keys**) to slide it. Rebuild
the picture! Use **Picture** to change the image, **Numbers** to show/hide the number hints, and
**Shuffle** to start over.
