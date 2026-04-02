import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { resolveGithubActivity } from "./github-activity.js";
import { fetchOAuthContributionActivity } from "./oauth-contributions.js";

const params = new URLSearchParams(window.location.search);
const noRotate = params.has("noRotate");

function getMeadowApiBase() {
  if (typeof globalThis !== "undefined" && globalThis.MEADOW_API_BASE) {
    return String(globalThis.MEADOW_API_BASE).replace(/\/$/, "");
  }
  return "";
}

/** 畑の外縁（土壌リングの外側・カメラ基準）。成長の上限。 */
const FIELD_RADIUS_MAX = 17.5;
/** 地平まで土を薄く延ばす倍率 */
const HORIZON_SOIL_FACTOR = 1.32;

/**
 * 活動量（OAuth なら totalContributions、それ以外はコミット相当）から
 * 「緑＋草が広がる半径」（ログスケール、中心から外へ成長）。
 */
function growthRadiusFromActivity(commits) {
  const c = Math.max(0, commits);
  const Rmin = 0.75;
  const Rmax = FIELD_RADIUS_MAX;
  const ref = 85000;
  const t = Math.log1p(c) / Math.log1p(ref);
  return Rmin + (Rmax - Rmin) * Math.min(1, Math.max(0, t));
}

/** 面積とコミット数から草の本数 */
function bladeCountFromCommits(commits, radius) {
  const area = Math.PI * radius * radius;
  const base = Math.round(22 * area + commits * 0.1);
  return Math.min(9000, Math.max(24, base));
}

const rng = (s) => {
  const x = Math.sin(s * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * 中心から円状に広がる草。半径 growthRadius 内に一様（面積）配置。
 */
function buildGrassInstancedMesh(bladeCount, growthRadius) {
  const baseGeom = new THREE.PlaneGeometry(0.042, 0.52, 1, 4);
  baseGeom.translate(0, 0.26, 0);
  const grassMaxR = Math.max(0.12, growthRadius * 0.94);

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
    const r = Math.sqrt(t) * grassMaxR;
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

  const apiBase = getMeadowApiBase();

  /** 未連携・クエリなしの「育った畑」デモ（ログ曲線がほぼ最大になる活動量） */
  const DEMO_LUSH_COMMITS = 85000;

  let activity = {
    commitCount: DEMO_LUSH_COMMITS,
    label: "デモ（育った畑）",
    source: "demo",
  };
  let loadError = null;
  let oauthUsed = false;

  if (apiBase) {
    if (statusEl) {
      statusEl.textContent = "Contribution Calendar（OAuth）を確認しています…";
    }
    try {
      const oa = await fetchOAuthContributionActivity(apiBase);
      if (oa) {
        activity = oa;
        oauthUsed = true;
      }
    } catch (e) {
      console.warn(e);
    }
  }

  if (!oauthUsed && hasQuery) {
    const userOnly =
      (params.has("user") || params.has("u")) &&
      !params.has("repo") &&
      !params.has("r");
    if (statusEl) {
      statusEl.textContent = userOnly
        ? "あなたの公開リポジトリを検索してコミット数を集計しています…"
        : "GitHub の公開データを読み込み中…";
    }
    try {
      activity = await resolveGithubActivity(params);
    } catch (err) {
      console.warn(err);
      loadError = err instanceof Error ? err : new Error(String(err));
      activity = {
        commitCount: DEMO_LUSH_COMMITS,
        label: "フォールバック",
        source: "demo",
      };
    }
  }

  const growthRadius = growthRadiusFromActivity(activity.commitCount);
  const bladeCount = bladeCountFromCommits(activity.commitCount, growthRadius);
  const horizonRadius = FIELD_RADIUS_MAX * HORIZON_SOIL_FACTOR;

  if (statusEl) {
    const stats = `草 ${bladeCount.toLocaleString()} 本 · 緑の半径 ${growthRadius.toFixed(1)}（畑の端 ${FIELD_RADIUS_MAX.toFixed(1)}）`;
    if (loadError) {
      statusEl.textContent = `${loadError.message} · デモ表示（${stats}）`;
    } else if (oauthUsed) {
      statusEl.textContent = `${activity.label} · ${stats}`;
    } else if (!hasQuery) {
      statusEl.textContent = `${activity.label} · ${stats}。フォームでユーザー名を入れるか、OAuth でログインしてください。`;
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
  const camDist = 3.2 + FIELD_RADIUS_MAX * 0.22;
  camera.position.set(camDist * 0.65, 1.45 + FIELD_RADIUS_MAX * 0.04, camDist * 0.75);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
  controls.minDistance = 2;
  controls.maxDistance = 18 + FIELD_RADIUS_MAX * 0.85;
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

  const soilMat = new THREE.MeshStandardMaterial({
    color: 0x7a5230,
    roughness: 0.92,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const meadowMat = new THREE.MeshStandardMaterial({
    color: 0x62a848,
    roughness: 0.88,
    metalness: 0,
  });

  const meadowGround = new THREE.Mesh(
    new THREE.CircleGeometry(growthRadius, 64),
    meadowMat
  );
  meadowGround.rotation.x = -Math.PI / 2;
  meadowGround.position.y = -0.0005;
  meadowGround.receiveShadow = true;
  scene.add(meadowGround);

  if (growthRadius < FIELD_RADIUS_MAX - 0.02) {
    const soilRing = new THREE.Mesh(
      new THREE.RingGeometry(growthRadius, FIELD_RADIUS_MAX, 64),
      soilMat
    );
    soilRing.rotation.x = -Math.PI / 2;
    soilRing.position.y = -0.0012;
    soilRing.receiveShadow = true;
    scene.add(soilRing);
  }

  const horizonRing = new THREE.Mesh(
    new THREE.RingGeometry(FIELD_RADIUS_MAX, horizonRadius, 48),
    soilMat
  );
  horizonRing.rotation.x = -Math.PI / 2;
  horizonRing.position.y = -0.0018;
  horizonRing.receiveShadow = true;
  scene.add(horizonRing);

  const inst = buildGrassInstancedMesh(bladeCount, growthRadius);
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
