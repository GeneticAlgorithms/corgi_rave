// CORGI OS — heads-up interface for hand control.
//
// Presentation only. gestures.js owns tracking and calls into this; nothing
// here knows about MediaPipe. Everything is pointer-events:none so a real
// mouse still reaches the canvas — the hand cursor hit-tests via
// elementFromPoint + closest("[data-hand-action]").

// Tuned for DESK PROJECTION, not a monitor. A projector throwing onto a desk
// surface has poor black level and low effective contrast, and you view it at
// a steep angle — so type is large, strokes are heavy, and nothing relies on
// low-opacity hairlines that simply vanish on a wood or laminate surface.
const CY = "150,230,255"; // cyan — system
const AM = "255,205,120"; // amber — engaged
const RD = "255,120,120"; // red   — alert
const GR = "130,240,180"; // green — ok

const MODULES = [
  { action: "help", glyph: "◈", label: "SIGNAL FRIEND", sub: "ESCALATE / 20s HOLD", tint: RD },
  { action: "ok", glyph: "✓", label: "ALL CLEAR", sub: "CANCEL ESCALATION", tint: GR },
  { action: "next", glyph: "⏭", label: "NEXT TRACK", sub: "CYCLE LIBRARY", tint: CY },
];

let root = null;
let els = {};
let bootTimer = 0;

function css() {
  return `
@keyframes cos-sweep { 0%{transform:translateY(-100%)} 100%{transform:translateY(400%)} }
@keyframes cos-spin  { to { transform:rotate(360deg) } }
@keyframes cos-spin-r{ to { transform:rotate(-360deg) } }
@keyframes cos-pulse { 0%,100%{opacity:.35} 50%{opacity:1} }
@keyframes cos-in    { from{opacity:0;transform:translateX(24px)} to{opacity:1;transform:none} }
@keyframes cos-flick { 0%,100%{opacity:1} 92%{opacity:1} 94%{opacity:.5} 96%{opacity:1} }

.cos { position:fixed; z-index:60; pointer-events:none;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  -webkit-font-smoothing:antialiased; }

/* angular bracket frame shared by every panel */
.cos-panel { position:relative; background:linear-gradient(160deg,rgba(3,10,22,.94),rgba(2,7,16,.86));
  border:2px solid rgba(${CY},.48); backdrop-filter:blur(10px);
  clip-path:polygon(16px 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%,0 16px); }
.cos-panel::before,.cos-panel::after{ content:""; position:absolute; width:20px; height:20px; }
.cos-panel::before{ top:-2px; right:-2px; border-top:3px solid rgb(${CY}); border-right:3px solid rgb(${CY}); }
.cos-panel::after { bottom:-2px; left:-2px; border-bottom:3px solid rgb(${CY}); border-left:3px solid rgb(${CY}); }

.cos-scan { position:absolute; inset:0; overflow:hidden; opacity:.6; }
.cos-scan i { position:absolute; left:0; right:0; height:22%;
  background:linear-gradient(180deg,transparent,rgba(${CY},.16),transparent);
  animation:cos-sweep 5.5s linear infinite; }

.cos-h { font-size:13px; letter-spacing:.22em; color:rgba(${CY},.78); text-transform:uppercase; }
.cos-v { font-size:15px; letter-spacing:.08em; color:rgb(${CY}); font-weight:700;
  text-shadow:0 0 12px rgba(${CY},.7); }

/* ---- status, top-left ---- */
#cos-status { top:26px; left:26px; width:330px; padding:20px 22px; }
#cos-status .row { display:flex; justify-content:space-between; align-items:baseline; margin-top:11px; }
#cos-title { display:flex; align-items:center; gap:13px; font-size:22px; letter-spacing:.3em;
  color:#fff; font-weight:700; text-shadow:0 0 18px rgba(${CY},.9); animation:cos-flick 7s infinite; }
#cos-title b { width:11px; height:11px; border-radius:50%; background:rgb(${GR});
  box-shadow:0 0 14px rgb(${GR}); animation:cos-pulse 2s infinite; }
#cos-bars { display:flex; gap:4px; height:34px; align-items:flex-end; margin-top:16px; }
#cos-bars s { flex:1; background:linear-gradient(180deg,rgb(${CY}),rgba(${CY},.35));
  height:12%; transition:height .09s linear; }

/* ---- command modules, right ----
   Kept high on the right edge: on a desk your hands rest low and centre, and
   anything under them is both occluded and shadowed by the projector. */
#cos-modules { top:26px; right:26px; display:flex; flex-direction:column; gap:16px; width:360px; }
.cos-mod { padding:20px 22px; animation:cos-in .4s backwards; overflow:hidden;
  transition:transform .14s cubic-bezier(.2,.8,.3,1), border-color .14s, box-shadow .14s; }
.cos-mod .top { display:flex; align-items:center; gap:18px; }
.cos-mod .g { width:52px; height:52px; flex:none; display:grid; place-items:center; font-size:26px;
  border:2px solid rgba(255,255,255,.28); transition:all .14s;
  clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px); }
.cos-mod .lab { font-size:19px; letter-spacing:.1em; font-weight:700; }
.cos-mod .sub { font-size:12px; letter-spacing:.14em; opacity:.72; margin-top:5px; }
.cos-mod .fill { position:absolute; left:0; bottom:0; height:6px; width:0%; transition:width .08s linear; }

/* ---- reticle cursor — oversized, because on a desk it competes with your
       own hand and its shadow sitting right next to it ---- */
#cos-cursor { position:fixed; z-index:90; left:0; top:0; width:88px; height:88px;
  margin:-44px 0 0 -44px; pointer-events:none; opacity:0; transition:opacity .2s; }
#cos-cursor .ring { position:absolute; inset:0; border-radius:50%;
  border:3px solid rgba(${CY},.45); border-top-color:rgb(${CY});
  border-right-color:rgba(${CY},.9); animation:cos-spin 3.2s linear infinite; }
#cos-cursor .ring2 { position:absolute; inset:14px; border-radius:50%;
  border:2px dashed rgba(${CY},.5); animation:cos-spin-r 5s linear infinite; }
#cos-cursor .dot { position:absolute; inset:36px; border-radius:50%; background:#fff;
  box-shadow:0 0 20px rgb(${CY}),0 0 40px rgba(${CY},.7); transition:all .1s; }
#cos-cursor .tick { position:absolute; background:rgb(${CY}); box-shadow:0 0 8px rgba(${CY},.9); }
#cos-cursor.pinch .ring { border-color:rgba(${AM},.55); border-top-color:rgb(${AM});
  border-right-color:rgb(${AM}); animation-duration:.9s; }
#cos-cursor.pinch .ring2 { border-color:rgba(${AM},.65); }
#cos-cursor.pinch .dot { inset:30px; background:#fff;
  box-shadow:0 0 26px rgb(${AM}),0 0 52px rgba(${AM},.8); }
#cos-cursor.pinch .tick { background:rgb(${AM}); box-shadow:0 0 8px rgb(${AM}); }

/* second hand's reticle, for two-hand zoom */
#cos-cursor2 { position:fixed; z-index:89; left:0; top:0; width:64px; height:64px;
  margin:-32px 0 0 -32px; pointer-events:none; opacity:0; transition:opacity .2s; }
#cos-cursor2 .ring { position:absolute; inset:0; border-radius:50%;
  border:3px dashed rgba(${AM},.85); animation:cos-spin-r 4s linear infinite; }

/* the zoom tether drawn between two pinching hands */
#cos-zoom { position:fixed; z-index:88; left:0; top:0; height:3px; transform-origin:0 50%;
  background:linear-gradient(90deg,rgba(${AM},.15),rgb(${AM}),rgba(${AM},.15));
  box-shadow:0 0 16px rgba(${AM},.9); opacity:0; pointer-events:none; }
#cos-zoomlab { position:fixed; z-index:91; pointer-events:none; opacity:0;
  font:700 20px/1 ui-monospace,Menlo,monospace; letter-spacing:.14em; color:rgb(${AM});
  text-shadow:0 0 16px rgba(${AM},.95); transform:translate(-50%,-50%); }

/* ---- ticker, bottom-left ---- */
#cos-log { bottom:26px; left:26px; width:520px; padding:16px 20px; }
#cos-log .line { font-size:17px; letter-spacing:.09em; color:rgb(${CY}); font-weight:700;
  text-shadow:0 0 12px rgba(${CY},.6); }
#cos-log .line.err { color:rgb(${RD}); text-shadow:0 0 12px rgba(${RD},.7); }
#cos-log .hint { font-size:12px; letter-spacing:.15em; color:rgba(${CY},.62); margin-top:9px; }

/* ---- camera feed, bottom-right ---- */
#cos-feed { bottom:26px; right:26px; padding:10px; }
#cos-feed canvas { display:block; width:230px; height:173px; background:rgba(2,7,16,.75); }
#cos-feed .cap { font-size:11px; letter-spacing:.18em; color:rgba(${CY},.7);
  margin-top:8px; text-align:center; }
`;
}

function panel(id, extraClass = "") {
  const d = document.createElement("div");
  d.id = id;
  d.className = `cos cos-panel ${extraClass}`.trim();
  const s = document.createElement("div");
  s.className = "cos-scan";
  s.innerHTML = "<i></i>";
  d.appendChild(s);
  return d;
}

export function build() {
  const style = document.createElement("style");
  style.id = "cos-style";
  style.textContent = css();
  document.head.appendChild(style);

  root = document.createElement("div");
  document.body.appendChild(root);

  // ---- status ----
  const status = panel("cos-status");
  status.insertAdjacentHTML(
    "beforeend",
    `<div id="cos-title"><b></b>CORGI&nbsp;OS</div>
     <div class="row"><span class="cos-h">Input</span><span class="cos-v" data-f="input">—</span></div>
     <div class="row"><span class="cos-h">Session</span><span class="cos-v" data-f="session">—</span></div>
     <div class="row"><span class="cos-h">Link</span><span class="cos-v" data-f="link">—</span></div>
     <div id="cos-bars"></div>`,
  );
  root.appendChild(status);
  const bars = status.querySelector("#cos-bars");
  for (let i = 0; i < 22; i++) bars.appendChild(document.createElement("s"));

  // ---- modules ----
  const mods = document.createElement("div");
  mods.id = "cos-modules";
  mods.className = "cos";
  MODULES.forEach((m, i) => {
    const el = panel("", "cos-mod");
    el.dataset.handAction = m.action;
    el.style.animationDelay = `${i * 90}ms`;
    el.style.setProperty("--tint", m.tint);
    el.insertAdjacentHTML(
      "beforeend",
      `<div class="top">
         <div class="g" style="color:rgb(${m.tint})">${m.glyph}</div>
         <div><div class="lab" style="color:rgb(${m.tint})">${m.label}</div>
              <div class="sub" style="color:rgb(${m.tint})">${m.sub}</div></div>
       </div>
       <div class="fill" style="background:rgb(${m.tint})"></div>`,
    );
    mods.appendChild(el);
  });
  root.appendChild(mods);

  // ---- reticle ----
  const cur = document.createElement("div");
  cur.id = "cos-cursor";
  cur.innerHTML =
    `<div class="ring"></div><div class="ring2"></div><div class="dot"></div>` +
    `<div class="tick" style="left:50%;top:-6px;width:1px;height:9px;margin-left:-.5px"></div>` +
    `<div class="tick" style="left:50%;bottom:-6px;width:1px;height:9px;margin-left:-.5px"></div>` +
    `<div class="tick" style="top:50%;left:-6px;height:1px;width:9px;margin-top:-.5px"></div>` +
    `<div class="tick" style="top:50%;right:-6px;height:1px;width:9px;margin-top:-.5px"></div>`;
  root.appendChild(cur);

  // second hand + zoom tether
  const cur2 = document.createElement("div");
  cur2.id = "cos-cursor2";
  cur2.innerHTML = `<div class="ring"></div>`;
  root.appendChild(cur2);
  const zoomLine = document.createElement("div");
  zoomLine.id = "cos-zoom";
  root.appendChild(zoomLine);
  const zoomLab = document.createElement("div");
  zoomLab.id = "cos-zoomlab";
  root.appendChild(zoomLab);

  // ---- log ----
  const log = panel("cos-log");
  log.insertAdjacentHTML(
    "beforeend",
    `<div class="line" data-f="log">booting…</div>
     <div class="hint">MOVE HAND TO AIM · PINCH TO SELECT · H TO EXIT</div>`,
  );
  root.appendChild(log);

  // ---- camera feed ----
  const feed = panel("cos-feed");
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 180;
  feed.appendChild(canvas);
  feed.insertAdjacentHTML("beforeend", `<div class="cap">OPTICAL / HAND TRACK</div>`);
  root.appendChild(feed);

  els = {
    cursor: cur,
    cursor2: cur2,
    zoomLine,
    zoomLab,
    canvas,
    ctx: canvas.getContext("2d"),
    bars: [...bars.children],
    log: log.querySelector('[data-f="log"]'),
    input: status.querySelector('[data-f="input"]'),
    session: status.querySelector('[data-f="session"]'),
    link: status.querySelector('[data-f="link"]'),
    modules: [...mods.children],
  };

  // Boot sequence — reads as an OS coming up rather than a blank page.
  const seq = ["INIT OPTICAL SENSOR", "LOADING HAND MODEL", "CALIBRATING", "READY"];
  let i = 0;
  bootTimer = setInterval(() => {
    if (i >= seq.length) return clearInterval(bootTimer);
    els.log.textContent = seq[i++];
  }, 420);

  return { canvas, ctx: els.ctx };
}

export function setStatus({ input, session, link }) {
  if (!els.input) return;
  if (input !== undefined) els.input.textContent = input;
  if (session !== undefined) els.session.textContent = session;
  if (link !== undefined) els.link.textContent = link;
}

export function log(msg, isError = false) {
  if (!els.log) return;
  clearInterval(bootTimer);
  els.log.textContent = msg.toUpperCase();
  els.log.classList.toggle("err", isError);
}

export function setCursor(x, y, pinching, visible) {
  if (!els.cursor) return;
  els.cursor.style.opacity = visible ? "1" : "0";
  els.cursor.style.transform = `translate(${x}px, ${y}px)`;
  els.cursor.classList.toggle("pinch", Boolean(pinching));
}

/**
 * Two-hand zoom tether. Pass null to hide.
 * The camera feed is NOT mirrored for a desk rig (camera looks down at the
 * hands), so `mirrorFeed` is set by gestures.js rather than hardcoded in CSS.
 */
export function setZoom(a, b, label) {
  if (!els.zoomLine) return;
  if (!a || !b) {
    els.cursor2.style.opacity = "0";
    els.zoomLine.style.opacity = "0";
    els.zoomLab.style.opacity = "0";
    return;
  }
  els.cursor2.style.opacity = "1";
  els.cursor2.style.transform = `translate(${b.x}px, ${b.y}px)`;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  els.zoomLine.style.opacity = "1";
  els.zoomLine.style.width = `${Math.hypot(dx, dy)}px`;
  els.zoomLine.style.transform =
    `translate(${a.x}px, ${a.y}px) rotate(${Math.atan2(dy, dx)}rad)`;

  els.zoomLab.style.opacity = "1";
  els.zoomLab.style.left = `${(a.x + b.x) / 2}px`;
  els.zoomLab.style.top = `${(a.y + b.y) / 2 - 34}px`;
  els.zoomLab.textContent = label;
}

export function setMirrorFeed(mirror) {
  if (els.canvas) els.canvas.style.transform = mirror ? "scaleX(-1)" : "none";
}

/** `el` is the module under the cursor, or null. */
export function setHover(el, chargePct = 0) {
  for (const m of els.modules ?? []) {
    const on = m === el;
    const tint = m.style.getPropertyValue("--tint");
    m.style.transform = on ? "translateX(-8px) scale(1.03)" : "none";
    m.style.borderColor = on ? `rgba(${tint},.75)` : `rgba(${CY},.20)`;
    m.style.boxShadow = on ? `0 0 26px rgba(${tint},.28)` : "none";
    const g = m.querySelector(".g");
    if (g) {
      g.style.background = on ? `rgba(${tint},.16)` : "transparent";
      g.style.borderColor = on ? `rgba(${tint},.7)` : "rgba(255,255,255,.14)";
    }
    const fill = m.querySelector(".fill");
    if (fill) fill.style.width = on ? `${chargePct}%` : "0%";
  }
}

/** Audio level 0..1 drives the equaliser strip. */
export function setLevels(level) {
  if (!els.bars) return;
  for (let i = 0; i < els.bars.length; i++) {
    const falloff = 1 - Math.abs(i - els.bars.length / 2) / els.bars.length;
    const h = 12 + level * 88 * falloff * (0.55 + Math.random() * 0.65);
    els.bars[i].style.height = `${Math.min(100, h)}%`;
  }
}

export function destroy() {
  clearInterval(bootTimer);
  root?.remove();
  document.getElementById("cos-style")?.remove();
  root = null;
  els = {};
}
