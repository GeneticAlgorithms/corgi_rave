// CORGI OS — hand control.
//
// Designed for a DESK PROJECTION rig: projector throwing onto the desk, camera
// looking down at your hands on that surface.
//
//   one hand   move       reticle follows your index fingertip
//   one hand   pinch      select — drag on the canvas orbits the camera,
//                         pinch-and-hold on a module fires its action
//   two hands  pinch both spread/squeeze to zoom (dollies the camera)
//
// IMPORTANT — mirroring. A selfie-facing webcam needs x flipped; a downward
// desk camera does not, and flipping it makes the cursor move the wrong way.
// Default here is NO mirror (desk rig). Override with ?mirror=1.

import * as hud from "./hud.js";

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
// to the whole screen. Smaller = less reach needed, twitchier.
const ACTIVE_BOX = { x: 0.6, y: 0.6 };
const SMOOTHING = 0.35;

// Pinch is measured relative to hand size so it works at any camera distance.
// Hysteresis stops it chattering on the threshold.
const PINCH_ON = 0.42;
const PINCH_OFF = 0.58;

// Hold-to-fire. Anything that texts a real person gets a longer hold, and the
// module's fill bar shows the charge so it can be aborted by pulling away.
const HOLD_MS = { help: 1600, ok: 700, next: 700 };
const ACTION_COOLDOWN_MS = 5000;

const ZOOM_GAIN = 2.6;

export const gestureState = {
  enabled: false,
  handPresent: false,
  pinching: false,
  zooming: false,
  intensity: 1, // script.js's getEnergy() multiplies by this
  x: 0,
  y: 0,
};

let landmarker = null;
let video = null;
let ctx = null;
let feedCanvas = null;
let rafId = 0;
let lastVideoTime = -1;

let smoothed = null;
let wasPinching = false;
let activeTarget = null;
let holdTarget = null;
let holdStart = 0;
let lastActionAt = 0;
let zoomBase = null;

let mirror = false;
let backendBase = "http://localhost:3001";
let sessionId = null;
let onNextTrack = () => {};

/* -------------------------------------------------------------- mapping -- */

function toScreen(p) {
  const px = mirror ? 0.5 - p.x : p.x - 0.5;
  const nx = px / ACTIVE_BOX.x + 0.5;
  const ny = (p.y - 0.5) / ACTIVE_BOX.y + 0.5;
  return {
    x: Math.max(0, Math.min(1, nx)) * window.innerWidth,
    y: Math.max(0, Math.min(1, ny)) * window.innerHeight,
  };
}

function pinchRatio(lm) {
  const d = Math.hypot(lm[THUMB_TIP].x - lm[INDEX_TIP].x, lm[THUMB_TIP].y - lm[INDEX_TIP].y);
  const hand =
    Math.hypot(lm[INDEX_MCP].x - lm[WRIST].x, lm[INDEX_MCP].y - lm[WRIST].y) || 0.001;
  return d / hand;
}

const isPinching = (lm, already) => pinchRatio(lm) < (already ? PINCH_OFF : PINCH_ON);

/* --------------------------------------------------------------- output -- */

function canvasEl() {
  return document.getElementById("bg-canvas");
}

/** Synthesized so OrbitControls behaves exactly as it would with a mouse. */
function pointerEvent(type, x, y) {
  canvasEl()?.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1, pointerType: "mouse", isPrimary: true,
      bubbles: true, cancelable: true,
      clientX: x, clientY: y,
      button: 0, buttons: type === "pointerup" ? 0 : 1,
    }),
  );
}

/** OrbitControls dollies on wheel, so two-hand zoom reuses that path. */
function wheel(deltaY) {
  canvasEl()?.dispatchEvent(
    new WheelEvent("wheel", {
      deltaY, bubbles: true, cancelable: true,
      clientX: window.innerWidth / 2, clientY: window.innerHeight / 2,
    }),
  );
}

async function fireAction(action) {
  const now = performance.now();
  if (now - lastActionAt < ACTION_COOLDOWN_MS) return;
  lastActionAt = now;

  if (action === "next") {
    hud.log("next track");
    try {
      await onNextTrack();
    } catch (err) {
      hud.log(`track change failed: ${err.message}`, true);
    }
    return;
  }

  try {
    const res = await fetch(`${backendBase}/gesture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      hud.log(`${action} rejected — ${data.error ?? res.status}`, true);
      return;
    }
    hud.log(action === "help" ? "signalling your friend ✓" : "marked all clear ✓");
  } catch (err) {
    hud.log(`${action} failed — ${err.message}`, true);
  }
}

function moduleUnder(x, y) {
  // closest(), not the element itself — the reticle lands on inner spans.
  return document.elementFromPoint(x, y)?.closest?.("[data-hand-action]") ?? null;
}

function drawFeed(hands) {
  if (!ctx) return;
  const { width: w, height: h } = feedCanvas;
  ctx.clearRect(0, 0, w, h);
  hands.forEach((lm, i) => {
    ctx.strokeStyle = i === 0 ? "rgba(150,230,255,.9)" : "rgba(255,205,120,.9)";
    ctx.lineWidth = 2;
    for (const [a, b] of SKELETON) {
      ctx.beginPath();
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(235,248,255,.95)";
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function releasePinch() {
  if (activeTarget === "canvas") pointerEvent("pointerup", gestureState.x, gestureState.y);
  activeTarget = null;
  holdTarget = null;
  hud.setHover(null);
}

/* ----------------------------------------------------------------- loop -- */

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

  const hands = result?.landmarks ?? [];
  gestureState.handPresent = hands.length > 0;
  drawFeed(hands);
  hud.setStatus({ input: hands.length ? `${hands.length} HAND${hands.length > 1 ? "S" : ""}` : "NONE" });

  /* ---- two-hand zoom takes priority over everything ---- */
  if (hands.length === 2 && hands.every((h) => isPinching(h, gestureState.zooming))) {
    if (wasPinching) {
      releasePinch();
      wasPinching = false;
    }
    const a = toScreen(hands[0][INDEX_TIP]);
    const b = toScreen(hands[1][INDEX_TIP]);
    const span = Math.hypot(b.x - a.x, b.y - a.y);

    if (zoomBase === null) zoomBase = span;
    const delta = span - zoomBase;
    if (Math.abs(delta) > 2) {
      wheel(-delta * ZOOM_GAIN);
      zoomBase = span;
    }

    gestureState.zooming = true;
    gestureState.pinching = true;
    hud.setCursor(a.x, a.y, true, true);
    hud.setZoom(a, b, `${Math.round(span)}`);
    hud.log("two-hand zoom");
    return;
  }

  if (gestureState.zooming) {
    gestureState.zooming = false;
    zoomBase = null;
    hud.setZoom(null, null, "");
  }

  /* ---- no hand ---- */
  if (hands.length === 0) {
    if (wasPinching) {
      releasePinch();
      wasPinching = gestureState.pinching = false;
    }
    smoothed = null;
    hud.setCursor(0, 0, false, false);
    hud.setHover(null);
    return;
  }

  /* ---- single-hand cursor ---- */
  const lm = hands[0];
  const raw = toScreen(lm[INDEX_TIP]);
  smoothed = smoothed
    ? {
        x: smoothed.x + (raw.x - smoothed.x) * SMOOTHING,
        y: smoothed.y + (raw.y - smoothed.y) * SMOOTHING,
      }
    : raw;
  gestureState.x = smoothed.x;
  gestureState.y = smoothed.y;

  const pinching = isPinching(lm, wasPinching);
  gestureState.pinching = pinching;
  hud.setCursor(smoothed.x, smoothed.y, pinching, true);

  const mod = moduleUnder(smoothed.x, smoothed.y);

  if (pinching && !wasPinching) {
    if (mod) {
      holdTarget = mod;
      holdStart = performance.now();
      activeTarget = "module";
    } else {
      activeTarget = "canvas";
      pointerEvent("pointerdown", smoothed.x, smoothed.y);
    }
  } else if (pinching && activeTarget === "module") {
    // Pulling off the module mid-hold aborts — that's the escape hatch.
    if (mod !== holdTarget) {
      holdTarget = null;
      activeTarget = null;
      hud.setHover(mod, 0);
    } else {
      const action = holdTarget.dataset.handAction;
      const need = HOLD_MS[action] ?? 900;
      const pct = Math.min(100, ((performance.now() - holdStart) / need) * 100);
      hud.setHover(holdTarget, pct);
      if (pct >= 100) {
        const fired = holdTarget;
        holdTarget = null;
        activeTarget = null;
        hud.setHover(null);
        void fireAction(fired.dataset.handAction);
      }
    }
  } else if (pinching && activeTarget === "canvas") {
    pointerEvent("pointermove", smoothed.x, smoothed.y);
  } else if (!pinching && wasPinching) {
    releasePinch();
  } else {
    hud.setHover(mod, 0);
    if (!mod) hud.setHover(null);
  }

  wasPinching = pinching;
  if (!pinching && !mod) hud.log("move to aim · pinch to select");
}

/* ------------------------------------------------------------------ api -- */

/** Called from script.js's render loop to drive the equaliser strip. */
export function setAudioLevel(level) {
  if (gestureState.enabled) hud.setLevels(level);
}

export async function initGestures(options = {}) {
  if (gestureState.enabled) return true;
  onNextTrack = options.onNextTrack ?? onNextTrack;
  backendBase = options.backendBase ?? backendBase;
  sessionId = options.sessionId ?? sessionId;
  mirror = Boolean(options.mirror);

  const built = hud.build();
  feedCanvas = built.canvas;
  ctx = built.ctx;
  hud.setMirrorFeed(mirror);
  hud.setStatus({
    input: "—",
    session: sessionId ? sessionId.slice(0, 8) : "NONE",
    link: backendBase.replace(/^https?:\/\//, ""),
  });

  // The single most common failure, and silent otherwise: getUserMedia needs a
  // secure context, so a plain-http LAN IP is refused outright.
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    hud.log(`camera blocked — use localhost, not ${location.hostname}`, true);
    return false;
  }

  try {
    hud.log("init optical sensor");
    video = document.createElement("video");
    Object.assign(video, { autoplay: true, playsInline: true, muted: true });
    video.style.display = "none";
    document.body.appendChild(video);
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
    });
    await video.play();

    hud.log("loading hand model");
    const { HandLandmarker, FilesetResolver } = await import(
      /* @vite-ignore */ `${VISION_CDN}/vision_bundle.mjs`
    );
    const fileset = await FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`);
    landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    gestureState.enabled = true;
    hud.log("ready · show me your hand");
    loop();
    return true;
  } catch (err) {
    hud.log(`camera failed — ${err.name || ""} ${err.message}`, true);
    gestureState.enabled = false;
    return false;
  }
}

export function stopGestures() {
  if (!gestureState.enabled) return;
  cancelAnimationFrame(rafId);
  video?.srcObject?.getTracks().forEach((t) => t.stop());
  video?.remove();
  hud.destroy();
  video = ctx = feedCanvas = null;
  landmarker?.close?.();
  landmarker = null;
  Object.assign(gestureState, {
    enabled: false, handPresent: false, pinching: false, zooming: false,
  });
  smoothed = null;
  wasPinching = false;
  zoomBase = null;
}
