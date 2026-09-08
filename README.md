# Flappy Monster

A classic Flappy Bird game built with **React**, **TypeScript**, and **Vite**. Rendered on an HTML5 canvas with a custom game loop.

## Features

- 🎮 Classic flap-jump gameplay — tap, click, or press **Space** to flap
- 📊 Persistent best score (saved in `localStorage`)
- 🏅 Medal system at 10 / 20 / 30 / 40 points
- 🐤 Animated bird (wing flap, velocity-based rotation)
- 🌤️ Scrolling sky, clouds, hills, and detailed pipes
- 📱 Full-screen, responsive canvas that fits any screen

## Getting Started

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (default `http://localhost:5173`).

## Scripts

| Command          | Description                |
| ---------------- | -------------------------- |
| `npm run dev`    | Start the dev server       |
| `npm run build`  | Type-check & build for prod |
| `npm run preview`| Preview the production build |
| `npm run lint`   | Run the linter             |

## How to Play

Tap, click, or press **Space** to make the bird flap. Guide it through the gaps between the green pipes. Each pipe you clear scores one point. Hitting a pipe, the ground, or the ceiling ends the game.
