import * as THREE from "three";

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createProceduralSpaceTexture(width = 4096, height = 2048) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const rand = seededRandom(42);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0.0,  "#02030f");
  gradient.addColorStop(0.25, "#060c20");
  gradient.addColorStop(0.5,  "#0a1738");
  gradient.addColorStop(0.78, "#0d0a2c");
  gradient.addColorStop(1.0,  "#02030a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 22; i += 1) {
    const cx = rand() * width;
    const cy = rand() * height;
    const radius = 240 + rand() * 720;
    const palette = rand();
    let hue;
    if (palette > 0.75) hue = 290 + rand() * 35;
    else if (palette > 0.5) hue = 200 + rand() * 35;
    else if (palette > 0.25) hue = 170 + rand() * 25;
    else hue = 25 + rand() * 25;
    const nebula = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    const innerAlpha = 0.16 + rand() * 0.16;
    nebula.addColorStop(0.0,  `hsla(${hue}, 70%, 52%, ${innerAlpha})`);
    nebula.addColorStop(0.35, `hsla(${hue + 18}, 62%, 38%, ${innerAlpha * 0.55})`);
    nebula.addColorStop(0.7,  `hsla(${hue + 28}, 55%, 24%, ${innerAlpha * 0.18})`);
    nebula.addColorStop(1.0,  "rgba(0,0,0,0)");
    ctx.fillStyle = nebula;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  for (let i = 0; i < 6; i += 1) {
    const cx = rand() * width;
    const cy = rand() * height;
    const radius = 90 + rand() * 220;
    const hue = 260 + rand() * 80;
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    core.addColorStop(0.0, `hsla(${hue}, 90%, 70%, 0.45)`);
    core.addColorStop(0.45, `hsla(${hue + 10}, 70%, 48%, 0.20)`);
    core.addColorStop(1.0, "rgba(0,0,0,0)");
    ctx.fillStyle = core;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";

  const starCount = 18000;
  for (let i = 0; i < starCount; i += 1) {
    const x = rand() * width;
    const y = rand() * height;
    const roll = rand();
    const size =
      roll > 0.9985 ? 2.6 + rand() * 1.8 :
      roll > 0.995  ? 1.6 + rand() * 1.0 :
      roll > 0.96   ? 0.9 + rand() * 0.7 :
      0.35 + rand() * 0.55;
    const alpha = roll > 0.995 ? 0.98 : 0.22 + rand() * 0.7;
    const tintRoll = rand();
    const tint =
      tintRoll > 0.985 ? "#fff1c4" :
      tintRoll > 0.94  ? "#d8e8ff" :
      tintRoll > 0.9   ? "#ffd4e0" :
      "#ffffff";
    ctx.fillStyle = tint;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    if (roll > 0.997) {
      const halo = ctx.createRadialGradient(x, y, 0, x, y, size * 6);
      halo.addColorStop(0.0, "rgba(255,255,255,0.45)");
      halo.addColorStop(1.0, "rgba(255,255,255,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(x - size * 6, y - size * 6, size * 12, size * 12);
    }
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function createNeonNebulaTexture(width = 2048, height = 1024) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const rand = seededRandom(91);

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0.0, "#04051a");
  bg.addColorStop(0.4, "#0a0a2a");
  bg.addColorStop(0.7, "#140a30");
  bg.addColorStop(1.0, "#05031a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const palette = [
    { h: 230, s: 65, l: 45 },
    { h: 260, s: 60, l: 42 },
    { h: 200, s: 70, l: 48 },
    { h: 180, s: 65, l: 45 },
    { h: 35,  s: 55, l: 45 },
  ];
  for (let i = 0; i < 16; i += 1) {
    const cx = rand() * width;
    const cy = rand() * height;
    const radius = 360 + rand() * 720;
    const c = palette[Math.floor(rand() * palette.length)];
    const innerAlpha = 0.30;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0.0,  `hsla(${c.h}, ${c.s}%, ${c.l}%, ${innerAlpha})`);
    grad.addColorStop(0.45, `hsla(${c.h + 15}, ${c.s - 5}%, ${c.l - 8}%, ${innerAlpha * 0.45})`);
    grad.addColorStop(1.0,  "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function createStarfieldPoints(count = 4500, radius = 180) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const rand = seededRandom(137);

  for (let i = 0; i < count; i += 1) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const r = radius * (0.82 + rand() * 0.18);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const warmth = rand();
    colors[i * 3] = 0.72 + warmth * 0.28;
    colors[i * 3 + 1] = 0.78 + rand() * 0.18;
    colors[i * 3 + 2] = 0.95 + rand() * 0.05;
    sizes[i] = rand() > 0.97 ? 2.2 + rand() * 1.6 : 0.55 + rand() * 1.1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      u_time: { value: 0 },
      u_energy: { value: 0 },
      u_high: { value: 0 },
    },
    vertexShader: `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vTwinkle;
      uniform float u_time;
      uniform float u_energy;
      uniform float u_high;
      void main() {
        vColor = color;
        float tw = sin(u_time * (1.4 + size * 0.35) + position.x * 0.08 + position.y * 0.11) * 0.5 + 0.5;
        vTwinkle = tw * (0.55 + u_high * 0.45);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float pointSize = size * (260.0 / -mv.z) * (1.0 + u_energy * 0.35);
        gl_PointSize = clamp(pointSize, 0.8, 5.5);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        float glow = smoothstep(0.5, 0.08, d);
        vec3 col = vColor * (core + glow * 0.45) * (0.65 + vTwinkle * 0.55);
        gl_FragColor = vec4(col, glow);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = true;
  points.renderOrder = -10;
  return points;
}
