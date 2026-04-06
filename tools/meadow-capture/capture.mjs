/**
 * meadow をローカルで配信し、assets/hero.gif と assets/3d-showcase.png を生成する。
 * 使い方: cd tools/meadow-capture && npm install && npx playwright install chromium && npm run capture
 */
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { PNG } from "pngjs";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const MEADOW = path.join(REPO_ROOT, "meadow");
const ASSETS = path.join(REPO_ROOT, "assets");
/** README 静止画は CAPTURE.md 目安どおり幅 920px */
const VIEWPORT_PNG = { width: 920, height: 640 };
/** GIF はループ用にやや小さめ（ファイルサイズ・読み込み向け） */
const VIEWPORT_GIF = { width: 780, height: 542 };

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

/** meadow/ を静的配信（空きポート）。python http.server に依存しない。 */
function startMeadowStaticServer() {
  const root = path.resolve(MEADOW);
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const u = new URL(req.url || "/", "http://127.0.0.1");
        let rel = u.pathname.replace(/^\/+/, "");
        if (!rel) rel = "index.html";
        if (rel.includes("..")) {
          res.writeHead(403);
          res.end();
          return;
        }
        const abs = path.resolve(path.join(root, rel));
        if (!abs.startsWith(root) || !existsSync(abs) || !statSync(abs).isFile()) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const ext = path.extname(abs);
        const type = MIME[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": type });
        res.end(readFileSync(abs));
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
      }
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

function rgbaFromPngBuffer(buf) {
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: png.data };
}

async function captureShowcase(page, base) {
  await page.goto(`${base}/?noRotate=1`, { waitUntil: "networkidle", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3500));
  const buf = await page.screenshot({ type: "png", fullPage: false });
  await writeFile(path.join(ASSETS, "3d-showcase.png"), buf);
}

async function captureHeroGif(page, base) {
  await page.setViewportSize(VIEWPORT_GIF);
  await page.goto(base + "/", { waitUntil: "networkidle", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3500));

  const fps = 6;
  const seconds = 6;
  const n = fps * seconds;
  const frameDelayMs = Math.round(1000 / fps);
  const frames = [];

  for (let i = 0; i < n; i++) {
    const buf = await page.screenshot({ type: "png", fullPage: false });
    frames.push(buf);
    await new Promise((r) => setTimeout(r, frameDelayMs));
  }

  const first = rgbaFromPngBuffer(frames[0]);
  const { width, height, data: firstData } = first;
  const globalPalette = quantize(firstData, 256);
  const gif = GIFEncoder();

  for (let fi = 0; fi < frames.length; fi++) {
    const f = frames[fi];
    const { width: w, height: h, data } = rgbaFromPngBuffer(f);
    if (w !== width || h !== height) {
      throw new Error("Frame size mismatch");
    }
    const index = applyPalette(data, globalPalette);
    const opts = { palette: globalPalette, delay: frameDelayMs };
    if (fi === 0) opts.repeat = 0;
    gif.writeFrame(index, width, height, opts);
  }

  gif.finish();
  await writeFile(path.join(ASSETS, "hero.gif"), Buffer.from(gif.bytes()));
}

async function main() {
  mkdirSync(ASSETS, { recursive: true });
  const server = await startMeadowStaticServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: VIEWPORT_PNG,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    await captureShowcase(page, base);
    await captureHeroGif(page, base);

    await browser.close();
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
