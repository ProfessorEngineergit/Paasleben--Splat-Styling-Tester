# Splat Styling Tester

Kleine Vite+TypeScript Web-Demo, um eine lokale `.splat`-Szene als art-directed Schwarzweiß-/Editorial-Style-Lab zu betrachten.

## Setup

```bash
npm install
npm run dev
```

Danach im Browser die angezeigte lokale URL öffnen.

## Deployment (GitHub Pages via Actions)

- Workflow: `.github/workflows/deploy.yml`
- Build & Deployment laufen automatisch bei Push auf den Default-Branch (oder manuell via `workflow_dispatch`).
- In GitHub unter **Settings → Pages → Build and deployment** die Quelle auf **GitHub Actions** stellen.

## Splat-Datei austauschen

Standardpfad:

- `public/scene.splat`

Konfiguration:

- `src/config.ts` → `SCENE_SPLAT_PATH`

## Features

- Lokales Laden einer `.splat`-Datei im Browser via `@mkkellogg/gaussian-splats-3d`
- Orbit-Inspektion (Zoom/Pan/Rotate)
- 5 Presets: **Ink**, **Paper**, **Fog**, **Night Editorial**, **Sketch**
- Live-Control-Panel (lil-gui) für Kamera, Splat-Look, Atmosphäre und Komposition
- Bounds-basierte Randbehandlung (Edge Fade/Fog) zur Vermeidung harter Scene-Cut-Kanten
- Atmosphärische Layer (subtile Haze/Cloud-Bänder)
- Intro-Overlay, Preset-URL-Param (`?preset=Ink`), Fullscreen, Screenshot, JSON-Copy

## Projektstruktur

- `src/main.ts` – Entry Point
- `src/app.ts` – App-Orchestrierung, Preset-Handling, UX-Overlay
- `src/config.ts` – Pfad zur `.splat`-Datei
- `src/scene/`
  - `splatExperience.ts` – Renderer/Kamera/Controls + Splat-Integration
  - `bounds.ts` – Bounds-Ermittlung aus Splat-Zentren
  - `atmosphereLayers.ts` – optionale Haze/Cloud-Layer im 3D-Raum
- `src/render/postProcessor.ts` – Render-Pipeline (RenderPass + ShaderPasses)
- `src/shaders/`
  - `styleShader.ts` – Kontrast/Brightness/Gamma/Saturation/Monochrom/Invert/Posterize/Tints
  - `atmosphereShader.ts` – Fog, Edge Fade, Horizon Haze, Grain, Vignette, subtile Cloud-Mischung
- `src/presets/`
  - `types.ts` – Style-Settings-Typen
  - `presets.ts` – editierbare Preset-Objekte
- `src/ui/controlPanel.ts` – lil-gui UI
- `public/scene.splat` – austauschbare Szene

## Hinweise

- Fokus ist eine kuratierte, atmosphärische Demo für Desktop.
- Wenn die Szene sehr groß ist, kann die Initial-Ladezeit steigen.
- Für neue Looks einfach ein weiteres Preset in `src/presets/presets.ts` ergänzen.
