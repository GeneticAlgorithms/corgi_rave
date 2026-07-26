// Hand-gesture control for the corgi rave wall.
//
// MediaPipe Hands via webcam. Open palm intensifies the visuals, a fist calms
// them, a fast horizontal swipe skips to the next track. Everything is
// smoothed and rate-limited — a projector demo punishes twitchy input.
//
// Loaded lazily: nothing touches the camera until initGestures() is called
// (press H), so the visualizer still runs on a machine with no webcam.

const VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// Landmark indices — MediaPipe hand topology.
const WRIST = 0;
const TIPS = { index: 8, middle: 12, ring: 16, pinky: 20 };
const PIPS = { index: 6, middle: 10, ring: 14, pinky: 18 };
const SKELETON = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const INTENSITY = { palm: 1.65, fist: 0.45, neutral: 1.0 };
const SWIPE_DISTANCE = 0.22; // normalized x travel
const SWIPE_WINDOW_MS = 420;
const SWIPE_COOLDOWN_MS = 1600;

/**
 * Gestures that fire a real action (a text to a real person) must be HELD.
 * A momentary pose is far too easy to hit by accident while dancing, and the
 * cost of a false positive here is someone's phone ringing at 1am.
 */
const HOLD_MS = 1500;
const ACTION_COOLDOWN_MS = 8000;

/**
 * Read by script.js's getEnergy(). `intensity` is a multiplier on audio energy,
 * eased toward its target so gestures feel like a fader, not a switch.
 */
export const gestureState = {
  enabled: false,
  intensity: 1,
  label: "",
  handPresent: false,
};

let target = INTENSITY.neutral;
let landmarker = null;
let video = null;
let overlay = null;
let overlayCtx = null;
let hud = null;
let rafId = 0;
let lastVideoTime = -1;
const swipeTrail = [];
let lastSwipeAt = 0;
let onNextTrack = () => {};

// Hold-to-confirm state for the action poses.
const ACTIONS = { peace: "help", thumbsup: "ok" };
let holdPose = null;
let holdStart = 0;
let lastActionAt = 0;
let backendBase = "http://localhost:3001";
let sessionId = null;

/** Fires a real action on the backend — a text to a real person. */
async function fireAction(action) {
  try {
    const res = await fetch(`${backendBase}/gesture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[gesture] ${action} rejected (${res.status}):`, data.error ?? "");
      gestureState.label = `${action} failed: ${data.error ?? res.status}`;
      return;
    }
    console.log(`[gesture] ${action} sent`, data);
    gestureState.label = action === "help" ? "help sent ✓" : "marked ok ✓";
  } catch (err) {
    console.warn(`[gesture] ${action} failed:`, err);
    gestureState.label = `${action} failed`;
  }
}

function buildUi() {
  hud = document.createElement("div");
  hud.style.cssText = `
    position:fixed; left:16px; bottom:16px; z-index:40;
    font:600 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
    color:#bfe3ff; letter-spacing:.08em; text-transform:uppercase;
    text-shadow:0 0 12px rgba(90,170,255,.65); pointer-events:none;`;
  document.body.appendChild(hud);

  overlay = document.createElement("canvas");
  overlay.width = 240;
  overlay.height = 180;
  overlay.style.cssText = `
    position:fixed; right:16px; bottom:16px; z-index:40; width:240px; height:180px;
    border-radius:10px; border:1px solid rgba(140,200,255,.28);
    background:rgba(4,10,22,.55); box-shadow:0 0 26px rgba(60,140,255,.22);
    transform:scaleX(-1); pointer-events:none;`;
  document.body.appendChild(overlay);
  overlayCtx = overlay.getContext("2d");
}

function isUp(lm, finger) {
  // In image space y grows downward, so an extended finger has its tip ABOVE
  // (smaller y than) its PIP joint.
  return lm[TIPS[finger]].y < lm[PIPS[finger]].y - 0.02;
}

function classify(lm) {
  const up = {
    index: isUp(lm, "index"),
    middle: isUp(lm, "middle"),
    ring: isUp(lm, "ring"),
    pinky: isUp(lm, "pinky"),
  };
  const extended = Object.values(up).filter(Boolean).length;

  // Thumb points sideways, not up, so it needs its own test: tip further from
  // the wrist than the IP joint, and clearly above the index knuckle.
  const thumbOut =
    Math.hypot(lm[4].x - lm[WRIST].x, lm[4].y - lm[WRIST].y) >
      Math.hypot(lm[3].x - lm[WRIST].x, lm[3].y - lm[WRIST].y) * 1.15 &&
    lm[4].y < lm[5].y;

  // Action poses first — they are stricter than the analogue ones.
  if (up.index && up.middle && !up.ring && !up.pinky) return "peace";
  if (extended === 0 && thumbOut) return "thumbsup";

  if (extended >= 4) return "palm";
  if (extended === 0) return "fist";
  return "neutral";
}

function detectSwipe(lm, now) {
  swipeTrail.push({ x: lm[WRIST].x, t: now });
  while (swipeTrail.length && now - swipeTrail[0].t > SWIPE_WINDOW_MS) swipeTrail.shift();
  if (swipeTrail.length < 4) return false;
  if (now - lastSwipeAt < SWIPE_COOLDOWN_MS) return false;

  const xs = swipeTrail.map((p) => p.x);
  const travel = Math.max(...xs) - Math.min(...xs);
  if (travel < SWIPE_DISTANCE) return false;

  lastSwipeAt = now;
  swipeTrail.length = 0;
  return true;
}

function draw(lm) {
  if (!overlayCtx) return;
  const { width: w, height: h } = overlay;
  overlayCtx.clearRect(0, 0, w, h);
  if (!lm) return;

  overlayCtx.strokeStyle = "rgba(150,205,255,.85)";
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

function loop() {
  rafId = requestAnimationFrame(loop);
  if (!landmarker || video.readyState < 2) return;

  const now = performance.now();
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  let result;
  try {
    result = landmarker.detectForVideo(video, now);
  } catch {
    return;
  }

  const lm = result?.landmarks?.[0];
  gestureState.handPresent = Boolean(lm);

  if (!lm) {
    target = INTENSITY.neutral;
    gestureState.label = "";
    holdPose = null;
    swipeTrail.length = 0;
    draw(null);
  } else {
    const pose = classify(lm);
    // Action poses don't drive the visual fader; they're discrete commands.
    target = INTENSITY[pose] ?? INTENSITY.neutral;
    gestureState.label = pose;

    const action = ACTIONS[pose];
    if (action) {
      if (holdPose !== pose) {
        holdPose = pose;
        holdStart = now;
      }
      const held = now - holdStart;
      if (held >= HOLD_MS) {
        if (now - lastActionAt > ACTION_COOLDOWN_MS) {
          lastActionAt = now;
          holdPose = null;
          void fireAction(action);
        }
      } else {
        // Visible countdown — the user (and the audience) can see it arming,
        // and can bail out before anything is sent.
        const pct = Math.round((held / HOLD_MS) * 100);
        gestureState.label = `${pose} → ${action} ${pct}%`;
      }
    } else {
      holdPose = null;
      if (pose !== "fist" && detectSwipe(lm, now)) {
        gestureState.label = "swipe → next";
        try {
          onNextTrack();
        } catch (err) {
          console.warn("[gesture] onNextTrack failed:", err);
        }
      }
    }
    draw(lm);
  }

  // Ease toward the target so the wall breathes instead of snapping.
  gestureState.intensity += (target - gestureState.intensity) * 0.08;

  hud.textContent = gestureState.handPresent
    ? `✋ ${gestureState.label}  ·  ×${gestureState.intensity.toFixed(2)}`
    : "✋ gestures on · no hand";
}

export async function initGestures(options = {}) {
  if (gestureState.enabled) return true;
  onNextTrack = options.onNextTrack ?? onNextTrack;
  backendBase = options.backendBase ?? backendBase;
  sessionId = options.sessionId ?? sessionId;

  try {
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

    buildUi();
    gestureState.enabled = true;
    loop();
    console.log(
      "[gesture] active — palm=intensify fist=calm swipe=next " +
        `| hold ✌️=help 👍=ok (${HOLD_MS}ms) -> ${backendBase}/gesture`,
    );
    return true;
  } catch (err) {
    console.error("[gesture] init failed:", err);
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
  video = overlay = overlayCtx = hud = null;
  landmarker?.close?.();
  landmarker = null;
  gestureState.enabled = false;
  gestureState.intensity = 1;
  gestureState.label = "";
  console.log("[gesture] stopped");
}
