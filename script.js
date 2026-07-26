import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createProceduralSpaceTexture, createStarfieldPoints } from "./space-background.js";

const canvas = document.getElementById("bg-canvas");
const audioUploadInput = document.getElementById("audio-upload");
const audioPlayer = document.getElementById("audio-player");
const noxOverlay = document.getElementById("nox-overlay");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const spaceBackgroundTexture = createProceduralSpaceTexture();
scene.background = spaceBackgroundTexture;
const starfield = createStarfieldPoints(1800);
scene.add(starfield);

scene.add(new THREE.AmbientLight(0x223355, 0.45));
const accretionLight = new THREE.PointLight(0xff7a2a, 2.8, 90);
accretionLight.position.set(0, 1.5, 8);
scene.add(accretionLight);
const rimLight = new THREE.PointLight(0x7eb8ff, 1.4, 70);
rimLight.position.set(-10, 6, -8);
scene.add(rimLight);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 0, 41);

const SETTINGS = {
  orbColor: "#dfedff",
  bloomStrength: 1.85,
  bloomThreshold: 0.12,
  bloomRadiusMin: 0.16,
  bloomRadiusMax: 0.92,
  rippleIntensity: 1.15,
  particleColorA: new THREE.Color("#b0c8eb"),
  particleColorB: new THREE.Color("#f1f7ff"),
  particleSizeStart: 0.295,
  particleSizeFinal: 0.11,
  blackHoleUrl: "./assets/black-hole/black-hole.fbx",
  modelUrl: "./assets/model/model.glb",
  blackHoleOnly: true,
};
const PARTICLE_PALETTE = [
  new THREE.Color("#b0c8eb"),
  new THREE.Color("#f1f7ff"),
  new THREE.Color("#ffd6e7"),
  new THREE.Color("#c9b8ff"),
  new THREE.Color("#9be7ff"),
  new THREE.Color("#ffc78a"),
];

const uniforms = {
  u_time: { value: 0 },
  u_energy: { value: 0 },
  u_low: { value: 0 },
  u_mid: { value: 0 },
  u_high: { value: 0 },
  u_click: { value: 0 },
  u_color: { value: new THREE.Color(SETTINGS.orbColor) },
  u_intensity: { value: 1.0 },
  u_alpha: { value: 1.0 },
};

const vertexShader = `
uniform float u_time; uniform float u_energy; uniform float u_low; uniform float u_mid; uniform float u_high; uniform float u_click;
varying float v_noise;
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;} vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
vec3 fade(vec3 t){return t*t*t*(t*(t*6.0-15.0)+10.0);}
float pnoise(vec3 P, vec3 rep){
  vec3 Pi0=mod(floor(P),rep),Pi1=mod(Pi0+vec3(1.0),rep); Pi0=mod289(Pi0); Pi1=mod289(Pi1);
  vec3 Pf0=fract(P),Pf1=Pf0-vec3(1.0); vec4 ix=vec4(Pi0.x,Pi1.x,Pi0.x,Pi1.x),iy=vec4(Pi0.yy,Pi1.yy),iz0=Pi0.zzzz,iz1=Pi1.zzzz;
  vec4 ixy=permute(permute(ix)+iy),ixy0=permute(ixy+iz0),ixy1=permute(ixy+iz1);
  vec4 gx0=ixy0*(1.0/7.0),gy0=fract(floor(gx0)*(1.0/7.0))-0.5; gx0=fract(gx0); vec4 gz0=vec4(0.5)-abs(gx0)-abs(gy0),sz0=step(gz0,vec4(0.0)); gx0-=sz0*(step(0.0,gx0)-0.5); gy0-=sz0*(step(0.0,gy0)-0.5);
  vec4 gx1=ixy1*(1.0/7.0),gy1=fract(floor(gx1)*(1.0/7.0))-0.5; gx1=fract(gx1); vec4 gz1=vec4(0.5)-abs(gx1)-abs(gy1),sz1=step(gz1,vec4(0.0)); gx1-=sz1*(step(0.0,gx1)-0.5); gy1-=sz1*(step(0.0,gy1)-0.5);
  vec3 g000=vec3(gx0.x,gy0.x,gz0.x),g100=vec3(gx0.y,gy0.y,gz0.y),g010=vec3(gx0.z,gy0.z,gz0.z),g110=vec3(gx0.w,gy0.w,gz0.w);
  vec3 g001=vec3(gx1.x,gy1.x,gz1.x),g101=vec3(gx1.y,gy1.y,gz1.y),g011=vec3(gx1.z,gy1.z,gz1.z),g111=vec3(gx1.w,gy1.w,gz1.w);
  vec4 norm0=taylorInvSqrt(vec4(dot(g000,g000),dot(g010,g010),dot(g100,g100),dot(g110,g110))); g000*=norm0.x; g010*=norm0.y; g100*=norm0.z; g110*=norm0.w;
  vec4 norm1=taylorInvSqrt(vec4(dot(g001,g001),dot(g011,g011),dot(g101,g101),dot(g111,g111))); g001*=norm1.x; g011*=norm1.y; g101*=norm1.z; g111*=norm1.w;
  float n000=dot(g000,Pf0),n100=dot(g100,vec3(Pf1.x,Pf0.yz)),n010=dot(g010,vec3(Pf0.x,Pf1.y,Pf0.z)),n110=dot(g110,vec3(Pf1.xy,Pf0.z));
  float n001=dot(g001,vec3(Pf0.xy,Pf1.z)),n101=dot(g101,vec3(Pf1.x,Pf0.y,Pf1.z)),n011=dot(g011,vec3(Pf0.x,Pf1.yz)),n111=dot(g111,Pf1);
  vec3 f=fade(Pf0); vec4 nz=mix(vec4(n000,n100,n010,n110),vec4(n001,n101,n011,n111),f.z); vec2 nyz=mix(nz.xy,nz.zw,f.y); return 2.2*mix(nyz.x,nyz.y,f.x);
}
void main(){
  float t=u_time;
  vec3 dir1 = normalize(vec3(sin(t*0.61), cos(t*0.49), sin(t*0.37)));
  vec3 dir2 = normalize(vec3(cos(t*0.33), sin(t*0.53), cos(t*0.27)));

  vec3 domainWarp = vec3(
    sin(position.y*1.9 + t*0.8),
    sin(position.z*1.7 - t*0.6),
    sin(position.x*2.1 + t*0.7)
  ) * (0.45 + u_mid*0.55);

  vec3 pWarp = position + domainWarp;
  float n1=pnoise(pWarp*1.15+vec3(t*0.22),vec3(10.0));
  float n2=pnoise(pWarp*2.9+vec3(t*0.47),vec3(10.0));
  float n3=abs(pnoise(pWarp*4.4+vec3(t*0.63),vec3(10.0)));
  float n4=pnoise((pWarp + dir1*2.0)*6.2+vec3(t*0.91),vec3(10.0));

  float lobeA = pow(abs(dot(normalize(position), dir1)), 2.2) * (0.45 + u_high*0.9);
  float lobeB = pow(abs(dot(normalize(position), dir2)), 2.0) * (0.35 + u_mid*0.8);
  float ridge = sin(dot(position, dir1*5.5) + t*4.1) * (0.22 + u_low*0.8);
  float pulse=sin(t*4.8+length(position)*3.2)*(0.2+u_low*1.6);

  float d=n1*(0.55+u_energy*1.9)
    + n2*(0.34+u_mid*1.0)
    + n3*(0.22+u_high*0.9)
    + n4*(0.16+u_high*0.7)
    + lobeA + lobeB + ridge + pulse + u_click*0.95;

  vec3 normalOffset=normal*d*0.62;
  vec3 flowOffset = vec3(
    sin(position.y*2.5 + t*1.1),
    sin(position.z*2.2 - t*0.9),
    sin(position.x*2.8 + t*1.0)
  ) * (0.09 + u_mid*0.26 + u_click*0.2);
  vec3 twistOffset=vec3(normal.y-normal.z,normal.z-normal.x,normal.x-normal.y)*(0.1+u_mid*0.28+u_click*0.22);
  vec3 p=position+normalOffset+twistOffset+flowOffset;
  v_noise=n1+n2*0.6+n3*0.35+n4*0.25+lobeA*0.3+lobeB*0.2;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
}`;

const fragmentShader = `
uniform vec3 u_color; uniform float u_time; uniform float u_energy; uniform float u_intensity; uniform float u_alpha; varying float v_noise;
void main(){ float shimmer=0.78+sin(u_time*3.4+v_noise*4.3)*0.16; float glow=0.62+v_noise*0.35+u_energy*0.75; gl_FragColor=vec4(u_color*shimmer*glow*u_intensity,u_alpha); }`;

const orbMaterial = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader,
  wireframe: true,
  transparent: true,
});
const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(3.7, 24), orbMaterial);
scene.add(orb);
const sideDragonOrbs = [-1, 1].map((dir) => {
  const sideOrbUniforms = {
    u_time: uniforms.u_time,
    u_energy: uniforms.u_energy,
    u_low: uniforms.u_low,
    u_mid: uniforms.u_mid,
    u_high: uniforms.u_high,
    u_click: uniforms.u_click,
    u_color: { value: new THREE.Color(dir < 0 ? "#9fd1ff" : "#ffd8a8") },
    u_intensity: { value: 0.92 },
    u_alpha: { value: 0.82 },
  };
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.6, 18),
    new THREE.ShaderMaterial({
      uniforms: sideOrbUniforms,
      vertexShader,
      fragmentShader,
      wireframe: true,
      transparent: true,
      toneMapped: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  mesh.userData = {
    dir,
    phase: Math.random() * Math.PI * 2,
    flySpeed: 2.8 + Math.random() * 1.6,
    ySpeed: 3.4 + Math.random() * 2.1,
    zSpeed: 2.7 + Math.random() * 1.8,
    orbitRadius: 2.2 + Math.random() * 2.4,
    yAmp: 0.8 + Math.random() * 0.9,
    zAmp: 0.5 + Math.random() * 0.75,
    hueBase: dir < 0 ? 0.5 : 0.08,
  };
  scene.add(mesh);
  return mesh;
});
const sideDragonStaticOrbs = [-1, 1].map((dir) => {
  const sideOrbUniforms = {
    u_time: uniforms.u_time,
    u_energy: uniforms.u_energy,
    u_low: uniforms.u_low,
    u_mid: uniforms.u_mid,
    u_high: uniforms.u_high,
    u_click: uniforms.u_click,
    u_color: { value: new THREE.Color(dir < 0 ? "#89c8ff" : "#ffc993") },
    u_intensity: { value: 0.88 },
    u_alpha: { value: 0.8 },
  };
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.35, 18),
    new THREE.ShaderMaterial({
      uniforms: sideOrbUniforms,
      vertexShader,
      fragmentShader,
      wireframe: true,
      transparent: true,
      toneMapped: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  mesh.userData = {
    dir,
    phase: Math.random() * Math.PI * 2,
    hueBase: dir < 0 ? 0.53 : 0.1,
  };
  scene.add(mesh);
  return mesh;
});

const dimUniforms = {
  u_time: uniforms.u_time,
  u_energy: uniforms.u_energy,
  u_low: uniforms.u_low,
  u_mid: uniforms.u_mid,
  u_high: uniforms.u_high,
  u_click: uniforms.u_click,
  u_color: { value: new THREE.Color("#bed4ef") },
  u_intensity: { value: 0.34 },
  u_alpha: { value: 0.38 },
};
const dimOrbMaterial = new THREE.ShaderMaterial({
  uniforms: dimUniforms,
  vertexShader,
  fragmentShader,
  wireframe: true,
  transparent: true,
});

const bigOrbConfigs = [
  { radius: 10.5, scale: 2.8, speed: 0.11, phase: 0.2, yAmp: 1.7 },
  { radius: 13.5, scale: 2.3, speed: -0.09, phase: 1.6, yAmp: 1.4 },
  { radius: 16.2, scale: 3.1, speed: 0.07, phase: 2.8, yAmp: 2.1 },
  { radius: 19.3, scale: 2.5, speed: -0.06, phase: 4.1, yAmp: 1.8 },
];
const bigOrbs = bigOrbConfigs.map((cfg) => {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(cfg.scale, 18), dimOrbMaterial);
  mesh.userData = { ...cfg };
  scene.add(mesh);
  return mesh;
});

const core = new THREE.Mesh(
  new THREE.IcosahedronGeometry(2.4, 5),
  new THREE.MeshBasicMaterial({ color: "#f4f9ff", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending })
);
scene.add(core);

const belowOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 16), dimOrbMaterial);
scene.add(belowOrb);

const dragonRig = new THREE.Group();
scene.add(dragonRig);
let dragonModel = null;

const SIMPLEX_NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

const perlinRingGroup = new THREE.Group();
perlinRingGroup.rotation.set(-Math.PI / 2 + 0.45, 0, 0);
scene.add(perlinRingGroup);

const audioRings = [];

// --- Ring A: quantized perlin polygon (cyan, low band) ---
{
  const cfg = { inner: 8.4, outer: 9.0, segments: 6, steps: 4.0, freq: 2.5, amp: 0.55, color: new THREE.Color(0x00e5ff) };
  const geo = new THREE.RingGeometry(cfg.inner, cfg.outer, cfg.segments, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      u_time:      { value: 0 },
      u_amp:       { value: cfg.amp },
      u_freq:      { value: cfg.freq },
      u_steps:     { value: cfg.steps },
      u_color:     { value: cfg.color.clone() },
      u_intensity: { value: 1.5 },
      u_peak:      { value: 0 },
    },
    vertexShader: `
      uniform float u_time, u_amp, u_freq, u_steps, u_peak;
      varying float vDisp;
      ${SIMPLEX_NOISE_GLSL}
      float quantize(float v, float s) { return floor(v * s + 0.5) / s; }
      void main() {
        vec3 pos = position;
        float r = length(pos.xy);
        float a = atan(pos.y, pos.x);
        float n1 = snoise(vec3(cos(a) * u_freq, sin(a) * u_freq, floor(u_time * 1.8) / 1.8));
        float n2 = snoise(vec3(cos(a * 1.7) * u_freq * 0.5, sin(a * 1.7) * u_freq * 0.5, floor(u_time * 1.2) / 1.2 + 17.0)) * 0.5;
        float disp = quantize(n1 + n2, u_steps) * u_amp * (1.0 + u_peak * 2.0);
        r += disp;
        pos.x = cos(a) * r;
        pos.y = sin(a) * r;
        pos.z = quantize(snoise(vec3(cos(a) * 0.6, sin(a) * 0.6, floor(u_time))), u_steps) * u_amp * (0.35 + u_peak * 1.4);
        vDisp = disp;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 u_color;
      uniform float u_intensity, u_peak;
      varying float vDisp;
      void main() {
        float glow = 0.75 + abs(vDisp) * 1.1 + u_peak * 1.6;
        gl_FragColor = vec4(u_color * (u_intensity + glow), 0.95);
      }
    `,
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, wireframe: true,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.userData = {
    type: "perlin", band: 0, peak: 0,
    baseScale: 1, scaleAmp: 0.4,
    spinX: 0, spinY: 0, spinZ: 0.18,
  };
  perlinRingGroup.add(ring);
  audioRings.push(ring);
}

// --- Ring B: wireframe Torus (lavender, mid band) ---
{
  const geo = new THREE.TorusGeometry(10.6, 0.55, 6, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x9b7dff, wireframe: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.userData = {
    type: "torus", band: 1, peak: 0,
    baseScale: 1, scaleAmp: 0.55,
    baseColor: new THREE.Color(0x9b7dff),
    spinX: 0.06, spinY: 0.04, spinZ: -0.10,
  };
  perlinRingGroup.add(ring);
  audioRings.push(ring);
}

// --- Ring C: beaded ring (mint, high band) ---
{
  const ringGroup = new THREE.Group();
  const beadCount = 18;
  const beadRadius = 12.3;
  const beads = [];
  const beadGeo = new THREE.OctahedronGeometry(0.32, 0);
  const beadMat = new THREE.MeshBasicMaterial({
    color: 0x6effb8, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  for (let i = 0; i < beadCount; i += 1) {
    const theta = (i / beadCount) * Math.PI * 2;
    const bead = new THREE.Mesh(beadGeo, beadMat.clone());
    bead.position.set(Math.cos(theta) * beadRadius, Math.sin(theta) * beadRadius, 0);
    bead.userData.phase = i * 0.6;
    ringGroup.add(bead);
    beads.push(bead);
  }
  ringGroup.userData = {
    type: "beads", band: 2, peak: 0,
    baseScale: 1, scaleAmp: 0.5,
    beads, baseColor: new THREE.Color(0x6effb8),
    spinX: 0, spinY: 0, spinZ: 0.25,
  };
  perlinRingGroup.add(ringGroup);
  audioRings.push(ringGroup);
}

// --- Ring D: TorusKnot (warm gold, low band) ---
{
  const geo = new THREE.TorusKnotGeometry(13.6, 0.35, 96, 8, 3, 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffc678, wireframe: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.userData = {
    type: "knot", band: 0, peak: 0,
    baseScale: 1, scaleAmp: 0.30,
    baseColor: new THREE.Color(0xffc678),
    spinX: -0.04, spinY: 0.10, spinZ: 0.03,
  };
  perlinRingGroup.add(ring);
  audioRings.push(ring);
}
let dragonMouthOffset = new THREE.Vector3(3.8, 0.8, 0);
const miniDragonRigs = [];
const dragonMaterial = new THREE.MeshBasicMaterial({
  color: "#7fb9ff",
  transparent: true,
  opacity: 0.62,
  side: THREE.DoubleSide,
  toneMapped: false,
  depthWrite: false,
});
const dragonInnerUniforms = {
  u_time: uniforms.u_time,
  u_energy: uniforms.u_energy,
  u_low: uniforms.u_low,
  u_mid: uniforms.u_mid,
  u_high: uniforms.u_high,
  u_click: uniforms.u_click,
  u_color: { value: new THREE.Color("#8ac4ff") },
  u_intensity: { value: 0.95 },
  u_alpha: { value: 0.66 },
};
const dragonInnerMaterial = new THREE.ShaderMaterial({
  uniforms: dragonInnerUniforms,
  vertexShader,
  fragmentShader,
  wireframe: true,
  transparent: true,
});
const dragonInnerMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(2.45, 20), dragonInnerMaterial);
dragonInnerMesh.position.set(0, -0.6, 0.15);
dragonRig.add(dragonInnerMesh);
dragonInnerMesh.visible = false;

const dragonMouthOrb = new THREE.Mesh(
  new THREE.SphereGeometry(0.26, 18, 18),
  new THREE.MeshBasicMaterial({
    color: "#f1f7ff",
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
);
dragonRig.add(dragonMouthOrb);
dragonMouthOrb.visible = false;

const miniOrbGeometry = new THREE.SphereGeometry(0.16, 14, 14);
const miniOrbs = Array.from({ length: 10 }, (_, i) => {
  const material = new THREE.MeshBasicMaterial({
    color: i % 2 === 0 ? "#b0c8eb" : "#f1f7ff",
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(miniOrbGeometry, material);
  mesh.userData = {
    radius: 3.2 + Math.random() * 3.8,
    speed: (Math.random() * 0.4 + 0.2) * (Math.random() > 0.5 ? 1 : -1),
    phase: Math.random() * Math.PI * 2,
    yAmp: 0.3 + Math.random() * 1.6,
    pulseOffset: Math.random() * Math.PI * 2,
  };
  scene.add(mesh);
  return mesh;
});
const cardinalOrbs = [];
const flyingBalls = [];
const chromaOrbs = [];


const lowerRig = new THREE.Group();
lowerRig.position.set(0, -36, 0);
scene.add(lowerRig);

const lowerUniforms = {
  u_time: uniforms.u_time,
  u_energy: uniforms.u_energy,
  u_low: uniforms.u_low,
  u_mid: uniforms.u_mid,
  u_high: uniforms.u_high,
  u_click: uniforms.u_click,
  u_color: { value: new THREE.Color("#9fc4f2") },
  u_intensity: { value: 0.62 },
  u_alpha: { value: 0.54 },
};
const lowerOrbMaterial = new THREE.ShaderMaterial({
  uniforms: lowerUniforms,
  vertexShader,
  fragmentShader,
  wireframe: true,
  transparent: true,
});
const lowerOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(2.9, 20), lowerOrbMaterial);
const lowerOrbBaseOffset = new THREE.Vector3(5.4, 0.9, -3.8);
lowerOrb.position.copy(lowerOrbBaseOffset);
lowerRig.add(lowerOrb);

const lowerMiniOrbGeometry = new THREE.SphereGeometry(0.13, 12, 12);
const lowerMiniOrbs = Array.from({ length: 14 }, () => {
  const material = new THREE.MeshBasicMaterial({
    color: "#cfe3ff",
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(lowerMiniOrbGeometry, material);
  mesh.userData = {
    radius: 2.6 + Math.random() * 2.8,
    speed: (Math.random() * 0.35 + 0.18) * (Math.random() > 0.5 ? 1 : -1),
    phase: Math.random() * Math.PI * 2,
    yAmp: 0.4 + Math.random() * 1.2,
    pulseOffset: Math.random() * Math.PI * 2,
  };
  scene.add(mesh);
  return mesh;
});


const cardinalDirections = [
  new THREE.Vector3(1, 0, 0),   // east
  new THREE.Vector3(-1, 0, 0),  // west
  new THREE.Vector3(0, 0, 1),   // north
  new THREE.Vector3(0, 0, -1),  // south
  new THREE.Vector3(1, 0, 1).normalize(),
  new THREE.Vector3(-1, 0, 1).normalize(),
  new THREE.Vector3(1, 0, -1).normalize(),
  new THREE.Vector3(-1, 0, -1).normalize(),
];
for (let i = 0; i < cardinalDirections.length; i += 1) {
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 16, 16),
    new THREE.MeshBasicMaterial({
      color: "#dbeaff",
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  orb.userData = {
    dir: cardinalDirections[i].clone(),
    baseRadius: 5.6 + (i % 4) * 1.4,
    pulseOffset: i * 0.55,
    spin: 0.15 + i * 0.03,
    yBase: (i % 2 === 0 ? 1 : -1) * (0.5 + (i % 3) * 0.22),
  };
  scene.add(orb);
  cardinalOrbs.push(orb);
}

const flyingBallGeometry = new THREE.SphereGeometry(0.13, 12, 12);
for (let i = 0; i < 16; i += 1) {
  const ball = new THREE.Mesh(
    flyingBallGeometry,
    new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? "#d9e9ff" : "#b9d4ff",
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      depthWrite: false,
    })
  );
  ball.userData = {
    radius: 7.6 + Math.random() * 8.4,
    speed: (Math.random() * 0.34 + 0.12) * (Math.random() > 0.5 ? 1 : -1),
    phase: Math.random() * Math.PI * 2,
    verticalDrift: 1.2 + Math.random() * 5.2,
    bandOffset: (Math.random() - 0.5) * 10.5,
    tilt: (Math.random() - 0.5) * 0.85,
    pulseOffset: Math.random() * Math.PI * 2,
  };
  scene.add(ball);
  flyingBalls.push(ball);
}
for (let i = 0; i < 8; i += 1) {
  const chromaOrb = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 14, 14),
    new THREE.MeshBasicMaterial({
      color: "#d8ebff",
      transparent: true,
      opacity: 0.74,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      depthWrite: false,
    })
  );
  chromaOrb.userData = {
    radius: 10.5 + Math.random() * 18.5,
    speed: 0.22 + Math.random() * 0.62,
    verticalSpeed: 0.6 + Math.random() * 1.0,
    phase: Math.random() * Math.PI * 2,
    yBand: (Math.random() - 0.5) * 18,
    pulseOffset: Math.random() * Math.PI * 2,
    hueOffset: Math.random() * 0.9,
  };
  scene.add(chromaOrb);
  chromaOrbs.push(chromaOrb);
}

const backgroundMesh = new THREE.Mesh(
  new THREE.IcosahedronGeometry(24, 5),
  new THREE.ShaderMaterial({
    uniforms: {
      u_time: uniforms.u_time,
      u_energy: uniforms.u_energy,
      u_low: uniforms.u_low,
      u_mid: uniforms.u_mid,
      u_high: uniforms.u_high,
      u_color: { value: new THREE.Color("#7ab4ff") },
      u_cursor: { value: new THREE.Vector2(0, 0) },
      u_cursor_strength: { value: 0 },
      u_alpha: { value: 0.16 },
    },
    vertexShader: `
uniform float u_time;
uniform float u_energy;
uniform float u_low;
uniform float u_mid;
uniform float u_high;
uniform vec2 u_cursor;
uniform float u_cursor_strength;
varying float v_wave;

vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
vec3 fade(vec3 t){return t*t*t*(t*(t*6.0-15.0)+10.0);}
float pnoise(vec3 P, vec3 rep){
  vec3 Pi0=mod(floor(P),rep),Pi1=mod(Pi0+vec3(1.0),rep); Pi0=mod289(Pi0); Pi1=mod289(Pi1);
  vec3 Pf0=fract(P),Pf1=Pf0-vec3(1.0); vec4 ix=vec4(Pi0.x,Pi1.x,Pi0.x,Pi1.x),iy=vec4(Pi0.yy,Pi1.yy),iz0=Pi0.zzzz,iz1=Pi1.zzzz;
  vec4 ixy=permute(permute(ix)+iy),ixy0=permute(ixy+iz0),ixy1=permute(ixy+iz1);
  vec4 gx0=ixy0*(1.0/7.0),gy0=fract(floor(gx0)*(1.0/7.0))-0.5; gx0=fract(gx0); vec4 gz0=vec4(0.5)-abs(gx0)-abs(gy0),sz0=step(gz0,vec4(0.0)); gx0-=sz0*(step(0.0,gx0)-0.5); gy0-=sz0*(step(0.0,gy0)-0.5);
  vec4 gx1=ixy1*(1.0/7.0),gy1=fract(floor(gx1)*(1.0/7.0))-0.5; gx1=fract(gx1); vec4 gz1=vec4(0.5)-abs(gx1)-abs(gy1),sz1=step(gz1,vec4(0.0)); gx1-=sz1*(step(0.0,gx1)-0.5); gy1-=sz1*(step(0.0,gy1)-0.5);
  vec3 g000=vec3(gx0.x,gy0.x,gz0.x),g100=vec3(gx0.y,gy0.y,gz0.y),g010=vec3(gx0.z,gy0.z,gz0.z),g110=vec3(gx0.w,gy0.w,gz0.w);
  vec3 g001=vec3(gx1.x,gy1.x,gz1.x),g101=vec3(gx1.y,gy1.y,gz1.y),g011=vec3(gx1.z,gy1.z,gz1.z),g111=vec3(gx1.w,gy1.w,gz1.w);
  vec4 norm0=taylorInvSqrt(vec4(dot(g000,g000),dot(g010,g010),dot(g100,g100),dot(g110,g110))); g000*=norm0.x; g010*=norm0.y; g100*=norm0.z; g110*=norm0.w;
  vec4 norm1=taylorInvSqrt(vec4(dot(g001,g001),dot(g011,g011),dot(g101,g101),dot(g111,g111))); g001*=norm1.x; g011*=norm1.y; g101*=norm1.z; g111*=norm1.w;
  float n000=dot(g000,Pf0),n100=dot(g100,vec3(Pf1.x,Pf0.yz)),n010=dot(g010,vec3(Pf0.x,Pf1.y,Pf0.z)),n110=dot(g110,vec3(Pf1.xy,Pf0.z));
  float n001=dot(g001,vec3(Pf0.xy,Pf1.z)),n101=dot(g101,vec3(Pf1.x,Pf0.y,Pf1.z)),n011=dot(g011,vec3(Pf0.x,Pf1.yz)),n111=dot(g111,Pf1);
  vec3 f=fade(Pf0); vec4 nz=mix(vec4(n000,n100,n010,n110),vec4(n001,n101,n011,n111),f.z); vec2 nyz=mix(nz.xy,nz.zw,f.y); return 2.2*mix(nyz.x,nyz.y,f.x);
}

void main() {
  float t = u_time;
  float audioReact = pow(max(u_energy, 0.0), 0.58) * 2.1;
  vec3 p = position;
  vec3 dir1 = normalize(vec3(sin(t * 0.61), cos(t * 0.49), sin(t * 0.37)));
  vec3 dir2 = normalize(vec3(cos(t * 0.33), sin(t * 0.53), cos(t * 0.27)));
  vec2 cursorNorm = normalize(u_cursor + vec2(0.0001));
  float cursorPull = dot(normalize(position.xy + vec2(0.0001)), cursorNorm);

  vec3 domainWarp = vec3(
    sin(position.y * 1.75 + t * 0.92),
    sin(position.z * 1.58 - t * 0.68),
    sin(position.x * 1.95 + t * 0.74)
  ) * (0.35 + u_mid * 0.55 + audioReact * 0.22);
  vec3 pWarp = position + domainWarp;

  float n1 = pnoise(pWarp * 1.05 + vec3(t * 0.21), vec3(10.0));
  float n2 = pnoise(pWarp * 2.55 + vec3(-t * 0.43), vec3(10.0));
  float n3 = abs(pnoise(pWarp * 4.1 + vec3(t * 0.65), vec3(10.0)));
  float n4 = pnoise((pWarp + dir1 * 1.4) * 5.8 + vec3(t * 0.88), vec3(10.0));
  float lobeA = pow(abs(dot(normalize(position), dir1)), 2.0) * (0.24 + u_high * 0.62);
  float lobeB = pow(abs(dot(normalize(position), dir2)), 1.85) * (0.18 + u_mid * 0.52);
  float ridge = sin(dot(position, dir1 * 4.9) + t * 3.9) * (0.11 + u_low * 0.46);
  float ripple = sin(length(position) * 1.05 - t * (1.2 + u_high * 1.8)) * 0.28;
  float cursorWave = cursorPull * (0.22 + u_cursor_strength * 0.6);

  float disp = n1 * 0.76 + n2 * 0.48 + n3 * 0.32 + n4 * 0.24 + lobeA + lobeB + ridge + ripple + cursorWave;
  disp *= 0.42 + audioReact * 1.3;

  p += normal * disp * 2.22;
  p.xy += u_cursor * (0.38 + audioReact * 0.72);
  p += vec3(
    sin(position.y * 2.2 + t * 1.0),
    sin(position.z * 2.0 - t * 0.86),
    sin(position.x * 2.35 + t * 0.95)
  ) * (0.05 + u_mid * 0.18 + u_cursor_strength * 0.15);

  v_wave = disp;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`,
    fragmentShader: `
uniform vec3 u_color;
uniform float u_time;
uniform float u_energy;
uniform float u_alpha;
varying float v_wave;

void main() {
  float audioReact = pow(max(u_energy, 0.0), 0.55) * 2.0;
  float pulse = 0.7 + sin(u_time * 2.2 + v_wave * 5.2) * 0.22 + audioReact * 0.64;
  float flash = abs(sin(u_time * 4.8 + v_wave * 7.5)) * (0.16 + audioReact * 0.24);
  vec3 col = u_color * (pulse + flash);
  gl_FragColor = vec4(col, u_alpha);
}`,
    wireframe: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    depthWrite: false,
  })
);
backgroundMesh.position.set(-1.4, 4.2, -44);
scene.add(backgroundMesh);

const giantBackgroundOrbUniforms = {
  u_time: uniforms.u_time,
  u_energy: uniforms.u_energy,
  u_low: uniforms.u_low,
  u_mid: uniforms.u_mid,
  u_high: uniforms.u_high,
  u_click: uniforms.u_click,
  u_color: { value: new THREE.Color("#90c8ff") },
  u_intensity: { value: 1.05 },
  u_alpha: { value: 0.28 },
};
const giantBackgroundOrb = new THREE.Mesh(
  new THREE.IcosahedronGeometry(32, 7),
  new THREE.ShaderMaterial({
    uniforms: giantBackgroundOrbUniforms,
    vertexShader,
    fragmentShader,
    wireframe: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    depthWrite: false,
  })
);
giantBackgroundOrb.position.set(1.8, -2.6, -92);
scene.add(giantBackgroundOrb);

const blackHoleLoader = new FBXLoader();
blackHoleLoader.setResourcePath("./assets/black-hole/textures/");
// RINGS-ONLY MODE: disable all 3D object file loading (FBX). Only native perlin rings render.
blackHoleLoader.load = () => {};
const textureLoader = new THREE.TextureLoader();
textureLoader.setPath("./assets/black-hole/textures/");

const ringMeshes = [];
const blackHoleTextures = {
  ring: textureLoader.load("blackholering_1_color.png"),
  ringBump: textureLoader.load("blackholering_2_bump.png"),
  light1: textureLoader.load("blackholelight_1_color.png"),
  light2: textureLoader.load("blackholelight_2_color.png"),
  light3: textureLoader.load("blackholelight_3_color.png"),
  planet: textureLoader.load("planet.png"),
};
Object.values(blackHoleTextures).forEach((tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
});

function applyBlackHoleMaterial(mesh) {
  const name = (mesh.name || "").toLowerCase();
  if (name.includes("planet")) {
    mesh.material = new THREE.MeshStandardMaterial({
      map: blackHoleTextures.planet,
      emissive: new THREE.Color("#1a2030"),
      emissiveIntensity: 0.35,
      metalness: 0.1,
      roughness: 0.85,
    });
    return;
  }
  if (name.includes("ring")) {
    mesh.material = new THREE.MeshStandardMaterial({
      map: blackHoleTextures.ring,
      bumpMap: blackHoleTextures.ringBump,
      bumpScale: 0.08,
      emissive: new THREE.Color("#ff8a2a"),
      emissiveMap: blackHoleTextures.ring,
      emissiveIntensity: 0.55,
      metalness: 0.35,
      roughness: 0.42,
      side: THREE.DoubleSide,
    });
    mesh.userData.baseScale = mesh.scale.clone();
    mesh.userData.basePosition = mesh.position.clone();
    mesh.userData.baseRotation = mesh.rotation.clone();
    mesh.userData.phase = ringMeshes.length * 1.37;
    mesh.userData.spinRate = 0.08 + ringMeshes.length * 0.045;
    mesh.userData.peak = 0;
    mesh.userData.band = ringMeshes.length % 3;
    ringMeshes.push(mesh);
    return;
  }
  if (name.includes("light") || name.includes("glow")) {
    const lightTex =
      name.includes("3") ? blackHoleTextures.light3 :
      name.includes("2") ? blackHoleTextures.light2 :
      blackHoleTextures.light1;
    mesh.material = new THREE.MeshBasicMaterial({
      map: lightTex,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    return;
  }
  mesh.material = new THREE.MeshStandardMaterial({
    color: "#050505",
    emissive: new THREE.Color("#ff6a1a"),
    emissiveIntensity: 0.8,
    metalness: 0.2,
    roughness: 0.65,
  });
}

let dragonTopOffset = 6.5;
blackHoleLoader.load(
  SETTINGS.blackHoleUrl,
  (model) => {
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      applyBlackHoleMaterial(obj);
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = 12;
    const scale = targetSize / maxDim;
    const scaledHeight = size.y * scale;
    dragonTopOffset = scaledHeight * 0.5;
    model.position.sub(center);
    model.scale.setScalar(scale);

    dragonRig.add(model);
    dragonRig.position.set(0, 0, 0);
    dragonModel = model;
  },
  undefined,
  (err) => {
    console.error("Black hole model failed to load:", err);
  }
);

const modelRig = new THREE.Group();
modelRig.position.set(0, 0, -88);
scene.add(modelRig);
let modelScene = null;

const modelAmbient = new THREE.AmbientLight(0x445577, 0.55);
const modelKeyLight = new THREE.DirectionalLight(0xfff0e0, 1.6);
modelKeyLight.position.set(6, 10, 8);
const modelFillLight = new THREE.PointLight(0x8ab4ff, 1.2, 50);
modelFillLight.position.set(-8, 4, 6);
const modelRimLight = new THREE.PointLight(0xff9040, 0.9, 45);
modelRimLight.position.set(0, 2, -10);
modelRig.add(modelAmbient, modelKeyLight, modelFillLight, modelRimLight);

const gltfLoader = new GLTFLoader();
// RINGS-ONLY MODE: disable all 3D object file loading (GLB). Only native perlin rings render.
gltfLoader.load = () => {};
let modelLoadState = "idle";

const prophetRig = new THREE.Group();
prophetRig.position.set(0, -2, 3);
scene.add(prophetRig);
let prophetModel = null;
let prophetBaseScale = 1;
const prophetGlowMats = [];
const prophetKeyLight = new THREE.DirectionalLight(0xfff0e0, 1.6);
prophetKeyLight.position.set(6, 10, 8);
const prophetRimLight = new THREE.PointLight(0xff9040, 1.4, 35);
prophetRimLight.position.set(0, 2, -6);
const prophetFillLight = new THREE.PointLight(0x7eb8ff, 1.0, 30);
prophetFillLight.position.set(-6, 4, 6);
prophetRig.add(prophetKeyLight, prophetRimLight, prophetFillLight);

const angelRig = new THREE.Group();
angelRig.position.set(0, -2, 3);
scene.add(angelRig);
let angelModel = null;
let angelBaseScale = 1;
const angelGlowMats = [];
const angelKey = new THREE.DirectionalLight(0xfff0e0, 1.5);
angelKey.position.set(4, 8, 6);
const angelRim = new THREE.PointLight(0xff8a2a, 1.4, 30);
angelRim.position.set(0, 2, -6);
const angelFill = new THREE.PointLight(0x7eb8ff, 1.0, 28);
angelFill.position.set(-6, 4, 6);
angelRig.add(angelKey, angelRim, angelFill);

const m2Rig = new THREE.Group();
m2Rig.position.set(80, -2, 0);
scene.add(m2Rig);
let m2Model = null;
let m2BaseScale = 1;
const m2Key = new THREE.DirectionalLight(0xfff0e0, 1.3);
m2Key.position.set(4, 8, 6);
const m2Rim = new THREE.PointLight(0xff8a2a, 1.0, 25);
m2Rim.position.set(0, 2, -6);
m2Rig.add(m2Key, m2Rim);

const achatesRig = new THREE.Group();
achatesRig.position.set(0, -12, 9);
scene.add(achatesRig);
let achatesModel = null;
let achatesBaseScale = 1;
const achatesGlowMats = [];
const achatesKey = new THREE.DirectionalLight(0xfff8e8, 1.3);
achatesKey.position.set(4, 8, 6);
const achatesRim = new THREE.PointLight(0xe8eeff, 1.0, 25);
achatesRim.position.set(0, 2, 4);
achatesRig.add(achatesKey, achatesRim);

gltfLoader.load(
  "./assets/prophet/achates.glb",
  (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const targetSize = 0.5;
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    model.scale.setScalar(scale);
    model.position.copy(center).multiplyScalar(-scale);
    model.rotation.y = Math.PI;
    achatesBaseScale = scale;
    achatesRig.add(model);
    achatesModel = model;

    const glowTargets = [];
    model.traverse((obj) => {
      if (obj.isMesh && obj.geometry) glowTargets.push(obj);
    });
    for (const obj of glowTargets) {
      const glowMat = new THREE.ShaderMaterial({
        uniforms: {
          u_time: { value: 0 },
          u_color: { value: new THREE.Color("#f4f8ff") },
          u_intensity: { value: 0.15 },
          u_peak: { value: 0 },
        },
        vertexShader: `
          uniform float u_time;
          uniform float u_peak;
          varying float vFresnel;
          varying float vNoise;
          ${SIMPLEX_NOISE_GLSL}
          void main() {
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            vec3 nrm = normalize(normalMatrix * normal);
            vec3 viewDir = normalize(-mvPos.xyz);
            vFresnel = pow(1.0 - max(dot(nrm, viewDir), 0.0), 2.0);
            float n = snoise(position * 1.6 + vec3(0.0, u_time * 0.5, u_time * 0.25));
            vNoise = n * 0.5 + 0.5;
            vec3 displaced = position + normal * (0.01 + n * 0.006);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 u_color;
          uniform float u_intensity;
          uniform float u_peak;
          varying float vFresnel;
          varying float vNoise;
          void main() {
            float fresnelGlow = vFresnel * (u_intensity + u_peak * 0.8) * (0.55 + vNoise * 0.45);
            float ambientGlow = (u_intensity * 0.25 + u_peak * 0.4) * (0.5 + vNoise * 0.4);
            float glow = fresnelGlow + ambientGlow;
            float alpha = clamp(glow * (0.35 + u_peak * 0.25), 0.0, 0.5);
            gl_FragColor = vec4(u_color * glow, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const glowMesh = new THREE.Mesh(obj.geometry, glowMat);
      glowMesh.renderOrder = 2;
      obj.add(glowMesh);
      achatesGlowMats.push(glowMat);
    }
  },
  undefined,
  (err) => {
    console.error("achates model failed to load:", err);
  }
);

const phoenixRig = new THREE.Group();
phoenixRig.position.set(0, 45, 3);
scene.add(phoenixRig);
let phoenixModel = null;
let phoenixBaseScale = 1;
let phoenixMixer = null;
const phoenixWingMeshes = [];
const phoenixKey = new THREE.DirectionalLight(0xfff0e0, 1.4);
phoenixKey.position.set(4, 8, 6);
const phoenixRim = new THREE.PointLight(0xff8a2a, 1.6, 28);
phoenixRim.position.set(0, 2, -6);
phoenixRig.add(phoenixKey, phoenixRim);

gltfLoader.load(
  "./assets/prophet/phoenix_bird.glb",
  (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const targetSize = 50;
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    model.scale.setScalar(scale);
    model.position.copy(center).multiplyScalar(-scale);
    phoenixBaseScale = scale;
    phoenixRig.add(model);
    phoenixModel = model;

    if (gltf.animations && gltf.animations.length > 0) {
      phoenixMixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) {
        phoenixMixer.clipAction(clip).play();
      }
      console.log("[phoenix] playing", gltf.animations.length, "built-in animations");
    } else {
      model.traverse((obj) => {
        if (!obj.isMesh && !obj.isBone) return;
        const name = (obj.name || "").toLowerCase();
        if (name.includes("wing") || name.includes("feather") || name.includes("pinion")) {
          phoenixWingMeshes.push({ obj, baseRotZ: obj.rotation.z, baseRotX: obj.rotation.x, side: obj.position.x >= 0 ? 1 : -1 });
        }
      });
      console.log("[phoenix] no clips; procedural wing meshes:", phoenixWingMeshes.length);
    }
  },
  undefined,
  (err) => {
    console.error("phoenix model failed to load:", err);
  }
);

const titanRig = new THREE.Group();
titanRig.position.set(24.7, -2, 76.1);
scene.add(titanRig);
let titanModel = null;
let titanBaseScale = 1;
const titanKey = new THREE.DirectionalLight(0xfff0e0, 1.3);
titanKey.position.set(4, 8, 6);
const titanRim = new THREE.PointLight(0xff8a2a, 1.0, 25);
titanRim.position.set(0, 2, -6);
titanRig.add(titanKey, titanRim);

gltfLoader.load(
  "./assets/prophet/titan.glb",
  (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const targetSize = 40;
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    model.scale.setScalar(scale);
    model.position.copy(center).multiplyScalar(-scale);
    titanBaseScale = scale;
    titanRig.add(model);
    titanModel = model;
  },
  undefined,
  (err) => { console.error("titan model failed to load:", err); }
);

const hyperRig = new THREE.Group();
hyperRig.position.set(24.7, -2, -76.1);
scene.add(hyperRig);
let hyperModel = null;
let hyperBaseScale = 1;
const hyperKey = new THREE.DirectionalLight(0xfff0e0, 1.3);
hyperKey.position.set(4, 8, 6);
const hyperRim = new THREE.PointLight(0xff8a2a, 1.0, 25);
hyperRim.position.set(0, 2, -6);
hyperRig.add(hyperKey, hyperRim);

gltfLoader.load(
  "./assets/prophet/hyper.glb",
  (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const targetSize = 40;
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    model.scale.setScalar(scale);
    model.position.copy(center).multiplyScalar(-scale);
    hyperBaseScale = scale;
    hyperRig.add(model);
    hyperModel = model;
  },
  undefined,
  (err) => { console.error("hyper model failed to load:", err); }
);

const jeromeRig = new THREE.Group();
jeromeRig.position.set(-64.7, -2, -47.0);
scene.add(jeromeRig);
let jeromeModel = null;
let jeromeBaseScale = 1;
const jeromeKey = new THREE.DirectionalLight(0xfff0e0, 1.3);
jeromeKey.position.set(4, 8, 6);
const jeromeRim = new THREE.PointLight(0xff8a2a, 1.0, 25);
jeromeRim.position.set(0, 2, -6);
jeromeRig.add(jeromeKey, jeromeRim);

gltfLoader.load(
  "./assets/prophet/jerome.glb",
  (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const targetSize = 40;
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    model.scale.setScalar(scale);
    model.position.copy(center).multiplyScalar(-scale);
    jeromeBaseScale = scale;
    jeromeRig.add(model);
    jeromeModel = model;
  },
  undefined,
  (err) => {
    console.error("jerome model failed to load:", err);
  }
);

const soldierRig = new THREE.Group();
soldierRig.position.set(-64.7, -2, 47.0);
scene.add(soldierRig);
let soldierModel = null;
let soldierBaseScale = 1;
const soldierKey = new THREE.DirectionalLight(0xfff0e0, 1.3);
soldierKey.position.set(4, 8, 6);
const soldierRim = new THREE.PointLight(0xff8a2a, 1.0, 25);
soldierRim.position.set(0, 2, -6);
soldierRig.add(soldierKey, soldierRim);

gltfLoader.load(
  "./assets/prophet/cyber150k.glb",
  (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const targetSize = 40;
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    model.scale.setScalar(scale);
    model.position.copy(center).multiplyScalar(-scale);
    soldierBaseScale = scale;
    soldierRig.add(model);
    soldierModel = model;
  },
  undefined,
  (err) => {
    console.error("soldier model failed to load:", err);
  }
);

gltfLoader.load(
  "./assets/prophet/m2_tri150k.glb",
  (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const targetSize = 55;
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    model.scale.setScalar(scale);
    model.position.copy(center).multiplyScalar(-scale);
    m2BaseScale = scale;
    m2Rig.add(model);
    m2Model = model;
  },
  undefined,
  (err) => {
    console.error("m2 model failed to load:", err);
  }
);

gltfLoader.load(
  "./assets/prophet/angel_warrior.glb",
  (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const targetSize = 18;
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    model.scale.setScalar(scale);
    model.position.copy(center).multiplyScalar(-scale);
    model.rotation.y = Math.PI;
    angelBaseScale = scale;
    angelRig.add(model);
    angelModel = model;

    const glowTargets = [];
    model.traverse((obj) => {
      if (obj.isMesh && obj.geometry) glowTargets.push(obj);
    });
    for (const obj of glowTargets) {
      const glowMat = new THREE.ShaderMaterial({
        uniforms: {
          u_time: { value: 0 },
          u_color: { value: new THREE.Color("#ff7a20") },
          u_intensity: { value: 0.1 },
          u_peak: { value: 0 },
        },
        vertexShader: `
          uniform float u_time;
          uniform float u_peak;
          varying float vFresnel;
          varying float vNoise;
          varying float vWingTip;
          ${SIMPLEX_NOISE_GLSL}
          void main() {
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            vec3 nrm = normalize(normalMatrix * normal);
            vec3 viewDir = normalize(-mvPos.xyz);
            vFresnel = pow(1.0 - max(dot(nrm, viewDir), 0.0), 2.0);
            float n = snoise(position * 1.6 + vec3(0.0, u_time * 0.6, u_time * 0.3));
            vNoise = n * 0.5 + 0.5;
            float lateral = abs(position.x);
            vWingTip = smoothstep(0.04, 0.18, lateral);
            float tipDisp = vWingTip * (0.025 + u_peak * 0.08);
            vec3 displaced = position + normal * (0.015 + n * (0.01 + u_peak * 0.05) + tipDisp);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 u_color;
          uniform float u_intensity;
          uniform float u_peak;
          varying float vFresnel;
          varying float vNoise;
          varying float vWingTip;
          void main() {
            float fresnelGlow = vFresnel * (u_intensity + u_peak * 1.4) * (0.6 + vNoise * 0.5);
            float ambientGlow = (u_intensity * 0.7 + u_peak * 1.2) * (0.55 + vNoise * 0.5);
            float tipGlow = vWingTip * (0.6 + u_peak * 1.4) * (0.6 + vNoise * 0.4);
            float glow = fresnelGlow + ambientGlow + tipGlow;
            float alpha = clamp(glow * (0.55 + u_peak * 0.35), 0.0, 0.9);
            gl_FragColor = vec4(u_color * glow, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const glowMesh = new THREE.Mesh(obj.geometry, glowMat);
      glowMesh.renderOrder = 2;
      obj.add(glowMesh);
      angelGlowMats.push(glowMat);
    }
  },
  undefined,
  (err) => {
    console.error("Angel model failed to load:", err);
  }
);

function loadModelView() {
  if (modelLoadState !== "idle") return;
  modelLoadState = "loading";
  gltfLoader.load(
    SETTINGS.modelUrl,
    (gltf) => {
      const model = gltf.scene;
      model.traverse((child) => {
        if (!child.isMesh) return;
        if (child.material) {
          child.material = child.material.clone();
          child.material.side = THREE.DoubleSide;
        }
      });

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetSize = 14;
      const scale = targetSize / maxDim;
      model.position.sub(center);
      model.scale.setScalar(scale);
      model.userData.displayScale = scale;
      modelRig.add(model);
      modelScene = model;
      viewTargets.model.copy(modelRig.position);
      modelLoadState = "ready";
      if (activeView === "model") updateViewVisibility();
    },
    undefined,
    (err) => {
      modelLoadState = "idle";
      console.error("Model view GLB failed to load:", err);
    }
  );
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = true;
controls.panSpeed = 0.8;
controls.rotateSpeed = 0.8;
controls.zoomSpeed = 1.1;
controls.minDistance = 1.2;
controls.maxDistance = 42;

function initDragData(object) {
  if (!object.userData.dragOffset) object.userData.dragOffset = new THREE.Vector3();
}
initDragData(dragonRig);
initDragData(orb);
initDragData(lowerRig);
initDragData(modelRig);

const viewTargets = {
  dragon: new THREE.Vector3(0, 0, 0),
  lower: lowerRig.position.clone(),
  model: modelRig.position.clone(),
};
let activeView = "dragon";
let nav = null;

// RINGS-ONLY MODE: nothing decorative is shown/hidden on view changes; only the glowing rings remain.
const mainViewObjects = [];

function updateViewVisibility() {
  const inMain = activeView === "dragon";
  const inLower = activeView === "lower";
  const inModel = activeView === "model";

  for (const obj of mainViewObjects) obj.visible = inMain;
  for (const miniRig of miniDragonRigs) miniRig.visible = inMain;
  orb.visible = inMain && !SETTINGS.blackHoleOnly;
  lowerRig.visible = inLower;
  for (const miniOrb of lowerMiniOrbs) miniOrb.visible = inLower;
  modelRig.visible = inModel;
}

function navigateToTarget(name) {
  if (name === "model") loadModelView();
  activeView = name;
  updateViewVisibility();
  const targetPoint = viewTargets[name].clone();
  navigateToPoint(targetPoint);
}

function navigateToPoint(targetPoint) {
  const viewDir = new THREE.Vector3().subVectors(camera.position, controls.target);
  if (viewDir.lengthSq() < 0.001) viewDir.set(0, 0, 15);
  viewDir.setLength(15);
  nav = {
    t: 0,
    fromTarget: controls.target.clone(),
    toTarget: targetPoint.clone(),
    fromCamera: camera.position.clone(),
    toCamera: targetPoint.clone().add(viewDir),
  };
}

function removeAnyControlPanels() {
  document
    .querySelectorAll(
      ".dg, .lil-gui, [title='Open Controls'], [aria-label='Open Controls'], .gui-wrap"
    )
    .forEach((el) => el.remove());
}
removeAnyControlPanels();

const satellites = [];
for (let i = 0; i < 12; i += 1) {
  const sat = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 2), dimOrbMaterial);
  const pivot = new THREE.Group();
  sat.position.set(6 + Math.random() * 4, 0, 0);
  pivot.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  pivot.userData.speed = 0.0012 + Math.random() * 0.004;
  sat.userData.spin = 0.004 + Math.random() * 0.022;
  pivot.add(sat);
  scene.add(pivot);
  satellites.push({ pivot, sat });
}

if (SETTINGS.blackHoleOnly) {
  orb.visible = false;
  core.visible = false;
  belowOrb.visible = false;
  for (const bigOrb of bigOrbs) bigOrb.visible = false;
  for (const { pivot } of satellites) pivot.visible = false;
}

updateViewVisibility();

// RINGS-ONLY MODE: hide every decorative/native mesh except the glowing perlin rings + starfield.
[
  orb, core, belowOrb, backgroundMesh, giantBackgroundOrb,
  ...bigOrbs,
  ...sideDragonOrbs, ...sideDragonStaticOrbs,
  ...miniOrbs, ...lowerMiniOrbs,
  ...cardinalOrbs, ...flyingBalls, ...chromaOrbs,
  dragonInnerMesh, dragonMouthOrb, lowerOrb,
].forEach((o) => { if (o) o.visible = false; });
for (const { pivot } of satellites) pivot.visible = false;

const maxParticles = 1200;
const positions = new Float32Array(maxParticles * 3);
const velocities = new Float32Array(maxParticles * 3);
const lifetimes = new Float32Array(maxParticles);
for (let i = 0; i < maxParticles; i += 1) positions.set([9999, 9999, 9999], i * 3);

const particleGeo = new THREE.BufferGeometry();
particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
const particleMat = new THREE.PointsMaterial({
  color: SETTINGS.particleColorA,
  size: SETTINGS.particleSizeStart,
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
scene.add(new THREE.Points(particleGeo, particleMat));
setTimeout(() => (particleMat.size = SETTINGS.particleSizeFinal), 250);

let head = 0;
const spawnParticle = (energy, high) => {
  const i = head;
  head = (head + 1) % maxParticles;
  const idx = i * 3;
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.048 + energy * 0.52 * SETTINGS.rippleIntensity + high * 0.22;
  positions[idx] = 0; positions[idx + 1] = 0; positions[idx + 2] = 0;
  velocities[idx] = Math.cos(angle) * speed;
  velocities[idx + 1] = (Math.random() - 0.5) * (0.024 + high * 0.06);
  velocities[idx + 2] = Math.sin(angle) * speed;
  lifetimes[i] = 1;
};

const updateParticles = (delta) => {
  for (let i = 0; i < maxParticles; i += 1) {
    if (lifetimes[i] <= 0) continue;
    const idx = i * 3;
    positions[idx] += velocities[idx];
    positions[idx + 1] += velocities[idx + 1];
    positions[idx + 2] += velocities[idx + 2];
    lifetimes[i] -= delta * 0.32;
    if (lifetimes[i] <= 0) positions.set([9999, 9999, 9999], idx);
  }
  particleGeo.attributes.position.needsUpdate = true;
};

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), SETTINGS.bloomStrength, 0.55, SETTINGS.bloomThreshold);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(bloomPass);

let audioContext, analyser, frequencyData, activeSource, micStream, outputGain;
let audioElementSourceInitialized = false;
const ensureAudio = () => {
  if (audioContext) return;
  audioContext = new window.AudioContext();
  analyser = audioContext.createAnalyser();
  outputGain = audioContext.createGain();
  outputGain.gain.value = 1;
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.82;
  frequencyData = new Uint8Array(analyser.frequencyBinCount);
  analyser.connect(outputGain);
  outputGain.connect(audioContext.destination);
};

const useAudioElement = () => {
  ensureAudio();
  outputGain.gain.value = 1;
  if (activeSource) activeSource.disconnect();
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  if (!audioElementSourceInitialized) { activeSource = audioContext.createMediaElementSource(audioPlayer); audioElementSourceInitialized = true; }
  if (activeSource) activeSource.connect(analyser);
};

const activateAudioFromPlayer = async () => {
  if (!audioPlayer.src) return;
  ensureAudio();
  useAudioElement();
  if (audioContext.state === "suspended") await audioContext.resume();
};

const useMic = async () => {
  ensureAudio();
  if (audioContext.state === "suspended") await audioContext.resume();
  outputGain.gain.value = 0;
  if (activeSource) activeSource.disconnect();
  if (micStream) micStream.getTracks().forEach((t) => t.stop());
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  activeSource = audioContext.createMediaStreamSource(micStream);
  activeSource.connect(analyser);
};

audioUploadInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  audioPlayer.src = URL.createObjectURL(file);
  await activateAudioFromPlayer();
  await audioPlayer.play();
});

audioPlayer.addEventListener("play", () => {
  activateAudioFromPlayer().catch((err) => {
    console.error("Audio analyzer hook failed:", err);
  });
});

let micAutoStartTried = false;
async function tryAutoStartMic() {
  if (micAutoStartTried) return;
  micAutoStartTried = true;
  try {
    await useMic();
    console.log("[mic] active");
  } catch (err) {
    console.error("[mic] denied or failed:", err);
    micAutoStartTried = false;
  }
}
window.addEventListener("pointerdown", () => {
  if (audioContext?.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  tryAutoStartMic();
}, { once: false });

window.addEventListener("keydown", async (event) => {
  if (event.code === "KeyU") audioUploadInput.click();
  if (event.code === "KeyM") {
    cameraLoopEnabled = !cameraLoopEnabled;
    try { await useMic(); } catch (e) { console.error("Microphone access failed:", e); }
  }
  if (event.code === "KeyN") cameraLoopEnabled = !cameraLoopEnabled;
  if (event.code === "KeyC") {
    m2Rig.visible = !m2Rig.visible;
    soldierRig.visible = m2Rig.visible;
    jeromeRig.visible = m2Rig.visible;
    titanRig.visible = m2Rig.visible;
    hyperRig.visible = m2Rig.visible;
  }
  if (event.code === "KeyV") runAutoCFlicker();
  if (event.code === "Digit1") navigateToTarget("dragon");
  if (event.code === "Digit2") navigateToTarget("lower");
  if (event.code === "Digit3") navigateToTarget("model");
  if (event.code === "Space") {
    event.preventDefault();
    if (!audioPlayer.src) return;
    ensureAudio();
    if (audioContext.state === "suspended") await audioContext.resume();
    if (audioPlayer.paused) { useAudioElement(); await audioPlayer.play(); } else audioPlayer.pause();
  }
});
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const backgroundCursorTarget = new THREE.Vector2();
const backgroundCursorCurrent = new THREE.Vector2();
let backgroundCursorKick = 0;
let clickImpulse = 0;

const cameraShiftTarget = new THREE.Vector3();
const cameraShiftCurrent = new THREE.Vector3();
const cursorNdc = new THREE.Vector2();

const beatDetect = {
  lowAvg: 0,
  lastBeatAt: 0,
  spinVel: 0,
  dropActivity: 0,
  dropCooldown: 0,
  zoomVel: 0,
  glowFlash: 0,
  zoomToggle: false,
  zoomTargetRadius: 15,
};

const choreoState = {
  type: Math.random() < 0.5 ? "spinLeft" : "spinRight",
  endsAt: 1.5 + Math.random() * 3.5,
};
let userInteracting = false;
let cameraLoopEnabled = true;

function setCRigsVisible(v) {
  m2Rig.visible = v;
  soldierRig.visible = v;
  jeromeRig.visible = v;
  titanRig.visible = v;
  hyperRig.visible = v;
}
let autoCFlickerRan = false;
function runAutoCFlicker() {
  if (autoCFlickerRan) return;
  autoCFlickerRan = true;
  const totalToggles = 32;
  const intervalMs = 70;
  let count = 0;
  const t = setInterval(() => {
    count += 1;
    setCRigsVisible(count % 2 === 1);
    if (count >= totalToggles) {
      clearInterval(t);
      setCRigsVisible(true);
    }
  }, intervalMs);
}
setTimeout(runAutoCFlicker, 120000);
controls.addEventListener("start", () => { userInteracting = true; });
controls.addEventListener("end",   () => { userInteracting = false; });
camera.position.set(0, 0, 41);
controls.target.set(0, 0, 0);
controls.update();
const _beatOffset = new THREE.Vector3();
const _beatSph = new THREE.Spherical();
const CAMERA_SHIFT_AMP_X = 3.0;
const CAMERA_SHIFT_AMP_Y = 2.0;
const RING_SPIN_SPEED = 0.12;
window.addEventListener("pointermove", (event) => {
  const nx = (event.clientX / window.innerWidth) * 2 - 1;
  const ny = -(event.clientY / window.innerHeight) * 2 + 1;
  cursorNdc.set(nx, ny);
  cameraShiftTarget.set(nx * CAMERA_SHIFT_AMP_X, ny * CAMERA_SHIFT_AMP_Y, 0);
});
const dragState = {
  active: false,
  moved: false,
  target: null,
  lastX: 0,
  lastY: 0,
};

function resolveDragTarget(hitObject) {
  if (!hitObject) return null;
  let node = hitObject;
  while (node) {
    if (node === orb) return orb;
    if (node === lowerRig || node === lowerOrb) return lowerRig;
    if (node === dragonRig || miniDragonRigs.includes(node)) return node;
    if (node === modelRig || node.parent === modelRig) return modelRig;
    node = node.parent;
  }
  return null;
}

canvas.addEventListener("pointerdown", (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

canvas.addEventListener("pointermove", (event) => {
  event.preventDefault();
  const nextX = (event.clientX / window.innerWidth) * 2 - 1;
  const nextY = -(event.clientY / window.innerHeight) * 2 + 1;
  const ndcMove = Math.hypot(nextX - pointer.x, nextY - pointer.y);
  pointer.set(nextX, nextY);
  backgroundCursorTarget.copy(pointer);
  backgroundCursorKick = Math.min(1.4, backgroundCursorKick + ndcMove * 2.8);

  if (!dragState.active || !dragState.target) return;
  const dx = event.clientX - dragState.lastX;
  const dy = event.clientY - dragState.lastY;
  dragState.lastX = event.clientX;
  dragState.lastY = event.clientY;
  if (Math.abs(dx) + Math.abs(dy) > 1) dragState.moved = true;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const up = camera.up.clone().normalize();
  const dragScale = 0.012;

  dragState.target.userData.dragOffset
    .addScaledVector(right, dx * dragScale)
    .addScaledVector(up, -dy * dragScale);

  clickImpulse = Math.min(1.5, clickImpulse + (Math.abs(dx) + Math.abs(dy)) * 0.002);
});

function endDrag() {
  dragState.active = false;
  dragState.target = null;
  dragState.moved = false;
  controls.enabled = true;
}

canvas.addEventListener("pointerup", (event) => {
  if (canvas.releasePointerCapture && canvas.hasPointerCapture?.(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  endDrag();
});
canvas.addEventListener("pointercancel", (event) => {
  if (canvas.releasePointerCapture && canvas.hasPointerCapture?.(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  endDrag();
});
canvas.addEventListener("pointerleave", endDrag);

canvas.addEventListener("dblclick", (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hitTargets = SETTINGS.blackHoleOnly
    ? [dragonRig, modelRig, orb, ...sideDragonOrbs, ...sideDragonStaticOrbs, dragonMouthOrb, ...miniDragonRigs, ...miniOrbs, lowerRig, lowerOrb, ...lowerMiniOrbs, ...cardinalOrbs]
    : [orb, ...sideDragonOrbs, ...sideDragonStaticOrbs, core, ...bigOrbs, dragonRig, dragonMouthOrb, ...miniDragonRigs, ...miniOrbs, lowerRig, lowerOrb, ...lowerMiniOrbs, ...cardinalOrbs];
  const hit = raycaster.intersectObjects(hitTargets, true);
  if (hit.length === 0) return;
  navigateToPoint(hit[0].point);
});

const clock = new THREE.Clock();
const getEnergy = () => {
  if (!analyser || !frequencyData) return { low: 0, mid: 0, high: 0, overall: 0 };
  analyser.getByteFrequencyData(frequencyData);
  const third = Math.floor(frequencyData.length / 3);
  let low = 0, mid = 0, high = 0;
  for (let i = 0; i < third; i += 1) low += frequencyData[i];
  for (let i = third; i < third * 2; i += 1) mid += frequencyData[i];
  for (let i = third * 2; i < frequencyData.length; i += 1) high += frequencyData[i];
  low = low / third / 255; mid = mid / third / 255; high = high / (frequencyData.length - third * 2) / 255;
  return { low, mid, high, overall: (low + mid + high) / 3 };
};

const animate = () => {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  const delta = clock.getDelta();
  const e = getEnergy();
  const audioBoost = Math.pow(Math.max(e.overall, 0), 0.55);

  scene.position.set(0, 0, 0);
  scene.rotation.set(0, 0, 0);
  spaceBackgroundTexture.offset.x = elapsed * 0.0035 + Math.sin(elapsed * 0.12) * 0.004;
  spaceBackgroundTexture.offset.y = Math.sin(elapsed * 0.07) * 0.0025;
  spaceBackgroundTexture.needsUpdate = false;
  const prevShiftX = cameraShiftCurrent.x;
  const prevShiftY = cameraShiftCurrent.y;
  const prevShiftZ = cameraShiftCurrent.z;
  cameraShiftCurrent.lerp(cameraShiftTarget, 0.08);
  const shiftDX = cameraShiftCurrent.x - prevShiftX;
  const shiftDY = cameraShiftCurrent.y - prevShiftY;
  const shiftDZ = cameraShiftCurrent.z - prevShiftZ;
  camera.position.x += shiftDX;
  camera.position.y += shiftDY;
  camera.position.z += shiftDZ;
  controls.target.x += shiftDX;
  controls.target.y += shiftDY;
  controls.target.z += shiftDZ;

  beatDetect.lowAvg = beatDetect.lowAvg * 0.94 + e.low * 0.06;
  const beatThreshold = beatDetect.lowAvg * 1.28 + 0.06;
  if (e.low > beatThreshold && (elapsed - beatDetect.lastBeatAt) > 0.16) {
    beatDetect.lastBeatAt = elapsed;
    beatDetect.spinVel = -0.18;
    beatDetect.glowFlash = 1.0;
  }
  const camSequence = [
    { type: "spinAndLetGo",      duration: 5.0 },
    { type: "zoomOut",           duration: 2.5 },
    { type: "gradualGrab",       duration: 3.0 },
    { type: "spinOpposite",      duration: 3.5 },
    { type: "zoomOut",           duration: 3.0 },
    { type: "spinOverhead",      duration: 3.0 },
    { type: "spinAngled",        duration: 3.0 },
    { type: "spinDiagonal",      duration: 3.0 },
    { type: "zoomOut",           duration: 2.5 },
    { type: "spinElevated",      duration: 3.5 },
    { type: "returnToNormal",    duration: 4.0 },
  ];
  let _seqTotal = 0;
  for (const s of camSequence) _seqTotal += s.duration;
  const _seqPhase = elapsed % _seqTotal;
  let _seqAcc = 0;
  let currentSeq = camSequence[0];
  let seqT = 0;
  for (const s of camSequence) {
    if (_seqPhase < _seqAcc + s.duration) {
      currentSeq = s;
      seqT = (_seqPhase - _seqAcc) / s.duration;
      break;
    }
    _seqAcc += s.duration;
  }
  let choreoSpin = 0;
  let choreoPhiTarget = null;
  switch (currentSeq.type) {
    case "spinAndLetGo":
      choreoSpin = 0.16 * Math.pow(0.04, seqT);
      break;
    case "gradualGrab":
      choreoSpin = -0.10 * seqT;
      break;
    case "spinOpposite":
      choreoSpin = -0.10;
      break;
    case "spinOverhead":
      choreoPhiTarget = 0.35;
      choreoSpin = -0.05;
      break;
    case "spinAngled":
      choreoPhiTarget = 0.85;
      choreoSpin = 0.04;
      break;
    case "spinDiagonal":
      choreoPhiTarget = 0.55;
      choreoSpin = -0.06;
      break;
    case "spinElevated":
      choreoPhiTarget = 1.15;
      choreoSpin = 0.08;
      break;
    case "zoomOut":
      choreoPhiTarget = 0.75;
      choreoSpin = 0.015;
      break;
    case "returnToNormal":
      choreoPhiTarget = 0.7;
      choreoSpin = 0.02 * (1 - seqT);
      break;
  }
  if (userInteracting) {
    choreoSpin = 0;
    choreoPhiTarget = null;
  }
  beatDetect.dropActivity = beatDetect.dropActivity * 0.92 + (e.high + e.overall) * 0.045;
  beatDetect.dropCooldown = Math.max(0, beatDetect.dropCooldown - 0.016);
  if (beatDetect.dropActivity > 0.7 && beatDetect.dropCooldown <= 0) {
    beatDetect.zoomVel = -0.55;
    beatDetect.dropCooldown = 1.5;
  }
  if (!userInteracting && cameraLoopEnabled) {
    const songSpin = -(e.overall * 0.07 + e.mid * 0.04 + e.high * 0.02);
    _beatOffset.subVectors(camera.position, controls.target);
    _beatSph.setFromVector3(_beatOffset);
    _beatSph.theta += beatDetect.spinVel + songSpin + choreoSpin;
    if (choreoPhiTarget !== null) {
      _beatSph.phi = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(_beatSph.phi, choreoPhiTarget, 0.05),
        0.18,
        Math.PI - 0.18
      );
    }
    _beatOffset.setFromSpherical(_beatSph);
    camera.position.copy(controls.target).add(_beatOffset);
  }
  beatDetect.spinVel *= 0.94;
  beatDetect.zoomVel *= 0.90;
  beatDetect.glowFlash *= 0.86;

  uniforms.u_time.value = elapsed;
  uniforms.u_energy.value = e.overall;
  uniforms.u_low.value = e.low;
  uniforms.u_mid.value = e.mid;
  uniforms.u_high.value = e.high;
  clickImpulse *= 0.93;
  uniforms.u_click.value = clickImpulse;

  const bloomWave = 0.5 + 0.5 * Math.sin(elapsed * (1.25 + e.mid * 3.2));
  bloomPass.strength = activeView === "model" ? SETTINGS.bloomStrength * 0.55 : SETTINGS.bloomStrength;
  bloomPass.threshold = activeView === "model" ? 0.2 : SETTINGS.bloomThreshold;
  bloomPass.radius = SETTINGS.bloomRadiusMin + (SETTINGS.bloomRadiusMax - SETTINGS.bloomRadiusMin) * (0.58 * bloomWave + 0.42 * e.overall);

  const palettePhase = elapsed * 1.4;
  const paletteIndex = Math.floor(palettePhase) % PARTICLE_PALETTE.length;
  const paletteNextIndex = (paletteIndex + 1) % PARTICLE_PALETTE.length;
  const paletteBlend = palettePhase - Math.floor(palettePhase);
  const targetColor = PARTICLE_PALETTE[paletteIndex].clone().lerp(PARTICLE_PALETTE[paletteNextIndex], paletteBlend);
  particleMat.color.lerp(targetColor, 0.22);

  const spawnCount = activeView === "dragon"
    ? Math.min(14, Math.floor(3 + (e.high * 18 + e.mid * 8) * SETTINGS.rippleIntensity))
    : 0;
  if (spawnCount > 0) {
    for (let i = 0; i < spawnCount; i += 1) spawnParticle(e.mid + e.low, e.high);
    updateParticles(delta);
  }

  let anchorX = 0;
  let anchorY = 0;
  let anchorZ = 0;
  if (dragonModel) {
    anchorX = dragonRig.position.x;
    anchorY = dragonRig.position.y;
    anchorZ = dragonRig.position.z;
  }

  if (!SETTINGS.blackHoleOnly) {
    orb.position.set(anchorX, anchorY + 2.7, anchorZ);
    orb.position.add(orb.userData.dragOffset);
    orb.rotation.y += 0.002 + e.mid * 0.02;
    orb.rotation.x += 0.001 + e.high * 0.013;
    orb.rotation.z += 0.0008 + e.low * 0.009;
    for (const sideOrb of sideDragonOrbs) sideOrb.visible = false;
    for (const sideOrb of sideDragonStaticOrbs) sideOrb.visible = false;
  } else if (dragonModel) {
    const clearGap = 3.4;
    const topOrbDistance = dragonTopOffset + clearGap + 3.2;
    const sideDistance = topOrbDistance * 2.25;
    orb.position.set(
      dragonRig.position.x,
      dragonRig.position.y + topOrbDistance,
      dragonRig.position.z + 0.3
    );
    orb.position.add(orb.userData.dragOffset);
    orb.scale.setScalar(0.42 + e.overall * 0.14 + Math.sin(elapsed * 2.4) * 0.03);
    orb.rotation.y += 0.0018 + e.mid * 0.017;
    orb.rotation.x += 0.001 + e.high * 0.011;
    orb.rotation.z += 0.0006 + e.low * 0.008;

    for (const sideOrb of sideDragonOrbs) {
      const { dir, phase, flySpeed, ySpeed, zSpeed, orbitRadius, yAmp, zAmp, hueBase } = sideOrb.userData;
      sideOrb.visible = true;
      const orbitSpeed = flySpeed * 2.0;
      const theta = elapsed * orbitSpeed + phase + (dir < 0 ? 0 : Math.PI);
      const wideRadius = sideDistance + orbitRadius * 2.4 + e.overall * 4.8;
      const xOffset = Math.cos(theta) * wideRadius;
      const zOffset = Math.sin(theta) * (wideRadius * 0.95);
      const yOffset =
        Math.sin(elapsed * ySpeed + phase) * (yAmp + e.high * 3.2) +
        Math.cos(elapsed * zSpeed + phase * 1.5) * (zAmp + e.mid * 1.8);
      sideOrb.position.set(
        dragonRig.position.x + xOffset,
        dragonRig.position.y + yOffset,
        dragonRig.position.z + zOffset
      );
      const sidePulse = 1 + e.overall * 0.8 + e.high * 0.5 + Math.sin(elapsed * 4.1 + phase) * 0.25;
      sideOrb.scale.setScalar(sidePulse);
      sideOrb.material.uniforms.u_alpha.value =
        0.5 + e.high * 0.35 + Math.abs(Math.sin(elapsed * 3.2 + phase)) * 0.1;
      sideOrb.material.uniforms.u_intensity.value =
        0.84 + e.overall * 0.7 + e.high * 0.32;
      sideOrb.material.uniforms.u_color.value.setHSL(
        hueBase + Math.sin(elapsed * 1.4 + phase) * 0.09 + e.high * 0.03,
        0.5 + e.mid * 0.36,
        0.62 + e.high * 0.22 + e.overall * 0.1
      );
      sideOrb.rotation.y += 0.01 + e.mid * 0.05;
      sideOrb.rotation.x += 0.008 + e.high * 0.04;
      sideOrb.rotation.z += 0.006 + e.low * 0.03;
    }

    for (const sideOrb of sideDragonStaticOrbs) {
      const { dir, phase, hueBase } = sideOrb.userData;
      sideOrb.visible = true;
      sideOrb.position.set(
        dragonRig.position.x + dir * sideDistance,
        dragonRig.position.y + Math.sin(elapsed * 1.25 + phase) * 0.35,
        dragonRig.position.z + 0.3
      );
      const sidePulse = 0.95 + e.overall * 0.55 + Math.sin(elapsed * 3.1 + phase) * 0.13;
      sideOrb.scale.setScalar(sidePulse);
      sideOrb.material.uniforms.u_alpha.value =
        0.5 + e.high * 0.28 + Math.abs(Math.sin(elapsed * 2.4 + phase)) * 0.08;
      sideOrb.material.uniforms.u_intensity.value =
        0.86 + e.overall * 0.58 + e.high * 0.2;
      sideOrb.material.uniforms.u_color.value.setHSL(
        hueBase + Math.sin(elapsed * 1.1 + phase) * 0.045,
        0.48 + e.mid * 0.3,
        0.62 + e.overall * 0.15
      );
      sideOrb.rotation.y += 0.004 + e.mid * 0.03;
      sideOrb.rotation.x += 0.003 + e.high * 0.02;
    }
  } else {
    for (const sideOrb of sideDragonOrbs) sideOrb.visible = false;
    for (const sideOrb of sideDragonStaticOrbs) sideOrb.visible = false;
  }

  if (noxOverlay) {
    const textGlow = 0.9 + e.overall * 0.55 + Math.sin(elapsed * 2.6) * 0.14;
    noxOverlay.style.opacity = `${0.72 + e.high * 0.25}`;
    noxOverlay.style.transform = `translateX(-50%) translateY(${Math.sin(elapsed * 1.4) * -4}px) scale(${0.98 + e.overall * 0.08})`;
    for (const letter of noxOverlay.querySelectorAll(".nox-letter")) {
      letter.style.textShadow = `0 0 14px rgba(189,224,255,0.95), 0 0 ${36 + e.high * 40}px rgba(146,206,255,0.72), 0 0 ${92 + textGlow * 56}px rgba(112,186,255,0.5), 0 0 ${150 + textGlow * 70}px rgba(94,170,255,0.34)`;
    }
  }

  starfield.rotation.y += 0.00008 + e.low * 0.00025;
  starfield.rotation.x = Math.sin(elapsed * 0.05) * 0.015;
  starfield.material.uniforms.u_time.value = elapsed;
  starfield.material.uniforms.u_energy.value = e.overall;
  starfield.material.uniforms.u_high.value = e.high;

  if (!SETTINGS.blackHoleOnly) {
    for (const bigOrb of bigOrbs) {
      const { radius, speed, phase, yAmp } = bigOrb.userData;
      const theta = elapsed * speed + phase;
      const audioBreath = 1 + e.overall * 0.55 + Math.sin(elapsed * 1.4 + phase) * 0.08;
      bigOrb.position.x = anchorX + Math.cos(theta) * radius;
      bigOrb.position.z = anchorZ + Math.sin(theta) * radius;
      bigOrb.position.y = anchorY + Math.sin(elapsed * (0.65 + Math.abs(speed)) + phase) * yAmp;
      bigOrb.scale.setScalar(audioBreath);
      bigOrb.rotation.x += 0.0013 + e.high * 0.008;
      bigOrb.rotation.y += 0.0017 + e.mid * 0.01;
      bigOrb.rotation.z += 0.0009 + e.low * 0.007;
    }
  }

  if (!SETTINGS.blackHoleOnly) {
    const coreScale = 1 + 0.05 * Math.sin(elapsed * 3.5) + e.overall * 0.45;
    core.position.set(anchorX, anchorY, anchorZ);
    core.scale.setScalar(coreScale);
    core.rotation.y -= 0.006 + e.high * 0.03;
    core.rotation.x += 0.003 + e.mid * 0.012;

    belowOrb.position.set(anchorX, anchorY - 5.4, anchorZ);
    belowOrb.scale.setScalar(1 + e.low * 0.4);
    belowOrb.rotation.y -= 0.0018 + e.low * 0.008;
  }

  if (dragonModel && activeView === "dragon") {
    dragonRig.position.x = Math.sin(elapsed * 0.22) * 0.35;
    dragonRig.position.z = Math.cos(elapsed * 0.18) * 0.28;
    dragonRig.position.y = Math.sin(elapsed * 0.43) * 0.45;
    dragonRig.position.add(dragonRig.userData.dragOffset);
    dragonRig.rotation.y += 0.0015 + e.mid * 0.008;
    dragonRig.rotation.x = Math.sin(elapsed * 0.37) * 0.08;
    const blackHolePulse = 1 + e.overall * 0.18;
    dragonRig.scale.setScalar(blackHolePulse);

    dragonModel.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      if (obj.material.emissiveIntensity !== undefined) {
        obj.material.emissiveIntensity = 0.55 + e.overall * 0.65 + Math.sin(elapsed * 2.2) * 0.08;
      }
      if (obj.material.opacity !== undefined && obj.material.transparent) {
        obj.material.opacity = 0.72 + e.high * 0.24;
      }
    });

    const bands = [e.low, e.mid, e.high];
    for (let r = 0; r < ringMeshes.length; r += 1) {
      const ring = ringMeshes[r];
      const { baseScale, basePosition, baseRotation, phase, spinRate, band } = ring.userData;
      const energy = bands[band] ?? e.overall;
      const target = energy * 1.35 + e.overall * 0.45;
      ring.userData.peak = Math.max(target, ring.userData.peak * 0.90);
      const peak = ring.userData.peak;
      const w1 = Math.sin(elapsed * 1.73 + phase);
      const w2 = Math.sin(elapsed * 2.41 + phase * 1.7) * 0.6;
      const w3 = Math.sin(elapsed * 0.91 + phase * 2.3) * 0.4;
      const organic = (w1 + w2 + w3) * 0.08;
      const radialPulse = 1 + organic + peak * 1.15;
      const verticalPulse = 1 + organic * 0.5 + peak * 0.45;
      ring.scale.set(
        baseScale.x * radialPulse,
        baseScale.y * verticalPulse,
        baseScale.z * radialPulse
      );
      const tiltAmp = 0.08 + e.high * 0.18;
      ring.rotation.x = baseRotation.x + Math.sin(elapsed * 0.83 + phase) * tiltAmp + Math.sin(elapsed * 1.9 + phase * 2.1) * 0.03;
      ring.rotation.z = baseRotation.z + Math.cos(elapsed * 0.71 + phase * 1.3) * tiltAmp * 0.85;
      ring.rotation.y = baseRotation.y + elapsed * (spinRate + peak * 0.6) + Math.sin(elapsed * 0.5 + phase) * 0.12;
      ring.position.y = basePosition.y + Math.sin(elapsed * 1.15 + phase) * (0.10 + peak * 0.5);
      ring.position.x = basePosition.x + Math.sin(elapsed * 0.67 + phase * 1.8) * (0.05 + peak * 0.25);
      if (ring.material && ring.material.emissiveIntensity !== undefined) {
        ring.material.emissiveIntensity =
          0.55 + Math.sin(elapsed * 3.1 + phase) * 0.18 + peak * 2.2 + e.overall * 0.4;
      }
    }

    for (const miniOrb of miniOrbs) {
      const { radius, speed, phase, yAmp, pulseOffset } = miniOrb.userData;
      const theta = elapsed * speed + phase;
      miniOrb.position.x = dragonRig.position.x + Math.cos(theta) * radius;
      miniOrb.position.z = dragonRig.position.z + Math.sin(theta) * radius;
      miniOrb.position.y =
        dragonRig.position.y + Math.sin(elapsed * (0.9 + Math.abs(speed)) + phase) * yAmp;
      const pulse = 0.75 + Math.sin(elapsed * 4.0 + pulseOffset) * 0.22 + e.overall * 0.5;
      miniOrb.scale.setScalar(pulse);
      miniOrb.material.opacity = 0.55 + e.high * 0.4 + Math.sin(elapsed * 2.2 + pulseOffset) * 0.06;
      miniOrb.material.color.setHSL(
        0.56 + Math.sin(elapsed * 0.6 + pulseOffset) * 0.04,
        0.5 + e.mid * 0.35,
        0.65 + e.overall * 0.2
      );
    }

    for (const orbBall of cardinalOrbs) {
      const { dir, baseRadius, pulseOffset, spin, yBase } = orbBall.userData;
      const radius = baseRadius + Math.sin(elapsed * 1.4 + pulseOffset) * 0.7 + e.low * 1.3;
      const rotatingDir = dir
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), elapsed * spin)
        .normalize();
      orbBall.position.x = dragonRig.position.x + rotatingDir.x * radius;
      orbBall.position.z = dragonRig.position.z + rotatingDir.z * radius;
      orbBall.position.y = dragonRig.position.y + yBase + Math.sin(elapsed * 1.1 + pulseOffset) * (0.35 + e.mid * 0.6);
      const p = 0.85 + Math.sin(elapsed * 4.2 + pulseOffset) * 0.2 + e.overall * 0.42;
      orbBall.scale.setScalar(p);
      orbBall.material.opacity = 0.55 + e.high * 0.3;
      orbBall.material.color.setHSL(
        0.57 + Math.sin(elapsed * 0.7 + pulseOffset) * 0.025,
        0.38 + e.mid * 0.28,
        0.7 + e.high * 0.14
      );
    }

    for (const miniRig of miniDragonRigs) {
      const { laneOffset, depthOffset, yOffset, phase, baseScale } = miniRig.userData;
      miniRig.position.x = dragonRig.position.x + laneOffset;
      miniRig.position.z = dragonRig.position.z + depthOffset;
      miniRig.position.y = dragonRig.position.y + yOffset + Math.sin(elapsed * 0.9 + phase) * 0.55;
      miniRig.rotation.y = dragonRig.rotation.y + Math.sin(elapsed * 0.8 + phase) * 0.35;
      miniRig.rotation.x = Math.sin(elapsed * 0.65 + phase) * 0.12;
      miniRig.scale.setScalar(baseScale * (1.0 + e.overall * 0.3));

      miniRig.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        obj.material.color.setHSL(
          0.56 + Math.sin(elapsed * 0.55 + phase) * 0.04,
          0.46 + e.mid * 0.35,
          0.42 + e.overall * 0.25
        );
      });
    }
  }

  if (modelScene && activeView === "model") {
    modelRig.position.copy(viewTargets.model).add(modelRig.userData.dragOffset);
    modelScene.rotation.y += 0.0025 + e.mid * 0.01;
    modelScene.rotation.x = Math.sin(elapsed * 0.31) * 0.06;
    const modelPulse = 1 + e.overall * 0.06;
    modelScene.scale.setScalar(modelScene.userData.displayScale * modelPulse);
  }

  if (prophetModel) {
    prophetRig.rotation.y += 0.0035 + e.mid * 0.012;
    prophetRig.position.y = -2 + Math.sin(elapsed * 0.8) * 0.18 + e.low * 0.45;
    const prophetPulse = 1 + e.overall * 0.12 + e.low * 0.18;
    prophetModel.scale.setScalar(prophetBaseScale * prophetPulse);
    prophetModel.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      if (obj.material.emissiveIntensity !== undefined) {
        obj.material.emissiveIntensity = 0.15 + e.high * 0.9 + Math.sin(elapsed * 2.4) * 0.05;
      }
    });
    for (const gm of prophetGlowMats) {
      gm.uniforms.u_time.value = elapsed;
      gm.uniforms.u_peak.value = gm.uniforms.u_peak.value * 0.88 + (e.high * 0.9 + e.overall * 0.4) * 0.12;
      gm.uniforms.u_intensity.value = 0.85 + Math.sin(elapsed * 2.1) * 0.08 + e.mid * 0.4;
    }
  }

  if (achatesModel) {
    achatesRig.rotation.y += 0.004 + e.mid * 0.006;
    achatesRig.position.y = -12 + Math.sin(elapsed * 0.6) * 0.2 + e.low * 0.25;
    const pulse = 1 + e.overall * 0.06 + Math.sin(elapsed * 1.6) * 0.02;
    achatesModel.scale.setScalar(achatesBaseScale * pulse);
    for (const gm of achatesGlowMats) {
      gm.uniforms.u_time.value = elapsed;
      gm.uniforms.u_peak.value =
        gm.uniforms.u_peak.value * 0.86 + (e.high * 0.8 + e.overall * 0.4) * 0.12;
      gm.uniforms.u_intensity.value = 0.15 + e.overall * 0.18 + Math.sin(elapsed * 2.0) * 0.02;
    }
  }

  if (phoenixModel) {
    phoenixRig.rotation.y += 0.015 + e.mid * 0.02;
    phoenixRig.position.y = 45 + Math.sin(elapsed * 1.6) * 0.8 + e.low * 0.8;
    const pulse = 1 + e.overall * 0.12 + Math.sin(elapsed * 2.8) * 0.04;
    phoenixModel.scale.setScalar(phoenixBaseScale * pulse);
    if (phoenixMixer) {
      const flapRate = 1.0 + e.mid * 1.5 + e.overall * 0.8;
      phoenixMixer.update(delta * flapRate);
    } else if (phoenixWingMeshes.length > 0) {
      const flap = Math.sin(elapsed * (5.5 + e.mid * 4)) * (0.5 + e.low * 0.5);
      for (const w of phoenixWingMeshes) {
        w.obj.rotation.z = w.baseRotZ + flap * w.side;
        w.obj.rotation.x = w.baseRotX + Math.sin(elapsed * 4.0) * 0.08;
      }
    }
  }

  if (m2Model) {
    m2Rig.rotation.y += 0.18 + e.mid * 0.12;
    const pulse = 1 + e.overall * 0.08 + Math.sin(elapsed * 1.4) * 0.025;
    m2Model.scale.setScalar(m2BaseScale * pulse);
  }

  if (jeromeModel) {
    jeromeRig.rotation.y += 0.18 + e.mid * 0.12;
    const pulse = 1 + e.overall * 0.08 + Math.sin(elapsed * 1.4 + 3.1) * 0.025;
    jeromeModel.scale.setScalar(jeromeBaseScale * pulse);
  }

  if (titanModel) {
    titanRig.rotation.y += 0.18 + e.mid * 0.12;
    const pulse = 1 + e.overall * 0.08 + Math.sin(elapsed * 1.4 + 5.0) * 0.025;
    titanModel.scale.setScalar(titanBaseScale * pulse);
  }

  if (hyperModel) {
    hyperRig.rotation.y += 0.18 + e.mid * 0.12;
    const pulse = 1 + e.overall * 0.08 + Math.sin(elapsed * 1.4 + 0.8) * 0.025;
    hyperModel.scale.setScalar(hyperBaseScale * pulse);
  }

  if (soldierModel) {
    soldierRig.rotation.y += 0.18 + e.mid * 0.12;
    const pulse = 1 + e.overall * 0.08 + Math.sin(elapsed * 1.4 + 1.7) * 0.025;
    soldierModel.scale.setScalar(soldierBaseScale * pulse);
  }

  if (angelModel) {
    angelRig.rotation.y += 0.12 + e.mid * 0.08;
    for (const gm of angelGlowMats) {
      gm.uniforms.u_time.value = elapsed;
      gm.uniforms.u_peak.value =
        gm.uniforms.u_peak.value * 0.82 +
        beatDetect.glowFlash * 0.55 +
        e.overall * 0.04;
      gm.uniforms.u_intensity.value =
        0.12 + beatDetect.glowFlash * 0.8 + e.overall * 0.15 +
        Math.sin(elapsed * 2.1) * 0.03;
    }
  }

  const bandsForRings = [e.low, e.mid, e.high];
  perlinRingGroup.position.copy(dragonRig.position);
  perlinRingGroup.rotation.x = -Math.PI / 2 + 0.45 + Math.sin(elapsed * 0.21) * 0.05;
  perlinRingGroup.rotation.z = Math.cos(elapsed * 0.17) * 0.04;
  for (const ring of audioRings) {
    const ud = ring.userData;
    const bandEnergy = bandsForRings[ud.band] ?? e.overall;
    const target = bandEnergy * 1.3 + e.overall * 0.4;
    ud.peak = Math.max(target, ud.peak * 0.90);
    const peak = ud.peak;
    const reactiveSpin = 1 + peak * 5.0;
    ring.rotation.x += ud.spinX * 0.13 * reactiveSpin;
    ring.rotation.y += ud.spinY * 0.13 * reactiveSpin;
    ring.rotation.z += ud.spinZ * 0.13 * reactiveSpin + cursorNdc.x * RING_SPIN_SPEED;
    const s = ud.baseScale * (1 + peak * ud.scaleAmp + e.overall * 0.12);
    ring.scale.setScalar(s);

    if (ud.type === "perlin") {
      const u = ring.material.uniforms;
      u.u_time.value = elapsed;
      u.u_peak.value = peak;
      u.u_intensity.value = 1.4 + e.overall * 0.7;
    } else if (ud.type === "torus" || ud.type === "knot") {
      const flash = 1 + peak * 1.6 + Math.sin(elapsed * 2.0) * 0.08;
      ring.material.color.copy(ud.baseColor).multiplyScalar(flash);
      ring.material.opacity = 0.75 + peak * 0.25;
    } else if (ud.type === "beads") {
      const flash = 1 + peak * 2.2;
      for (let i = 0; i < ud.beads.length; i += 1) {
        const b = ud.beads[i];
        const beadPulse = 1 + peak * 1.4 + Math.sin(elapsed * 4.0 + b.userData.phase) * 0.18;
        b.scale.setScalar(beadPulse);
        b.material.color.copy(ud.baseColor).multiplyScalar(flash);
        b.material.opacity = 0.7 + peak * 0.3;
      }
    }
  }

  if (activeView === "dragon") {
  const flyAnchorX = dragonModel ? dragonRig.position.x : 0;
  const flyAnchorY = dragonModel ? dragonRig.position.y : 0;
  const flyAnchorZ = dragonModel ? dragonRig.position.z : 0;
  for (const ball of flyingBalls) {
    const { radius, speed, phase, verticalDrift, bandOffset, tilt, pulseOffset } = ball.userData;
    const theta = elapsed * speed + phase;
    const wave = Math.sin(elapsed * 0.9 + pulseOffset);
    const radial = radius + wave * (0.7 + e.low * 1.2);
    ball.position.x = flyAnchorX + Math.cos(theta) * radial;
    ball.position.z = flyAnchorZ + Math.sin(theta + tilt) * radial * 0.9;
    ball.position.y =
      flyAnchorY +
      bandOffset +
      Math.sin(elapsed * (0.7 + Math.abs(speed)) + phase) * verticalDrift +
      Math.cos(elapsed * 0.55 + pulseOffset) * (0.6 + e.mid * 1.1);
    const pulse = 0.66 + wave * 0.22 + e.overall * 0.55;
    ball.scale.setScalar(pulse);
    ball.material.opacity = 0.34 + e.high * 0.38 + Math.abs(wave) * 0.16;
    ball.material.color.setHSL(
      0.57 + Math.sin(elapsed * 0.42 + pulseOffset) * 0.06,
      0.48 + e.mid * 0.3,
      0.66 + e.overall * 0.2
    );
  }
  for (const chromaOrb of chromaOrbs) {
    const { radius, speed, verticalSpeed, phase, yBand, pulseOffset, hueOffset } = chromaOrb.userData;
    const theta = elapsed * speed + phase;
    const audioRadius = radius + e.overall * 4.2 + Math.sin(elapsed * 0.9 + pulseOffset) * 1.8;
    chromaOrb.position.x = flyAnchorX + Math.cos(theta) * audioRadius;
    chromaOrb.position.z = flyAnchorZ + Math.sin(theta * 1.15 + phase * 0.4) * audioRadius * 0.9;
    chromaOrb.position.y =
      flyAnchorY +
      yBand +
      Math.sin(elapsed * verticalSpeed + phase) * (1.4 + e.mid * 3.2) +
      Math.cos(elapsed * (verticalSpeed * 0.7) + phase) * (0.8 + e.high * 2.4);
    const chromaPulse = 0.7 + e.overall * 0.95 + Math.sin(elapsed * 4.8 + pulseOffset) * 0.26;
    chromaOrb.scale.setScalar(chromaPulse);
    chromaOrb.material.opacity = 0.4 + e.high * 0.44 + Math.abs(Math.sin(elapsed * 3.2 + pulseOffset)) * 0.14;
    chromaOrb.material.color.setHSL(
      (elapsed * 0.19 + hueOffset + e.high * 0.08) % 1,
      0.56 + e.mid * 0.3,
      0.62 + e.overall * 0.18
    );
  }

  backgroundMesh.rotation.y += 0.001 + e.low * 0.004 + audioBoost * 0.006;
  backgroundMesh.rotation.x += 0.0007 + e.mid * 0.003 + audioBoost * 0.004;
  backgroundMesh.rotation.z = Math.sin(elapsed * (0.2 + audioBoost * 0.25)) * (0.25 + audioBoost * 0.25);
  backgroundCursorKick *= 0.92;
  backgroundCursorCurrent.lerp(backgroundCursorTarget, 0.12);
  backgroundMesh.material.uniforms.u_cursor.value.copy(backgroundCursorCurrent);
  backgroundMesh.material.uniforms.u_cursor_strength.value =
    0.25 + backgroundCursorKick * 0.9 + e.high * 0.4 + audioBoost * 0.7;
  backgroundMesh.position.x = (dragonModel ? dragonRig.position.x : 0) - 1.4 + Math.sin(elapsed * 0.12) * 1.4;
  backgroundMesh.position.y = (dragonModel ? dragonRig.position.y : 0) + 4.2 + Math.cos(elapsed * 0.16) * 1.2;
  backgroundMesh.position.z = (dragonModel ? dragonRig.position.z : 0) - 44;
  backgroundMesh.scale.setScalar(1 + Math.sin(elapsed * 0.42) * 0.06 + audioBoost * 0.32);
  backgroundMesh.material.uniforms.u_color.value.setHSL(
    0.56 + Math.sin(elapsed * 0.34) * 0.12 + e.high * 0.06,
    0.42 + e.mid * 0.33 + audioBoost * 0.16,
    0.44 + e.overall * 0.24 + audioBoost * 0.12
  );
  backgroundMesh.material.uniforms.u_alpha.value =
    0.11 + audioBoost * 0.17 + Math.sin(elapsed * 0.8) * 0.02;

  giantBackgroundOrb.position.x = (dragonModel ? dragonRig.position.x : 0) + 1.8 + Math.sin(elapsed * 0.09) * 2.8;
  giantBackgroundOrb.position.y = (dragonModel ? dragonRig.position.y : 0) - 2.6 + Math.cos(elapsed * 0.13) * 2.1;
  giantBackgroundOrb.position.z = (dragonModel ? dragonRig.position.z : 0) - 92;
  giantBackgroundOrb.rotation.y += 0.00045 + e.low * 0.002;
  giantBackgroundOrb.rotation.x -= 0.0003 + e.mid * 0.0014;
  const giantPulse = 1 + Math.sin(elapsed * 0.52) * 0.12 + audioBoost * 0.24;
  giantBackgroundOrb.scale.setScalar(giantPulse);
  const altMix = 0.5 + 0.5 * Math.sin(elapsed * 1.15 + e.high * 5.0);
  const altHue = 0.58 + (altMix - 0.5) * 0.36;
  giantBackgroundOrb.material.uniforms.u_color.value.setHSL(
    altHue,
    0.5 + e.mid * 0.34,
    0.48 + e.overall * 0.24
  );
  giantBackgroundOrb.material.uniforms.u_intensity.value =
    0.9 + altMix * 1.35 + e.high * 0.65;
  giantBackgroundOrb.material.uniforms.u_alpha.value =
    0.16 + altMix * 0.22 + e.overall * 0.12;
  }

  if (activeView === "lower") {
  const lowerLocalX = lowerOrbBaseOffset.x + Math.sin(elapsed * 0.31) * 1.1;
  const lowerLocalY = lowerOrbBaseOffset.y + Math.sin(elapsed * 0.57) * 0.55;
  const lowerLocalZ = lowerOrbBaseOffset.z + Math.cos(elapsed * 0.26) * 0.9;
  lowerRig.position.set(0, -36, 0).add(lowerRig.userData.dragOffset);
  lowerOrb.position.set(lowerLocalX, lowerLocalY, lowerLocalZ);
  lowerOrb.rotation.y -= 0.003 + e.mid * 0.012;
  lowerOrb.rotation.x += 0.0015 + e.high * 0.009;
  const lowerPulse = 0.9 + e.overall * 0.45 + Math.sin(elapsed * 2.2) * 0.08;
  lowerOrb.scale.setScalar(lowerPulse);
  lowerUniforms.u_color.value.setHSL(
    0.59 + Math.sin(elapsed * 0.55) * 0.025,
    0.42 + e.mid * 0.28,
    0.62 + e.overall * 0.16
  );

  for (const miniOrb of lowerMiniOrbs) {
    const { radius, speed, phase, yAmp, pulseOffset } = miniOrb.userData;
    const theta = elapsed * speed + phase;
    const lowerWorldX = lowerRig.position.x + lowerLocalX;
    const lowerWorldY = lowerRig.position.y + lowerLocalY;
    const lowerWorldZ = lowerRig.position.z + lowerLocalZ;
    miniOrb.position.x = lowerWorldX + Math.cos(theta) * radius;
    miniOrb.position.z = lowerWorldZ + Math.sin(theta) * radius;
    miniOrb.position.y =
      lowerWorldY + Math.sin(elapsed * (0.82 + Math.abs(speed)) + phase) * yAmp;
    const pulse = 0.65 + Math.sin(elapsed * 3.4 + pulseOffset) * 0.2 + e.overall * 0.35;
    miniOrb.scale.setScalar(pulse);
    miniOrb.material.opacity = 0.42 + e.high * 0.24 + Math.sin(elapsed * 1.7 + pulseOffset) * 0.05;
  }
  }

  if (!SETTINGS.blackHoleOnly) {
    for (const { pivot, sat } of satellites) {
      pivot.position.set(anchorX, anchorY, anchorZ);
      pivot.rotation.y += pivot.userData.speed + e.low * 0.005;
      pivot.rotation.x += e.mid * 0.0018;
      sat.rotation.x += sat.userData.spin + e.high * 0.011;
      sat.rotation.y += sat.userData.spin * 0.7 + e.low * 0.006;
    }
  }

  if (nav) {
    nav.t = Math.min(1, nav.t + delta * 1.1);
    const t = nav.t * nav.t * (3 - 2 * nav.t);
    controls.target.lerpVectors(nav.fromTarget, nav.toTarget, t);
    camera.position.lerpVectors(nav.fromCamera, nav.toCamera, t);
    if (nav.t >= 1) nav = null;
  }

  controls.update();
  composer.render();
};
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
