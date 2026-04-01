import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { resolveGithubActivity } from "./github-activity.js";

const params = new URLSearchParams(window.location.search);
const noRotate = params.has("noRotate");

/** コミット数から大地の半径（ログスケール） */
function groundRadiusFromCommits(commits) {
  const c = Math.max(0, commits);
  const Rmin = 4.2;
  const Rmax = 17.5;
  const ref = 85000;
  const t = Math.log1p(c) / Math.log1p(ref);
  return Rmin + (Rmax - Rmin) * Math.min(1, Math.max(0, t));
}

/** 面積とコミット数から草の本数 */
function bladeCountFromCommits(commits, radius) {
  const area = Math.PI * radius * radius;
  const base = Math.round(22 * area + commits * 0.1);
  return Math.min(9000, Math.max(480, base));
}

const rng = (s) => {
  const x = Math.sin(s * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

function buildGrassInstancedMesh(bladeCount, spreadRadius) {
  const baseGeom = new THREE.PlaneGeometry(0.042, 0.52, 1, 4);
  baseGeom.translate(0, 0.26, 0);
  const inner = 0.25;
  const outer = Math.max(inner + 0.2, spreadRadius * 0.94);

  const inst = new THREE.InstancedMesh(
    baseGeom,
    new THREE.MeshStandardMaterial({
      color: 0x4ec96f,
      side: THREE.DoubleSide,
      roughness: 0.55,
      metalness: 0.02,
    }),
    bladeCount
  );

  const dummy = new THREE.Object3D();

  for (let i = 0; i < bladeCount; i++) {
    const a = rng(i) * Math.PI * 2;
    const t = rng(i + 0.1);
    const r = inner + Math.sqrt(t) * (outer - inner);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = 0.7 + rng(i + 0.2) * 0.85;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(
      (rng(i + 0.3) - 0.5) * 0.4,
      rng(i + 0.4) * Math.PI * 2,
      (rng(i + 0.5) - 0.5) * 0.25
    );
    dummy.scale.set(s, s * (0.92 + rng(i + 0.6) * 0.35), s);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    const g = 0.78 + rng(i + 0.7) * 0.22;
    const c = new THREE.Color(0x3ecf62).multiplyScalar(g);
    c.lerp(new THREE.Color(0xb8f070), 0.12 + rng(i + 0.8) * 0.15);
    inst.setColorAt(i, c);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  return inst;
}

async function main() {
  const statusEl = document.getElementById("activity-status");
  const hasQuery =
    params.has("user") ||
    params.has("u") ||
    params.has("repo") ||
    params.has("r");

  let activity = {
    commitCount: 320,
    label: "デモ",
    source: "demo",
  };
  let loadError = null;

  if (hasQuery) {
    if (statusEl) statusEl.textContent = "GitHub の公開データを読み込み中…";
    try {
      activity = await resolveGithubActivity(params);
    } catch (err) {
      console.warn(err);
      loadError = err instanceof Error ? err : new Error(String(err));
      activity = {
        commitCount: 320,
        label: "フォールバック",
        source: "demo",
      };
    }
  }

  const groundRadius = groundRadiusFromCommits(activity.commitCount);
  const bladeCount = bladeCountFromCommits(activity.commitCount, groundRadius);

  if (statusEl) {
    const stats = `草 ${bladeCount.toLocaleString()} 本 · 大地の半径 ${groundRadius.toFixed(1)}`;
    if (loadError) {
      statusEl.textContent = `${loadError.message} · デモ表示（${stats}）`;
    } else if (!hasQuery) {
      statusEl.textContent = `${activity.label} · ${stats}。?repo=owner/name で実データ。`;
    } else {
      statusEl.textContent = `${activity.label} · ${stats}`;
    }
  }

  const container = document.getElementById("canvas-wrap");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const sky = 0x7ec8ff;
  renderer.setClearColor(sky, 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd4ff);
  scene.fog = new THREE.Fog(0xc8e8f8, 28, 95);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    120
  );
  const camDist = 3.2 + groundRadius * 0.22;
  camera.position.set(camDist * 0.65, 1.45 + groundRadius * 0.04, camDist * 0.75);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
  controls.minDistance = 2;
  controls.maxDistance = 18 + groundRadius * 0.85;
  controls.target.set(0, 0.15, 0);
  controls.autoRotate = !noRotate;
  controls.autoRotateSpeed = 0.28;

  const hemi = new THREE.HemisphereLight(0xa8dcff, 0x6a9a3a, 0.88);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff8e6, 1.42);
  sun.position.set(-8, 18, 10);
  scene.add(sun);
  const bounce = new THREE.DirectionalLight(0xe8f8ff, 0.38);
  bounce.position.set(10, 6, -8);
  scene.add(bounce);
  const warm = new THREE.DirectionalLight(0xffeeaa, 0.22);
  warm.position.set(6, 3, 12);
  scene.add(warm);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(groundRadius, 56),
    new THREE.MeshStandardMaterial({
      color: 0x62a848,
      roughness: 0.88,
      metalness: 0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const inst = buildGrassInstancedMesh(bladeCount, groundRadius);
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
    inst.rotation.y = Math.sin(t * 0.1) * 0.028;
    const wind =
      Math.sin(t * 0.9) * 0.02 + Math.sin(t * 0.33) * 0.016;
    inst.rotation.z = wind;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  tick();
}

main();
