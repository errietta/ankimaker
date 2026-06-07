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

// Served from the @madcat/kanjivg npm package (version tracked in package.json)
const KANJIVG_CDN =
  "https://cdn.jsdelivr.net/npm/@madcat/kanjivg@5.0.0/dist/main";

export async function generateJPDiagram(word: string): Promise<string | null> {
  const chars = [...word].filter(isCJK);
  if (chars.length === 0) return null;

  const size = 109; // @madcat/kanjivg viewBox is 109x109
  const canvas = document.createElement("canvas");
  canvas.width = size * chars.length;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0)!.toString(16).padStart(5, "0");
    try {
      const res = await fetch(`${KANJIVG_CDN}/${cp}.svg`);
      if (!res.ok) continue;
      const svgText = await res.text();

      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
      svgDoc.querySelectorAll("path").forEach((path, pi) => {
        path.setAttribute(
          "style",
          `stroke:${STROKE_COLORS[pi % STROKE_COLORS.length]};stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round;`
        );
      });

      await renderSvgBlob(
        new XMLSerializer().serializeToString(svgDoc),
        ctx,
        i * size,
        0,
        size
      );
    } catch {
      continue;
    }
  }

  return canvas.toDataURL("image/png").split(",")[1];
}

interface HanziCharData {
  strokes: string[];
  medians: number[][][];
}

// Served from the hanzi-writer-data npm package (version tracked in package.json)
const HANZI_WRITER_CDN =
  "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1";

export async function generateCNDiagram(word: string): Promise<string | null> {
  const chars = [...word];
  if (chars.length === 0) return null;

  const charSize = 120;
  const padding = 8;
  const canvas = document.createElement("canvas");
  canvas.width = charSize * chars.length;
  canvas.height = charSize;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let ci = 0; ci < chars.length; ci++) {
    try {
      const res = await fetch(`${HANZI_WRITER_CDN}/${chars[ci]}.json`);
      if (!res.ok) continue;
      const charData: HanziCharData = await res.json();

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
    } catch {
      continue;
    }
  }

  return canvas.toDataURL("image/png").split(",")[1];
}
