# Genetic Algorithms EDM Visualizer

Fullscreen audio-reactive Three.js visualizer featuring dragon + Perlin orbs, bloom, particles, and interactive camera/object controls.

## 1) Prerequisites

- macOS, Linux, or Windows
- A modern browser (Chrome recommended)
- One of:
  - Python 3 (for built-in local server), or
  - Node.js (optional alternative)

## 2) Open the project folder

From terminal:

```bash
cd "/Users/alex1602e19/Desktop/ML/genetic_algorithms_edm"
```

## 3) Start a local server

Use one option below (recommended: Python).

### Option A: Python (recommended)

```bash
python3 -m http.server 8000
```

### Option B: Node (if you prefer)

```bash
npx serve .
```

## 4) Open in browser

- If using Python: [http://localhost:8000](http://localhost:8000)
- If using `serve`: open the URL shown in terminal (commonly [http://localhost:3000](http://localhost:3000))

## 5) Controls

- `U` -> Upload and play an audio file
- `M` -> Use microphone input
- `Space` -> Play/Pause uploaded audio
- `1` -> Navigate camera to dragon scene
- `2` -> Navigate camera to lower scene
- Mouse drag -> Orbit/pan (and drag selected objects)
- Double-click object -> Recenter view to that object

## 6) Stop the server

In terminal running the server:

- `Ctrl + C`

## 7) Restart later (quick checklist)

1. Open terminal
2. `cd "/Users/alex1602e19/Desktop/ML/genetic_algorithms_edm"`
3. `python3 -m http.server 8000`
4. Open [http://localhost:8000](http://localhost:8000)
5. Press `U` to load music (or `M` for microphone)

## Troubleshooting

- **Page loads but no audio reaction**
  - Start audio using `U` (upload) or `M` (mic)
  - Click once in the page (browser audio permission/autoplay policies)
  - Make sure audio is actually playing (use `Space`)

- **Fonts not showing as expected**
  - Keep the `ASIX-FOUNDER` folder and font files in the project directory
  - Hard refresh browser (`Cmd + Shift + R`)

- **Nothing appears**
  - Confirm you opened through `http://localhost:...` (not `file://`)
  - Check terminal for server errors and restart
