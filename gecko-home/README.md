# 🦎 Gecko Home

A single-player 3D leopard gecko enclosure game built with **TypeScript + Three.js + Vite**.

## Quick Start (VS Code)

```bash
cd gecko-home
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

## Controls

| Action | Input |
|---|---|
| Orbit camera | Left mouse drag |
| Zoom | Scroll wheel |
| Pan camera | Right mouse drag |
| Enter place mode | Click item type in panel |
| Place item | Click inside enclosure |
| Select placed item | Click item (place mode OFF) |
| Move selected | Arrow keys |
| Rotate selected | Q / E |
| Delete selected | Delete / Backspace |
| Exit place mode | Escape |

## Features

- **Movable camera** — orbit, zoom, pan with OrbitControls
- **Leopard gecko NPC** — animated body, legs, tail; picks random placed items to walk to
- **8 placeable items** — Sleeping Hide, Water Dish, Food Bowl, Climbing Branch, Cork Bark, Ramp, Stone, Leaf Decor
- **Ghost preview** — shows valid (white) / invalid (red) placement before clicking
- **Enclosure resizing** — live sliders for width, depth, height; items clamp to new bounds
- **Item editing** — select, move (arrow keys), rotate (Q/E), delete placed items

## Build for production

```bash
npm run build
# Output in dist/
npm run preview  # preview the built site
```

---

## Deploy to GitHub Pages

### Step 1 — Create a GitHub repository

1. Go to https://github.com/new
2. Create a new repo, e.g. `gecko-home`
3. Push this project:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/gecko-home.git
git push -u origin main
```

### Step 2 — Enable GitHub Pages

1. In your repo, go to **Settings → Pages**
2. Under **Source**, select **GitHub Actions**
3. Save

### Step 3 — Push triggers the deploy

The included `.github/workflows/deploy.yml` runs automatically on every push to `main`.

It will:
1. Run `npm ci`
2. Run `npm run build` (outputs to `dist/`)
3. Upload `dist/` as a GitHub Pages artifact
4. Deploy it

### Step 4 — View your live site

After the Action completes (usually ~1–2 minutes), your site is live at:

```
https://<YOUR_USERNAME>.github.io/gecko-home/
```

> **Note:** `vite.config.ts` already uses `base: './'` which produces relative asset paths compatible with GitHub Pages subdirectory hosting. No changes needed.

### Updating the site

Every `git push` to `main` triggers a new deploy automatically.

---

## Project Structure

```
gecko-home/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions deploy
├── public/                     # Static assets
├── src/
│   ├── gecko/
│   │   └── Gecko.ts            # Gecko mesh + AI state machine
│   ├── items/
│   │   ├── ItemTypes.ts        # Item enums + mesh factories
│   │   └── ItemManager.ts      # Placement, selection, editing
│   ├── scene/
│   │   ├── SceneSetup.ts       # Three.js scene, camera, lights, OrbitControls
│   │   └── Enclosure.ts        # Enclosure walls, floor, bounds, resize
│   ├── ui/
│   │   └── UI.ts               # HTML overlay UI, keyboard bindings
│   ├── main.ts                 # App entry point, game loop
│   └── style.css               # UI styles
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```
