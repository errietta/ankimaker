#!/usr/bin/env node
// Bundles @madcat/kanjivg SVGs and hanzi-writer-data JSONs into two compact
// JSON files under public/data/ so the app can fetch them in one request and
// the Workbox service worker can precache them for offline use.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "data");
fs.mkdirSync(outDir, { recursive: true });

// ── KanjiVG ──────────────────────────────────────────────────────────────────
// Extracts path `d` attributes from each minified SVG.
// Output: { "05c71": ["M52.49,15.5...", ...], ... }
const kanjivgDir = path.join(root, "node_modules", "@madcat", "kanjivg", "dist", "main");
const kanjivgOut = {};
const svgFiles = fs.readdirSync(kanjivgDir).filter((f) => f.endsWith(".svg"));
for (const file of svgFiles) {
  const cp = file.slice(0, -4); // strip .svg
  const svg = fs.readFileSync(path.join(kanjivgDir, file), "utf-8");
  const paths = [];
  const re = / d="([^"]+)"/g;
  let m;
  while ((m = re.exec(svg)) !== null) paths.push(m[1]);
  if (paths.length > 0) kanjivgOut[cp] = paths;
}
fs.writeFileSync(path.join(outDir, "kanjivg.json"), JSON.stringify(kanjivgOut));
console.log(`kanjivg.json: ${svgFiles.length} kanji`);

// ── Hanzi Writer ──────────────────────────────────────────────────────────────
// Strips everything except strokes + medians to keep the file compact.
// Output: { "我": { strokes: [...], medians: [...] }, ... }
const hanziDir = path.join(root, "node_modules", "hanzi-writer-data");
const hanziOut = {};
const jsonFiles = fs
  .readdirSync(hanziDir)
  .filter((f) => f.endsWith(".json") && f !== "package.json");
for (const file of jsonFiles) {
  const char = file.slice(0, -5); // strip .json — the actual Unicode character
  const raw = JSON.parse(fs.readFileSync(path.join(hanziDir, file), "utf-8"));
  hanziOut[char] = { strokes: raw.strokes, medians: raw.medians };
}
fs.writeFileSync(path.join(outDir, "hanzi.json"), JSON.stringify(hanziOut));
console.log(`hanzi.json: ${jsonFiles.length} characters`);
