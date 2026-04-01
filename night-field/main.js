import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const params = new URLSearchParams(window.location.search);
const noRotate = params.has("noRotate");

const container = document.getElementById("canvas-wrap");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const nightSky = 0x050a12;
renderer.setClearColor(nightSky, 1);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const fogColor = 0x0a1522;
scene.fog = new THREE.Fog(fogColor, 7, 34);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(2.2, 1.35, 3.15);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2 - 0.08;
controls.minDistance = 1.5;
controls.maxDistance = 12;
controls.target.set(0, 0.2, 0);
controls.autoRotate = !noRotate;
controls.autoRotateSpeed = 0.32;

const hemi = new THREE.HemisphereLight(0x3a5070, 0x0c140c, 0.42);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xb8d4ff, 0.62);
moon.position.set(-5.5, 11, 4.5);
scene.add(moon);
const rim = new THREE.DirectionalLight(0x4a6a9a, 0.18);
rim.position.set(8, 4, -6);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(14, 48),
  new THREE.MeshStandardMaterial({
    color: 0x060a09,
    roughness: 0.97,
    metalness: 0,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const bladeCount = 4200;
const baseGeom = new THREE.PlaneGeometry(0.04, 0.55, 1, 4);
baseGeom.translate(0, 0.275, 0);

const inst = new THREE.InstancedMesh(
  baseGeom,
  new THREE.MeshStandardMaterial({
    color: 0x2d6b45,
    side: THREE.DoubleSide,
    roughness: 0.72,
    metalness: 0.04,
  }),
  bladeCount
);

const dummy = new THREE.Object3D();
const rng = (s) => {
  const x = Math.sin(s * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

for (let i = 0; i < bladeCount; i++) {
  const a = rng(i) * Math.PI * 2;
  const r = 0.4 + Math.sqrt(rng(i + 0.1)) * 9.5;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = 0.65 + rng(i + 0.2) * 0.9;
  dummy.position.set(x, 0, z);
  dummy.rotation.set(
    (rng(i + 0.3) - 0.5) * 0.35,
    rng(i + 0.4) * Math.PI * 2,
    (rng(i + 0.5) - 0.5) * 0.2
  );
  dummy.scale.set(s, s * (0.9 + rng(i + 0.6) * 0.4), s);
  dummy.updateMatrix();
  inst.setMatrixAt(i, dummy.matrix);
  const g = 0.65 + rng(i + 0.7) * 0.28;
  const c = new THREE.Color(0x1a5a38).multiplyScalar(g);
  c.lerp(new THREE.Color(0x1e4a58), 0.12 + rng(i + 0.8) * 0.1);
  inst.setColorAt(i, c);
}
inst.instanceMatrix.needsUpdate = true;
if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
scene.add(inst);

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener("resize", onResize);

const clock = new THREE.Clock();

function tick() {
  const t = clock.getElapsedTime();
  inst.rotation.y = Math.sin(t * 0.12) * 0.035;
  const wind =
    Math.sin(t * 0.95) * 0.022 + Math.sin(t * 0.35) * 0.018;
  inst.rotation.z = wind;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();
