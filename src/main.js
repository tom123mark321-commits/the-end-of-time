import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#universe');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = {
  time: 0, speed: 1, paused: false, collected: new Set(), hovered: null,
  rebirth: -100, cycles: 0, quality: 0, frames: 0, fps: 60, ready: false,
};
const clock = new THREE.Clock();
const pointer = new THREE.Vector2(4, 4);
const raycaster = new THREE.Raycaster();
let down = null;
let captionTimer;
let audio;
let renderer;
let scene;
let camera;
let controls;
let composer;
let bloom;
let lensPass;
let background;
let dust;
let disk;
let pulseMesh;
let core;
let orbitSystem;
let debris;
let sparks;
const rings = [];
const memories = [];
const memoryHitTargets = [];
const origin = new THREE.Vector3(1.6, 0.2, 0);
const initialPosition = new THREE.Vector3(0.1, 3.5, 14.4);
const initialTarget = new THREE.Vector3(0.1, 0.1, 0);
const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const debrisData = [];
const memoryTexts = [
  ['第一束光', '宇宙还很年轻。有人第一次抬起头，给黑暗取了一个名字。'],
  ['一次相遇', '两个短暂的生命，在无限的时间里，恰好经过彼此。'],
  ['未寄出的信', '有些话没有抵达。可它们仍在，以光的速度，穿越星际。'],
  ['海的声音', '在一颗早已消失的蓝色行星上，潮汐曾一遍遍说：回来。'],
  ['最后的温度', '当一切趋于寂静，你仍记得，被世界温柔以待的瞬间。'],
];

function random(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
const rand = random(883139);

const noiseGLSL = `
  float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(.1,.2,.3)); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 p) {
    vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float fbm(vec3 p) { float f=0.; f+=.5*noise(p); p=p*2.02+3.7; f+=.25*noise(p); p=p*2.03+7.1; f+=.125*noise(p); p=p*2.01; f+=.0625*noise(p); return f; }
`;

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x060911);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, 0.1, 180);
  camera.position.copy(initialPosition);
  controls = new OrbitControls(camera, canvas);
  controls.target.copy(initialTarget);
  controls.enableDamping = true;
  controls.dampingFactor = 0.045;
  controls.enablePan = false;
  controls.minDistance = 6.2;
  controls.maxDistance = 25;
  controls.rotateSpeed = 0.48;
  controls.zoomSpeed = 0.65;
  controls.maxPolarAngle = Math.PI * 0.87;
  controls.minPolarAngle = Math.PI * 0.12;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.12;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  scene.add(new THREE.AmbientLight(0x899aaf, 0.38));
  const key = new THREE.DirectionalLight(0xffd2a1, 4.5);
  key.position.set(-2, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x5b86bb, 3.2);
  fill.position.set(3, -2, -5);
  scene.add(fill);
  const inner = new THREE.PointLight(0xffae57, 34, 18, 2);
  inner.position.copy(origin).add(new THREE.Vector3(0, 1.4, 1.2));
  scene.add(inner);

  createBackground();
  createStars();
  createCore();
  createRings();
  createDebris();
  createDust();
  createMemories();
  createPulse();
  createPostprocessing();
  wireUI();
  resize();
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showError('图形上下文已丢失。请刷新页面，或关闭其他占用显卡的标签页。');
  });
  state.ready = true;
  renderer.setAnimationLoop(animate);
  $('#loading').classList.add('done');
  setTimeout(() => { $('#loading').hidden = true; }, 1100);
  Object.defineProperty(window, '__chronos', { get: () => ({
    ready: state.ready, time: state.time, speed: state.speed, paused: state.paused,
    collected: state.collected.size, cycles: state.cycles, frames: state.frames,
    fps: Math.round(state.fps), drawCalls: renderer.info.render.calls,
    canvas: { width: canvas.width, height: canvas.height },
    camera: camera.position.toArray(), quality: state.quality,
    memoryPositions: memories.map((memory) => {
      const point = memory.getWorldPosition(new THREE.Vector3()).project(camera);
      return { id: memory.userData.id, x: (point.x + 1) / 2 * innerWidth, y: (1 - point.y) / 2 * innerHeight, collected: state.collected.has(memory.userData.id) };
    }),
  }) });
}

function createBackground() {
  background = new THREE.Mesh(new THREE.SphereGeometry(85, 48, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `${noiseGLSL}
      varying vec3 vDirection; uniform float uTime;
      void main(){
        vec3 p=normalize(vDirection); vec3 q=p*3.4+vec3(0.,uTime*.001,0.);
        float n=fbm(q+fbm(q*1.8)*1.9);
        float ribbon=exp(-pow((p.y+.23*p.x+.13*sin(p.z*4.))*3.4,2.));
        float mist=pow(max(n-.24,0.),2.)*ribbon;
        vec3 col=vec3(.009,.016,.028)+vec3(.055,.105,.17)*mist*1.4;
        col+=vec3(.075,.052,.035)*pow(max(fbm(q*2.3+4.)-.35,0.),2.)*ribbon;
        gl_FragColor=vec4(col,1.);
      }`,
  }));
  scene.add(background);
}

function createStars() {
  const count = innerWidth < 650 ? 3700 : 6500;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const theta = rand() * Math.PI * 2;
    const z = rand() * 2 - 1;
    const r = 28 + rand() * 48;
    const s = Math.sqrt(1 - z * z);
    positions.set([r * s * Math.cos(theta), r * z, r * s * Math.sin(theta)], i * 3);
    sizes[i] = rand() < 0.035 ? 3.2 + rand() * 2 : 0.4 + rand() * 1.4;
    tint.setHSL(0.55 + rand() * 0.13, rand() * 0.25, 0.4 + rand() * 0.45);
    if (rand() < 0.13) tint.setRGB(0.95, 0.71, 0.43);
    colors.set(tint.toArray(), i * 3);
    phases[i] = rand() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const stars = new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true,
    uniforms: { uTime: { value: 0 }, uRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float aSize; attribute float aPhase; varying vec3 vColor; varying float vAlpha; uniform float uTime; uniform float uRatio; void main(){vColor=color; vAlpha=.55+.25*sin(uTime*.3+aPhase);vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uRatio;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vColor; varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);float a=exp(-d*d*18.);gl_FragColor=vec4(vColor*1.6,a*vAlpha);}`,
  }));
  stars.frustumCulled = false;
  scene.add(stars);
  scene.userData.stars = stars;
}

function createCore() {
  core = new THREE.Group();
  core.position.copy(origin);
  scene.add(core);
  const black = new THREE.Mesh(new THREE.SphereGeometry(1.22, 80, 64), new THREE.MeshBasicMaterial({ color: 0x010204 }));
  core.add(black);
  const corona = new THREE.Mesh(new THREE.SphereGeometry(1.26, 64, 48), new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uEnergy: { value: 1 } },
    vertexShader: `varying vec3 vNormal;varying vec3 vView;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec3 vNormal;varying vec3 vView;uniform float uEnergy;void main(){float rim=pow(1.-max(dot(vNormal,vView),0.),6.);vec3 c=mix(vec3(.8,.31,.08),vec3(1.,.85,.48),rim);gl_FragColor=vec4(c*rim*3.*uEnergy,rim*.7);}`,
  }));
  core.add(corona);
  core.userData.corona = corona;
  const photon = new THREE.Group();
  core.add(photon);
  [1.27, 1.31, 1.37].forEach((r, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, i === 0 ? .012 : .0035, 8, 220), new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffd3a0 : 0x996e42, transparent: true, opacity: 1 - i * .22 }));
    photon.add(ring);
  });
  core.userData.photon = photon;

  disk = new THREE.Mesh(new THREE.RingGeometry(1.3, 4.3, 256, 32), new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uEnergy: { value: 1 } },
    vertexShader: `varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `${noiseGLSL}
      varying vec3 vPos;uniform float uTime;uniform float uEnergy;
      void main(){float r=length(vPos.xy);float angle=atan(vPos.y,vPos.x);float t=uTime*.15;
        vec3 p=vec3(cos(angle+t/(r*.3))*r*2.,sin(angle+t/(r*.3))*r*2.,r*.6);
        float n=fbm(p*2.8);float bands=pow(.5+.5*sin(r*54.-n*9.-t*4.),6.);
        float spiral=pow(.5+.5*sin(angle*7.+r*17.-t*2.+n*4.),3.);
        float fade=smoothstep(4.3,2.,r)*smoothstep(1.3,1.5,r);
        float inner=exp(-(r-1.42)*2.2);float light=(bands*.26+spiral*.2+n*.18+inner*.8)*fade;
        vec3 gold=mix(vec3(.45,.17,.045),vec3(1.5,.88,.32),inner);
        gl_FragColor=vec4(gold*light*2.5*uEnergy,fade*.9);
      }`,
  }));
  disk.rotation.x = -Math.PI / 2 + 0.13;
  disk.rotation.y = 0.2;
  disk.rotation.z = -0.18;
  core.add(disk);

  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.6, 48, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vNormal;varying vec3 vView;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec3 vNormal;varying vec3 vView;void main(){float a=pow(max(0.,1.+dot(vNormal,vView)),4.);gl_FragColor=vec4(vec3(.55,.22,.05)*a,a*.23);}`,
  }));
  core.add(halo);
}

function createRings() {
  orbitSystem = new THREE.Group();
  orbitSystem.position.copy(origin);
  orbitSystem.rotation.set(0.28, 0.15, -0.38);
  scene.add(orbitSystem);
  const metal = new THREE.MeshStandardMaterial({ color: 0x685846, metalness: .85, roughness: .42 });
  const lightMetal = new THREE.MeshStandardMaterial({ color: 0xa49375, metalness: .82, roughness: .36 });
  const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0xb6a178, transparent: true, opacity: .55 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x2f3e4c, metalness: .77, roughness: .5 });
  const configs = [
    { r: 3.13, tilt: [0.83, 0.3, 0.15], speed: .035 },
    { r: 3.7, tilt: [-0.42, 0.48, -0.28], speed: -.025 },
    { r: 4.35, tilt: [1.28, -0.4, .1], speed: .018 },
  ];
  configs.forEach((cfg, index) => {
    const ring = new THREE.Group();
    ring.rotation.set(...cfg.tilt);
    ring.userData.speed = cfg.speed;
    ring.userData.base = new THREE.Euler(...cfg.tilt);
    for (let i = 0; i < 5; i++) {
      const length = .65 + rand() * .35;
      const arc = new THREE.Mesh(new THREE.TorusGeometry(cfg.r, .034 + index * .007, 8, 100, length), index === 1 ? darkMaterial : metal);
      arc.rotation.z = i * Math.PI * 2 / 5 + .1;
      ring.add(arc);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(cfg.r + .06, .0045, 4, 80, length * .92), edgeMaterial);
      edge.rotation.z = arc.rotation.z;
      ring.add(edge);
    }
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(.012, .07, .018), lightMetal, 120);
    for (let i = 0; i < 120; i++) {
      const a = i / 120 * Math.PI * 2;
      dummy.position.set(Math.cos(a) * cfg.r, Math.sin(a) * cfg.r, 0);
      dummy.rotation.set(0, 0, a - Math.PI / 2);
      dummy.scale.set(1, i % 10 === 0 ? 2.4 : 1, 1);
      dummy.updateMatrix();
      ticks.setMatrixAt(i, dummy.matrix);
    }
    ring.add(ticks);
    const orbitLine = new THREE.Mesh(new THREE.TorusGeometry(cfg.r + .23, .002, 3, 200), new THREE.MeshBasicMaterial({ color: 0x697989, transparent: true, opacity: .22 }));
    ring.add(orbitLine);
    orbitSystem.add(ring);
    rings.push(ring);
  });
  const needle = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.1, .018, .035), metal);
    arm.position.set(Math.cos(a) * 2.15, Math.sin(a) * 2.15, 0);
    arm.rotation.z = a;
    needle.add(arm);
  }
  needle.rotation.set(.6, .2, .3);
  orbitSystem.add(needle);
  orbitSystem.userData.needle = needle;
}

function createDebris() {
  const count = innerWidth < 650 ? 230 : 390;
  debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x766958, roughness: .55, metalness: .7 }), count);
  debris.position.copy(origin);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2.8 + Math.pow(rand(), .55) * 3.4;
    const y = (rand() - .5) * (rand() < .65 ? .65 : 2.8);
    const size = .025 + Math.pow(rand(), 3) * .19;
    debrisData.push({ a, r, y, size, rx: rand() * 6.28, ry: rand() * 6.28, speed: (.12 + rand() * .1) / r });
    tint.setHSL(.09 + rand() * .06, .12 + rand() * .2, .13 + rand() * .2);
    debris.setColorAt(i, tint);
  }
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debris.frustumCulled = false;
  scene.add(debris);
  updateDebris(0, 0);
}

function updateDebris(time, pulse) {
  debrisData.forEach((d, i) => {
    const a = d.a + time * d.speed;
    const r = d.r + pulse * (1 + d.size * 8);
    dummy.position.set(Math.cos(a) * r, d.y + Math.sin(a * 2 + d.rx) * .15, Math.sin(a) * r);
    dummy.rotation.set(d.rx + time * .02, d.ry + time * .03, a);
    dummy.scale.set(d.size * 1.7, d.size * .3, d.size);
    dummy.updateMatrix();
    debris.setMatrixAt(i, dummy.matrix);
  });
  debris.instanceMatrix.needsUpdate = true;
}

function createDust() {
  const count = innerWidth < 650 ? 7000 : 14000;
  const positions = new Float32Array(count * 3);
  const params = new Float32Array(count * 4);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 1.6 + Math.pow(rand(), .75) * 6.8;
    const a = rand() * Math.PI * 2;
    const height = (rand() - .5) * (.15 + Math.pow(r / 8, 3) * 1.5);
    positions.set([Math.cos(a) * r, height, Math.sin(a) * r], i * 3);
    params.set([r, a, height, rand()], i * 4);
    tint.setHSL(rand() < .7 ? .09 + rand() * .04 : .57 + rand() * .05, .3 + rand() * .35, .35 + rand() * .4);
    colors.set(tint.toArray(), i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aParams', new THREE.BufferAttribute(params, 4));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  dust = new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uRatio: { value: renderer.getPixelRatio() }, uPulse: { value: 0 } },
    vertexShader: `
      attribute vec4 aParams;uniform float uTime;uniform float uRatio;uniform float uPulse;varying vec3 vColor;varying float vAlpha;
      void main(){float r=aParams.x;float a=aParams.y+uTime*.23/pow(r,1.35);r+=uPulse*(1.+aParams.w*2.);
      vec3 p=vec3(cos(a)*r,aParams.z+sin(a*3.+uTime*.1)*.055,sin(a)*r);
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp((.8+aParams.w*1.6)*uRatio*7./-mv.z,.5,5.);
      vColor=color;vAlpha=(.22+aParams.w*.45)*(1.-smoothstep(6.,8.5,r));}`,
    fragmentShader: `varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(vColor*2.,exp(-d*d*17.)*vAlpha);}`,
  }));
  dust.position.copy(origin);
  dust.rotation.set(.04, .15, -.06);
  dust.frustumCulled = false;
  scene.add(dust);
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(400 * 3);
  for (let i = 0; i < 400; i++) sparkPos.set([(rand() - .5) * 28, (rand() - .5) * 18, 3 + rand() * 10], i * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xd9b17f, size: .013, transparent: true, opacity: .37, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(sparks);
}

function createMemories() {
  const positions = [[-1.8,1.75,1.35],[3.2,2.25,.6],[5.4,.4,2.2],[.2,-1.9,2.4],[3.3,-1.6,1.4]];
  positions.forEach((p, i) => {
    const group = new THREE.Group();
    group.position.set(...p);
    group.userData = { id: i, base: group.position.clone(), phase: i * 1.7 };
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.105, 0), new THREE.MeshStandardMaterial({ color: 0xffd6a2, emissive: 0xd59545, emissiveIntensity: 2.4, metalness: .4, roughness: .15 }));
    group.add(gem);
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(.21, .003, 4, 40), new THREE.MeshBasicMaterial({ color: 0xd8ae72, transparent: true, opacity: .65 }));
    orbit.rotation.x = .5;
    group.add(orbit);
    const target = new THREE.Mesh(new THREE.SphereGeometry(.27, 12, 10), new THREE.MeshBasicMaterial({ visible: false }));
    target.userData.id = i;
    group.add(target);
    memoryHitTargets.push(target);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow(), color: 0xe4b16e, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .6 }));
    glow.scale.set(.9, .9, 1);
    group.add(glow);
    scene.add(group);
    memories.push(group);
  });
}

function makeGlow() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff'); g.addColorStop(.12, '#ffe9bc'); g.addColorStop(.3, '#a1713844'); g.addColorStop(1, '#0000');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function createPulse() {
  pulseMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `varying vec3 vN;varying vec3 vV;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec3 vN;varying vec3 vV;uniform float uOpacity;void main(){float f=pow(1.-abs(dot(vN,vV)),4.);gl_FragColor=vec4(vec3(.9,.6,.25)*f*2.,f*uOpacity);}`,
  }));
  pulseMesh.position.copy(origin);
  scene.add(pulseMesh);
}

function createPostprocessing() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .65, .55, .75);
  composer.addPass(bloom);
  lensPass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uCenter: { value: new THREE.Vector2(.6, .5) }, uAspect: { value: innerWidth / innerHeight }, uPulse: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse;uniform vec2 uCenter;uniform float uAspect;uniform float uPulse;varying vec2 vUv;
      void main(){vec2 delta=vUv-uCenter;delta.x*=uAspect;float r=length(delta);
      float ripple=sin(r*45.-uPulse*12.)*uPulse*.004*exp(-r*2.);
      vec2 uv=vUv+normalize(delta+vec2(.0001))*(ripple+.0003/(r+.1));
      float shift=.00045+uPulse*.001;vec3 c;
      c.r=texture2D(tDiffuse,uv+vec2(shift,0.)).r;c.g=texture2D(tDiffuse,uv).g;c.b=texture2D(tDiffuse,uv-vec2(shift,0.)).b;
      float vignette=smoothstep(.92,.24,length((vUv-.5)*vec2(1.,.8)));c*=.6+.4*vignette;
      gl_FragColor=vec4(c,1.);}`,
  });
  composer.addPass(lensPass);
  composer.addPass(new OutputPass());
}

function showCaption(title, text, duration = 7000) {
  const caption = $('#memory-caption');
  clearTimeout(captionTimer);
  caption.querySelector('h2').textContent = title;
  caption.querySelector('p').textContent = text;
  caption.classList.add('show');
  captionTimer = setTimeout(() => caption.classList.remove('show'), duration);
}

function collect(id) {
  if (state.collected.has(id)) return;
  state.collected.add(id);
  $('#memory-count').textContent = String(state.collected.size).padStart(2, '0');
  memories[id].userData.collectTime = clock.elapsedTime;
  showCaption(...memoryTexts[id]);
  playChime(id);
  if (state.collected.size === 5) {
    showCaption('你，就是余下的光', '五枚记忆已归位。时间终有尽头，而记得，便是另一种永恒。', 14000);
    $('#rebirth').classList.add('complete');
  }
}

function triggerRebirth() {
  state.rebirth = clock.elapsedTime;
  state.cycles += 1;
  state.collected.clear();
  memories.forEach((m) => { m.visible = true; delete m.userData.collectTime; m.scale.setScalar(1); });
  $('#memory-count').textContent = '00';
  state.speed = 1; state.paused = false;
  $('#time-speed').value = '1';
  syncTimeUI();
  document.body.classList.add('rebirthing');
  $('#phase-name').textContent = '新生纪元';
  showCaption('并非终点', '每一次结束，都为另一个宇宙，留下一种可能。', 9000);
  setTimeout(() => document.body.classList.remove('rebirthing'), 3000);
  if (audio) {
    const now = audio.ctx.currentTime;
    audio.master.gain.cancelScheduledValues(now);
    audio.master.gain.setTargetAtTime(.075, now, .5);
    audio.master.gain.setTargetAtTime(.025, now + 2, 2);
  }
}

function syncTimeUI() {
  const speed = state.paused ? 0 : state.speed;
  $('#pause').textContent = state.paused ? '▶' : 'Ⅱ';
  $('#pause').setAttribute('aria-label', state.paused ? '继续时间' : '暂停时间');
  $('#speed-label').textContent = `${speed.toFixed(2)} ×`;
  $('#direction-label').textContent = speed < 0 ? 'REVERSE' : speed === 0 ? 'STILLNESS' : 'FORWARD';
  $('#phase-name').textContent = speed < 0 ? '回溯纪元' : speed === 0 ? '永恒一瞬' : state.cycles ? '新生纪元' : '余晖纪元';
}

function reset() {
  camera.position.copy(initialPosition);
  controls.target.copy(initialTarget);
  controls.autoRotate = !reducedMotion;
  state.speed = 1; state.paused = false;
  $('#time-speed').value = '1';
  syncTimeUI();
  controls.update();
}

function wireUI() {
  $('#pause').addEventListener('click', () => { state.paused = !state.paused; syncTimeUI(); });
  $('#time-speed').addEventListener('input', (event) => { state.speed = Number(event.target.value); state.paused = false; syncTimeUI(); });
  $('#reset').addEventListener('click', reset);
  $('#rebirth').addEventListener('click', triggerRebirth);
  $('#help').addEventListener('click', () => $('#help-dialog').showModal());
  $('#close-help').addEventListener('click', () => $('#help-dialog').close());
  $('#sound').addEventListener('click', toggleAudio);
  $('#journey').addEventListener('click', () => {
    camera.position.set(.6, 1.5, 9.2);
    controls.target.copy(origin);
    controls.autoRotate = false;
    showCaption('越过边界', '星尘仍在流动。请触碰那些没有熄灭的记忆。');
  });
  $('#fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { showCaption('保持此刻', '当前浏览器不支持全屏。你仍然可以探索完整宇宙。'); }
  });
  $('#quality').addEventListener('click', () => {
    state.quality = (state.quality + 1) % 3;
    $('#quality').textContent = ['画质 · 自动', '画质 · 高', '画质 · 流畅'][state.quality];
    renderer.setPixelRatio(state.quality === 2 ? 1 : state.quality === 1 ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1.7));
    bloom.enabled = state.quality !== 2;
    resize();
  });
  window.addEventListener('keydown', (event) => {
    if ($('#help-dialog').open || ['INPUT', 'BUTTON'].includes(document.activeElement?.tagName)) return;
    if (event.code === 'Space') { event.preventDefault(); state.paused = !state.paused; syncTimeUI(); }
    if (event.key.toLowerCase() === 'r') reset();
  });
  canvas.addEventListener('pointermove', (event) => {
    pointer.set(event.clientX / innerWidth * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
    const tip = $('#hover-tip');
    tip.style.left = `${Math.min(event.clientX + 18, innerWidth - 135)}px`;
    tip.style.top = `${event.clientY - 32}px`;
  });
  canvas.addEventListener('pointerleave', () => { pointer.set(4, 4); state.hovered = null; $('#hover-tip').style.opacity = '0'; });
  canvas.addEventListener('pointerdown', (event) => { down = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener('pointerup', (event) => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7) { down = null; return; }
    pointer.set(event.clientX / innerWidth * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(memoryHitTargets).find((h) => !state.collected.has(h.object.userData.id));
    if (hit) collect(hit.object.userData.id);
    down = null;
  });
  window.addEventListener('resize', resize);
}

async function toggleAudio() {
  try {
    if (!audio) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain(); master.gain.value = .025; master.connect(ctx.destination);
      const lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 320; lowpass.connect(master);
      [55, 82.41, 110.16].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.frequency.value = freq; osc.type = 'sine'; gain.gain.value = i === 0 ? .5 : .22;
        osc.connect(gain); gain.connect(lowpass); osc.start();
      });
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      const audioRand = random(9913);
      for (let i = 0; i < samples.length; i++) samples[i] = (audioRand() * 2 - 1) * .23;
      const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true; noise.connect(lowpass); noise.start();
      audio = { ctx, master };
    }
    if (audio.enabled) { await audio.ctx.suspend(); audio.enabled = false; }
    else { await audio.ctx.resume(); audio.enabled = true; }
    $('#sound-label').textContent = audio.enabled ? '声音 开' : '声音 关';
    $('#sound').setAttribute('aria-label', audio.enabled ? '关闭宇宙环境音' : '开启宇宙环境音');
  } catch { showCaption('静谧的宇宙', '音频无法启动。视觉体验不受影响。'); }
}

function playChime(id) {
  if (!audio?.enabled) return;
  const now = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator(); const gain = audio.ctx.createGain();
  osc.type = 'sine'; osc.frequency.value = [261.63, 329.63, 392, 523.25, 659.25][id];
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.7, now + .02); gain.gain.exponentialRampToValueAtTime(.001, now + 2.5);
  osc.connect(gain); gain.connect(audio.master); osc.start(now); osc.stop(now + 3);
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < 600 ? 68 : 43;
  controls.target.x = innerWidth < 600 ? origin.x : initialTarget.x;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
  lensPass.uniforms.uAspect.value = camera.aspect;
  dust.material.uniforms.uRatio.value = renderer.getPixelRatio();
  scene.userData.stars.material.uniforms.uRatio.value = renderer.getPixelRatio();
}

let previous = 0;
let performanceTime = 0;
let performanceFrames = 0;
function animate() {
  const elapsed = clock.getElapsedTime();
  const dt = Math.min(elapsed - previous, .05);
  previous = elapsed;
  state.frames += 1;
  const speed = state.paused ? 0 : state.speed;
  state.time += dt * speed * (reducedMotion ? .35 : 1);
  const t = state.time;
  const age = elapsed - state.rebirth;
  const pulse = age >= 0 && age < 6 ? Math.sin(Math.min(age / 6, 1) * Math.PI) : 0;
  if (age < 6) {
    pulseMesh.visible = true;
    pulseMesh.scale.setScalar(1.2 + age * 3.4);
    pulseMesh.material.uniforms.uOpacity.value = Math.max(0, 1 - age / 5) * .8;
  } else pulseMesh.visible = false;
  controls.update();
  background.material.uniforms.uTime.value = t;
  scene.userData.stars.material.uniforms.uTime.value = elapsed;
  disk.material.uniforms.uTime.value = t;
  disk.material.uniforms.uEnergy.value = 1 + pulse * 2;
  core.userData.corona.material.uniforms.uEnergy.value = 1 + pulse;
  core.userData.photon.quaternion.copy(camera.quaternion);
  rings.forEach((ring) => { ring.rotation.z = ring.userData.base.z + t * ring.userData.speed; ring.rotation.y = ring.userData.base.y + Math.sin(t * .025) * .07; });
  orbitSystem.userData.needle.rotation.z = t * .025;
  updateDebris(t, pulse * .6);
  dust.material.uniforms.uTime.value = t;
  dust.material.uniforms.uPulse.value = pulse * 1.6;
  sparks.rotation.y = t * .003;
  memories.forEach((m) => {
    m.position.y = m.userData.base.y + Math.sin(t * .7 + m.userData.phase) * .14;
    m.rotation.y = t * .4 + m.userData.phase;
    m.rotation.z = Math.sin(t * .25 + m.userData.phase) * .3;
    const collected = m.userData.collectTime;
    if (collected !== undefined) {
      const life = elapsed - collected;
      m.scale.setScalar(Math.max(0, 1 - life / .7));
      if (life > .7) m.visible = false;
    } else {
      m.scale.setScalar(state.hovered === m.userData.id ? 1.45 : 1);
    }
  });
  scene.updateMatrixWorld();
  if (state.frames % 3 === 0 && pointer.x !== 4) {
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(memoryHitTargets).find((h) => !state.collected.has(h.object.userData.id));
    state.hovered = hit ? hit.object.userData.id : null;
    canvas.style.cursor = hit ? 'pointer' : 'grab';
    $('#hover-tip').style.opacity = hit ? '1' : '0';
  }
  const projected = origin.clone().project(camera);
  lensPass.uniforms.uCenter.value.set((projected.x + 1) / 2, (projected.y + 1) / 2);
  lensPass.uniforms.uPulse.value = pulse;
  if (state.frames % 10 === 0) $('#epoch').textContent = (13.8 + t * .00003 + state.cycles * .001).toFixed(3);
  performanceTime += dt; performanceFrames += 1;
  if (performanceTime > 3) {
    state.fps = performanceFrames / performanceTime;
    if (state.quality === 0 && state.fps < 28 && renderer.getPixelRatio() > 1) {
      renderer.setPixelRatio(1); resize();
    }
    performanceTime = 0; performanceFrames = 0;
  }
  composer.render();
}

function showError(message) {
  $('#loading').hidden = true;
  $('#error').hidden = false;
  $('#error').textContent = message;
}
window.addEventListener('error', (event) => {
  if (!state.ready) showError(`宇宙尚未成功启动。\n${event.message}\n请使用支持 WebGL 2 的新版 Chrome / Edge，并开启硬件加速。`);
});
try { init(); } catch (error) {
  console.error(error);
  showError(`此浏览器暂时无法绘制宇宙。\n${error.message}\n请使用新版 Chrome / Edge，并开启硬件加速。`);
}
