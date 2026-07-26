// Hand-as-cursor control for the corgi rave wall.
//
// A glowing dot tracks your index fingertip. Pinch (thumb + index together) to
// click — on the canvas that orbits the camera exactly like a mouse drag, and
// on the on-screen buttons it fires real actions (text my friend / I'm ok).
//
// No mouse, no keyboard. Loaded lazily: nothing touches the camera until
// initGestures() runs, so the visualizer still works on a machine with no
// webcam.

const VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// MediaPipe hand topology.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const SKELETON = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

// Your hand never reaches the edges of the camera frame, so map a central box
// to the whole screen. Lower = less reach needed, twitchier.
const ACTIVE_BOX = { x: 0.62, y: 0.62 };
const SMOOTHING = 0.35;

// Pinch distance is measured relative to hand size, so it works at any
// distance from the camera. Hysteresis stops it flickering on the threshold.
const PINCH_ON = 0.42;
const PINCH_OFF = 0.58;

const ACTION_COOLDOWN_MS = 6000;

export const gestureState = {
  enabled: false,
  handPresent: false,
  pinching: false,
  intensity: 1, // kept so script.js's getEnergy() hook stays valid
  label: "",
  x: 0,
  y: 0,
};

let landmarker = null;
let video = null;
let overlay = null;
let overlayCtx = null;
let hud = null;
let cursor = null;
let panel = null;
let rafId = 0;
let lastVideoTime = -1;
let smoothed = null;
let wasPinching = false;
let lastActionAt = 0;
let activeTarget = null;
let backendBase = "http://localhost:3001";
let sessionId = null;
let onNextTrack = () => {};

function say(msg, isError = false) {
  console[isError ? "error" : "log"](`[hand] ${msg}`);
  if (hud) {
    hud.textContent = msg;
    hud.style.color = isError ? "#ffb4b4" : "#bfe3ff";
  }
}

/* ------------------------------------------------------------------ UI --- */

function buildUi() {
  hud = document.createElement("div");
  hud.style.cssText = `
    position:fixed; left:16px; bottom:16px; z-index:60;
    font:600 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
    color:#bfe3ff; letter-spacing:.08em; text-transform:uppercase;
    text-shadow:0 0 12px rgba(90,170,255,.65); pointer-events:none;`;
  document.body.appendChild(hud);

  // The cursor itself.
  cursor = document.createElement("div");
  cursor.style.cssText = `
    position:fixed; z-index:70; left:0; top:0; width:26px; height:26px;
    margin:-13px 0 0 -13px; border-radius:50%; pointer-events:none;
    border:2px solid rgba(190,230,255,.95);
    background:radial-gradient(circle,rgba(160,215,255,.55),rgba(160,215,255,0) 70%);
    box-shadow:0 0 22px rgba(120,190,255,.85); opacity:0;
    transition:opacity .18s, transform .06s, background .1s, border-color .1s;`;
  document.body.appendChild(cursor);

  // Buttons the cursor can pinch. pointer-events stays off — we hit-test
  // manually via elementFromPoint so nothing depends on a real mouse.
  panel = document.createElement("div");
  panel.style.cssText = `
    position:fixed; right:16px; top:16px; z-index:60; display:flex;
    flex-direction:column; gap:10px; pointer-events:none;`;
  for (const [action, label, tint] of [
    ["help", "🆘  Text my friend", "255,150,150"],
    ["ok", "👍  I'm ok", "150,235,190"],
  ]) {
    const b = document.createElement("div");
    b.dataset.handAction = action;
    b.textContent = label;
    b.style.cssText = `
      padding:14px 20px; border-radius:12px; min-width:200px;
      font:600 14px/1 ui-sans-serif,-apple-system,system-ui,sans-serif;
      color:rgb(${tint}); background:rgba(6,14,28,.72);
      border:1px solid rgba(${tint},.42); backdrop-filter:blur(8px);
      box-shadow:0 0 20px rgba(${tint},.14); transition:all .12s;`;
    panel.appendChild(b);
  }
  document.body.appendChild(panel);

  overlay = document.createElement("canvas");
  overlay.width = 240;
  overlay.height = 180;
  overlay.style.cssText = `
    position:fixed; right:16px; bottom:16px; z-index:60; width:240px; height:180px;
    border-radius:10px; border:1px solid rgba(140,200,255,.28);
    background:rgba(4,10,22,.55); box-shadow:0 0 26px rgba(60,140,255,.22);
    transform:scaleX(-1); pointer-events:none;`;
  document.body.appendChild(overlay);
  overlayCtx = overlay.getContext("2d");
}

function setHover(el) {
  for (const b of panel?.children ?? []) {
    const on = b === el;
    b.style.transform = on ? "scale(1.06)" : "scale(1)";
    b.style.background = on ? "rgba(20,42,74,.92)" : "rgba(6,14,28,.72)";
  }
}

function drawSkeleton(lm) {
  if (!overlayCtx) return;
  const { width: w, height: h } = overlay;
  overlayCtx.clearRect(0, 0, w, h);
  if (!lm) return;
  overlayCtx.strokeStyle = gestureState.pinching
    ? "rgba(255,220,150,.95)"
    : "rgba(150,205,255,.85)";
  overlayCtx.lineWidth = 2;
  for (const [a, b] of SKELETON) {
    overlayCtx.beginPath();
    overlayCtx.moveTo(lm[a].x * w, lm[a].y * h);
    overlayCtx.lineTo(lm[b].x * w, lm[b].y * h);
    overlayCtx.stroke();
  }
  overlayCtx.fillStyle = "rgba(220,240,255,.95)";
  for (const p of lm) {
    overlayCtx.beginPath();
    overlayCtx.arc(p.x * w, p.y * h, 2.6, 0, Math.PI * 2);
    overlayCtx.fill();
  }
}

/* -------------------------------------------------------------- input --- */

/** Maps a normalized landmark to screen pixels, mirrored, with reach gain. */
function toScreen(p) {
  const nx = (0.5 - p.x) / ACTIVE_BOX.x + 0.5; // mirrored
  const ny = (p.y - 0.5) / ACTIVE_BOX.y + 0.5;
  return {
    x: Math.max(0, Math.min(1, nx)) * window.innerWidth,
    y: Math.max(0, Math.min(1, ny)) * window.innerHeight,
  };
}

function isPinching(lm, currently) {
  const d = Math.hypot(lm[THUMB_TIP].x - lm[INDEX_TIP].x, lm[THUMB_TIP].y - lm[INDEX_TIP].y);
  const handSize =
    Math.hypot(lm[INDEX_MCP].x - lm[WRIST].x, lm[INDEX_MCP].y - lm[WRIST].y) || 0.001;
  const ratio = d / handSize;
  return currently ? ratio < PINCH_OFF : ratio < PINCH_ON;
}

/** Synthesizes a pointer event so OrbitControls behaves as if it were a mouse. */
function pointerEvent(type, x, y) {
  const canvas = document.getElementById("bg-canvas");
  if (!canvas) return;
  canvas.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
    }),
  );
}

async function fireAction(action) {
  const now = performance.now();
  if (now - lastActionAt < ACTION_COOLDOWN_MS) {
    say(`${action} on cooldown`);
    return;
  }
  lastActionAt = now;
  try {
    const res = await fetch(`${backendBase}/gesture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      say(`${action} rejected: ${data.error ?? res.status}`, true);
      return;
    }
    say(action === "help" ? "texting your friend ✓" : "marked ok ✓");
  } catch (err) {
    say(`${action} failed: ${err.message}`, true);
  }
}

function onPinchStart(x, y) {
  const el = document.elementFromPoint(x, y);
  const btn = el?.dataset?.handAction ? el : null;
  if (btn) {
    btn.style.transform = "scale(0.94)";
    void fireAction(btn.dataset.handAction);
    activeTarget = "button";
    return;
  }
  activeTarget = "canvas";
  pointerEvent("pointerdown", x, y);
}

function onPinchEnd(x, y) {
  if (activeTarget === "canvas") pointerEvent("pointerup", x, y);
  activeTarget = null;
}

/* --------------------------------------------------------------- loop --- */

function loop() {
  rafId = requestAnimationFrame(loop);
  if (!landmarker || !video || video.readyState < 2) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  let result;
  try {
    result = landmarker.detectForVideo(video, performance.now());
  } catch {
    return;
  }

  const lm = result?.landmarks?.[0];
  gestureState.handPresent = Boolean(lm);

  if (!lm) {
    if (wasPinching) {
      onPinchEnd(gestureState.x, gestureState.y);
      wasPinching = gestureState.pinching = false;
    }
    smoothed = null;
    cursor.style.opacity = "0";
    setHover(null);
    drawSkeleton(null);
    if (!hud.textContent.includes("✓")) say("show me your hand");
    return;
  }

  // Cursor position — the index fingertip, smoothed.
  const raw = toScreen(lm[INDEX_TIP]);
  smoothed = smoothed
    ? {
        x: smoothed.x + (raw.x - smoothed.x) * SMOOTHING,
        y: smoothed.y + (raw.y - smoothed.y) * SMOOTHING,
      }
    : raw;
  gestureState.x = smoothed.x;
  gestureState.y = smoothed.y;

  cursor.style.opacity = "1";
  cursor.style.transform = `translate(${smoothed.x}px, ${smoothed.y}px)`;

  const pinching = isPinching(lm, wasPinching);
  gestureState.pinching = pinching;
  cursor.style.background = pinching
    ? "radial-gradient(circle,rgba(255,214,140,.85),rgba(255,214,140,0) 70%)"
    : "radial-gradient(circle,rgba(160,215,255,.55),rgba(160,215,255,0) 70%)";
  cursor.style.borderColor = pinching ? "rgba(255,226,170,1)" : "rgba(190,230,255,.95)";

  const hovering = document.elementFromPoint(smoothed.x, smoothed.y);
  setHover(hovering?.dataset?.handAction ? hovering : null);

  if (pinching && !wasPinching) onPinchStart(smoothed.x, smoothed.y);
  else if (!pinching && wasPinching) onPinchEnd(smoothed.x, smoothed.y);
  else if (pinching) pointerEvent("pointermove", smoothed.x, smoothed.y);

  wasPinching = pinching;

  if (!hud.textContent.includes("✓")) {
    say(pinching ? "pinch — dragging" : "move to aim · pinch to select");
  }
}

/* ---------------------------------------------------------------- api --- */

export async function initGestures(options = {}) {
  if (gestureState.enabled) return true;
  onNextTrack = options.onNextTrack ?? onNextTrack;
  backendBase = options.backendBase ?? backendBase;
  sessionId = options.sessionId ?? sessionId;

  buildUi();
  say("starting camera…");

  // Surfaced early and loudly: this is the single most common failure, and it
  // is silent otherwise. getUserMedia needs a secure context.
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    say(`camera blocked — open this page on localhost, not ${location.hostname}`, true);
    return false;
  }

  try {
    say("requesting camera…");
    video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.display = "none";
    document.body.appendChild(video);
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
    });
    await video.play();

    say("loading hand model…");
    const { HandLandmarker, FilesetResolver } = await import(
      /* @vite-ignore */ `${VISION_CDN}/vision_bundle.mjs`
    );
    const fileset = await FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`);
    landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    gestureState.enabled = true;
    say("show me your hand");
    loop();
    return true;
  } catch (err) {
    say(`camera failed: ${err.name || ""} ${err.message}`, true);
    gestureState.enabled = false;
    return false;
  }
}

export function stopGestures() {
  if (!gestureState.enabled) return;
  cancelAnimationFrame(rafId);
  video?.srcObject?.getTracks().forEach((t) => t.stop());
  video?.remove();
  overlay?.remove();
  hud?.remove();
  cursor?.remove();
  panel?.remove();
  video = overlay = overlayCtx = hud = cursor = panel = null;
  landmarker?.close?.();
  landmarker = null;
  gestureState.enabled = false;
  gestureState.handPresent = false;
  gestureState.pinching = false;
  smoothed = null;
  wasPinching = false;
  console.log("[hand] stopped");
}
