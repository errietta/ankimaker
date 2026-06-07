const STROKE_COLORS = [
  "#e74c3c",
  "#e67e22",
  "#2ecc71",
  "#3498db",
  "#9b59b6",
  "#e91e63",
  "#00bcd4",
  "#f39c12",
];

function isCJK(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff)
  );
}

function renderSvgBlob(
  svgStr: string,
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): Promise<void> {
  return new Promise((resolve) => {
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const blobUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, x, y, size, size);
      URL.revokeObjectURL(blobUrl);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      resolve();
    };
    img.src = blobUrl;
  });
}

// Keyed by 5-digit hex codepoint; value is an array of SVG path `d` strings.
// Bundled from @madcat/kanjivg by scripts/bundle-data.js.
type KanjivgData = Record<string, string[]>;

// Lazy singleton — fetched once per session, then served offline by the SW.
let kanjivgLoad: Promise<KanjivgData> | null = null;
let kanjivgReady = false;
function loadKanjivg(): Promise<KanjivgData> {
  if (!kanjivgLoad) {
    kanjivgLoad = fetch(`${process.env.PUBLIC_URL}/data/kanjivg.json`)
      .then((r) => r.json())
      .then((data) => { kanjivgReady = true; return data; });
  }
  return kanjivgLoad;
}

export async function generateJPDiagram(word: string): Promise<string | null> {
  const chars = [...word].filter(isCJK);
  if (chars.length === 0) return null;

  const kanjivg = await loadKanjivg();

  const size = 109; // viewBox is 109x109
  const canvas = document.createElement("canvas");
  canvas.width = size * chars.length;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0)!.toString(16).padStart(5, "0");
    const paths = kanjivg[cp];
    if (!paths) continue;

    const pathElems = paths
      .map(
        (d, pi) =>
          `<path d="${d}" style="stroke:${STROKE_COLORS[pi % STROKE_COLORS.length]};stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round;"/>`
      )
      .join("");
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 109 109">${pathElems}</svg>`;

    await renderSvgBlob(svgStr, ctx, i * size, 0, size);
  }

  return canvas.toDataURL("image/png").split(",")[1];
}

interface HanziCharData {
  strokes: string[];
  medians: number[][][];
}

// Keyed by the Unicode character itself.
// Bundled from hanzi-writer-data by scripts/bundle-data.js.
type HanziData = Record<string, HanziCharData>;

let hanziLoad: Promise<HanziData> | null = null;
let hanziReady = false;
function loadHanzi(): Promise<HanziData> {
  if (!hanziLoad) {
    hanziLoad = fetch(`${process.env.PUBLIC_URL}/data/hanzi.json`)
      .then((r) => r.json())
      .then((data) => { hanziReady = true; return data; });
  }
  return hanziLoad;
}

export function preloadDiagramData(language: "jp-JP" | "zh-CN"): Promise<unknown> {
  return language === "jp-JP" ? loadKanjivg() : loadHanzi();
}

export function isDiagramDataReady(language: "jp-JP" | "zh-CN"): boolean {
  return language === "jp-JP" ? kanjivgReady : hanziReady;
}

export async function generateCNDiagram(word: string): Promise<string | null> {
  const chars = [...word];
  if (chars.length === 0) return null;

  const hanzi = await loadHanzi();

  const charSize = 120;
  const padding = 8;
  const canvas = document.createElement("canvas");
  canvas.width = charSize * chars.length;
  canvas.height = charSize;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let ci = 0; ci < chars.length; ci++) {
    const charData = hanzi[chars[ci]];
    if (!charData) continue;

    const innerSize = charSize - padding * 2;
    const paths = charData.strokes
      .map(
        (d, i) =>
          `<path d="${d}" fill="${STROKE_COLORS[i % STROKE_COLORS.length]}"/>`
      )
      .join("");

    // medians use bottom-left origin; svgY = 900 - strokeY converts to SVG space
    const numbers = charData.medians
      .map((median, i) => {
        if (!median || median.length === 0) return "";
        const [mx, my] = median[0];
        return `<text x="${mx}" y="${900 - my}" font-size="80" fill="white" stroke="#222" stroke-width="18" paint-order="stroke" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-weight="bold">${i + 1}</text>`;
      })
      .join("");

    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${innerSize}" height="${innerSize}"><g transform="scale(1,-1) translate(0,-900)">${paths}</g>${numbers}</svg>`;
    await renderSvgBlob(svgStr, ctx, ci * charSize + padding, padding, innerSize);
  }

  return canvas.toDataURL("image/png").split(",")[1];
}
