import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { resolveGithubScore } from "./github-activity.js";

const params = new URLSearchParams(window.location.search);
const noRotate = params.has("noRotate");

/**
 * @param {{ score: number, source: string }} m
 */
function bladesFromMetrics(m) {
  if (m.source === "default") return 4200;
  if (m.source === "user_public") {
    return Math.min(8500, Math.max(900, Math.round(850 + m.score * 6)));
  }
  return Math.min(8500, Math.max(900, Math.round(750 + m.score * 0.32)));
}

const rng = (s) => {
  const x = Math.sin(s * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

function buildGrassInstancedMesh(bladeCount) {
  const baseGeom = new THREE.PlaneGeometry(0.04, 0.55, 1, 4);
  baseGeom.translate(0, 0.275, 0);

  const inst = new THREE.InstancedMesh(
    baseGeom,
    new THREE.MeshStandardMaterial({
      color: 0x3d8558,
      side: THREE.DoubleSide,
      roughness: 0.68,
      metalness: 0.04,
    }),
    bladeCount
  );

  const dummy = new THREE.Object3D();

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
    const g = 0.72 + rng(i + 0.7) * 0.26;
    const c = new THREE.Color(0x2a6b42).multiplyScalar(g);
    c.lerp(new THREE.Color(0x2a5568), 0.08 + rng(i + 0.8) * 0.08);
    inst.setColorAt(i, c);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  return inst;
}

async function main() {
  const statusEl = document.getElementById("activity-status");
  let metrics = {
    score: 4200,
    label: "デフォルト",
    source: "default",
  };

  if (statusEl) {
    const hasQuery =
      params.has("user") ||
      params.has("u") ||
      params.has("repo") ||
      params.has("r");
    if (hasQuery) {
      statusEl.textContent = "GitHub の公開データを読み込み中…";
      try {
        metrics = await resolveGithubScore(params);
      } catch (err) {
        console.warn(err);
        const msg = err instanceof Error ? err.message : "取得に失敗しました";
        metrics = { score: 4200, label: "フォールバック", source: "default" };
        statusEl.textContent = `${msg} · 草はデフォルト（${bladesFromMetrics(metrics).toLocaleString()} 本）`;
      }
    } else {
      statusEl.textContent =
        "?user=GitHubユーザー / ?repo=owner/name で草が増える（公開 API のみ）";
    }
  }

  const bladeCount = bladesFromMetrics(metrics);
  if (statusEl && metrics.source !== "default") {
    statusEl.textContent = `${metrics.label} · 草 ${bladeCount.toLocaleString()} 本`;
  }

  const container = document.getElementById("canvas-wrap");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  const nightSky = 0x0e1828;
  renderer.setClearColor(nightSky, 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const fogColor = 0x121e2e;
  scene.fog = new THREE.Fog(fogColor, 14, 52);

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

  const hemi = new THREE.HemisphereLight(0x6a8ab8, 0x1c3028, 0.62);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xd0e8ff, 1.05);
  moon.position.set(-5.5, 11, 4.5);
  scene.add(moon);
  const rim = new THREE.DirectionalLight(0x7a9ec8, 0.42);
  rim.position.set(8, 4, -6);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xa8c8e8, 0.22);
  fill.position.set(2, 6, 8);
  scene.add(fill);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(14, 48),
    new THREE.MeshStandardMaterial({
      color: 0x101c18,
      roughness: 0.94,
      metalness: 0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const inst = buildGrassInstancedMesh(bladeCount);
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
}

main();
