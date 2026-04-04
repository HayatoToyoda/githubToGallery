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

/** ワールド座標系での球の半径（曲率の見え方） */
const SPHERE_RADIUS = 8;

/**
 * 活動量から北極（+Y）からの球冠の半角 α（0〜π）。
 * π で球体全体が緑。
 */
function growthAngleFromActivity(commits) {
  const c = Math.max(0, commits);
  const ref = 85000;
  const t = Math.log1p(c) / Math.log1p(ref);
  return Math.min(1, Math.max(0, t)) * Math.PI;
}

/** 球冠の表面積 2πR²(1-cos α) に基づく草の本数 */
function bladeCountFromCommits(commits, R) {
  const alpha = growthAngleFromActivity(commits);
  const capArea = 2 * Math.PI * R * R * (1 - Math.cos(Math.min(alpha, Math.PI)));
  const base = Math.round(18 * capArea + commits * 0.008);
  return Math.min(9000, Math.max(24, base));
}

const rng = (s) => {
  const x = Math.sin(s * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/** GitHub プロフィールの Contribution 草に近い緑の段階（概算） */
const GH_GRASS_STOPS = [0x9be9a8, 0x40c463, 0x30a14e, 0x216e39];

/**
 * 強度 t（0〜1）から草の色と高さ係数。Contribution の濃い日ほど高く濃い緑。
 * @param {number} t
 * @returns {{ color: THREE.Color, heightScale: number }}
 */
function grassStyleFromIntensity(t) {
  const u = Math.max(0, Math.min(1, t));
  const heightScale = 0.38 + 0.62 * u;
  const span = GH_GRASS_STOPS.length - 1;
  const x = u * span;
  const i = Math.min(span - 1, Math.floor(x));
  const f = x - i;
  const color = new THREE.Color(GH_GRASS_STOPS[i]).lerp(
    new THREE.Color(GH_GRASS_STOPS[i + 1]),
    f
  );
  return { color, heightScale };
}

/**
 * @param {{ commitCount: number, contributionDays?: number[], maxDayContributions?: number }} activity
 * @param {number} bladeIndex
 */
function grassStyleForBlade(activity, bladeIndex) {
  const days = activity.contributionDays;
  const maxDay = activity.maxDayContributions;

  if (days?.length && typeof maxDay === "number" && maxDay > 0) {
    const di = Math.floor(rng(bladeIndex + 42) * days.length);
    const c = days[di] ?? 0;
    const t = Math.min(1, c / maxDay);
    return grassStyleFromIntensity(t);
  }

  const ref = 85000;
  const base = Math.log1p(Math.max(0, activity.commitCount)) / Math.log1p(ref);
  const jitter = 0.28 * (rng(bladeIndex + 1.17) - 0.5);
  const t = Math.max(0, Math.min(1, base + jitter));
  return grassStyleFromIntensity(t);
}

/**
 * 球面上に一様分布した草。極からの角 θ でソートし、inst.count で成長を表現。
 * OAuth 時は日別 contribution に応じて色・高さを変える。
 */
function buildGrassSphereInstancedMesh(bladeCount, R, activity) {
  const baseGeom = new THREE.PlaneGeometry(0.042, 0.52, 1, 4);
  baseGeom.translate(0, 0.26, 0);

  const inst = new THREE.InstancedMesh(
    baseGeom,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      roughness: 0.55,
      metalness: 0.02,
    }),
    bladeCount
  );

  const samples = [];
  for (let i = 0; i < bladeCount; i++) {
    const u = rng(i);
    const v = rng(i + 0.1);
    const theta = Math.acos(2 * u - 1);
    const phi = 2 * Math.PI * v;
    const sinT = Math.sin(theta);
    const dir = new THREE.Vector3(
      sinT * Math.cos(phi),
      Math.cos(theta),
      sinT * Math.sin(phi)
    );
    samples.push({ dir, theta });
  }
  samples.sort((a, b) => a.theta - b.theta);

  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const qBase = new THREE.Quaternion();
  const qRand = new THREE.Quaternion();

  for (let i = 0; i < bladeCount; i++) {
    const { dir } = samples[i];
    dummy.position.copy(dir).multiplyScalar(R);
    qBase.setFromUnitVectors(up, dir);
    qRand.setFromEuler(
      new THREE.Euler(
        (rng(i + 0.3) - 0.5) * 0.35,
        rng(i + 0.4) * Math.PI * 2,
        (rng(i + 0.5) - 0.5) * 0.22
      )
    );
    dummy.quaternion.copy(qBase).multiply(qRand);
    const s = 0.7 + rng(i + 0.2) * 0.85;
    const { color, heightScale } = grassStyleForBlade(activity, i);
    const yVar = 0.88 + rng(i + 0.6) * 0.24;
    dummy.scale.set(s, s * yVar * heightScale, s);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    inst.setColorAt(i, color);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.count = 0;
  return inst;
}

function createSphereGroundMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uAlpha = { value: 0 };
    shader.uniforms.uGrassColor = { value: new THREE.Color(0x62a848) };
    shader.uniforms.uSoilColor = { value: new THREE.Color(0x7a5230) };
    mat.userData.shaderUniforms = shader.uniforms;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vWorldPosition;\n"
    );
    // worldpos_vertex は USE_SHADOWMAP 等が無いと空になり worldPosition が未定義になるため、
    // 常にローカル座標から世界座標を計算する（Three.js r160+）
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n"
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vWorldPosition;\nuniform float uAlpha;\nuniform vec3 uGrassColor;\nuniform vec3 uSoilColor;\n"
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec3 n = normalize(vWorldPosition);
      float angleFromNorth = acos(clamp(n.y, -1.0, 1.0));
      float edge = smoothstep(uAlpha - 0.12, uAlpha + 0.12, angleFromNorth);
      diffuseColor.rgb = mix(uGrassColor, uSoilColor, edge);
      `
    );
  };
  return mat;
}

async function main() {
  const statusEl = document.getElementById("activity-status");
  const hasQuery =
    params.has("user") ||
    params.has("u") ||
    params.has("repo") ||
    params.has("r");

  const apiBase = getMeadowApiBase();

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

  const targetAlpha = growthAngleFromActivity(activity.commitCount);
  const bladeCount = bladeCountFromCommits(activity.commitCount, SPHERE_RADIUS);
  const alphaDeg = ((targetAlpha / Math.PI) * 180).toFixed(0);

  if (statusEl) {
    const stats = `草 ${bladeCount.toLocaleString()} 本 · 緑の球冠 ~${alphaDeg}°（北極から）`;
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
  scene.fog = new THREE.Fog(0xc8e8f8, 18, 85);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  const camDist = SPHERE_RADIUS * 2.35;
  camera.position.set(camDist * 0.55, SPHERE_RADIUS * 0.45, camDist * 0.65);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI;
  controls.minDistance = SPHERE_RADIUS * 1.15;
  controls.maxDistance = SPHERE_RADIUS * 9;
  controls.target.set(0, 0, 0);
  controls.autoRotate = !noRotate;
  controls.autoRotateSpeed = 0.28;

  const hemi = new THREE.HemisphereLight(0xa8dcff, 0x5a5a48, 0.88);
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

  const groundMat = createSphereGroundMaterial();
  const sphereMesh = new THREE.Mesh(
    new THREE.SphereGeometry(SPHERE_RADIUS, 96, 96),
    groundMat
  );
  sphereMesh.receiveShadow = true;
  scene.add(sphereMesh);

  const grassGroup = new THREE.Group();
  const inst = buildGrassSphereInstancedMesh(bladeCount, SPHERE_RADIUS, activity);
  grassGroup.add(inst);
  scene.add(grassGroup);

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  const clock = new THREE.Clock();
  let introElapsed = 0;
  const INTRO_DURATION = 2.85;

  function tick() {
    const dt = clock.getDelta();
    introElapsed += dt;
    const progress = Math.min(1, introElapsed / INTRO_DURATION);
    const eased = easeOutCubic(progress);
    const currentAlpha = targetAlpha * eased;

    const su = groundMat.userData.shaderUniforms;
    if (su && su.uAlpha) {
      su.uAlpha.value = currentAlpha;
    }

    const frac = (1 - Math.cos(currentAlpha)) / 2;
    inst.count = Math.max(0, Math.floor(bladeCount * frac));

    const t = clock.getElapsedTime();
    grassGroup.rotation.y = Math.sin(t * 0.1) * 0.028;
    grassGroup.rotation.x =
      Math.sin(t * 0.9) * 0.018 + Math.sin(t * 0.33) * 0.014;

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  tick();
}

main();
