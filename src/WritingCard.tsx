import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation } from "react-i18next";
import { ApiClient } from "./api/meaning";
import { addWritingCardToAnki } from "./api/ankiConnect";
import { AppSettings } from "./types/AppSettings";
import { WritingCardData } from "./types/Cards";
import { AnkiConnectResult } from "./types/AnkiConnect";

interface WritingCardProps {
  language: "jp-JP" | "zh-CN";
  settings: AppSettings;
}

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

async function generateJPDiagram(word: string): Promise<string | null> {
  const chars = [...word];
  const size = 109; // KanjiVG viewBox is 109x109
  const canvas = document.createElement("canvas");
  canvas.width = size * chars.length;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0)!.toString(16).padStart(5, "0");
    const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${cp}.svg`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const svgText = await res.text();

      // Color individual strokes differently for visual clarity
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
      const strokeGroup = svgDoc.querySelector('[id*="StrokePaths"]');
      if (strokeGroup) {
        const paths = strokeGroup.querySelectorAll("path");
        paths.forEach((path, pi) => {
          path.setAttribute(
            "style",
            `stroke:${STROKE_COLORS[pi % STROKE_COLORS.length]};stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round;`
          );
        });
      }

      const coloredSvg = new XMLSerializer().serializeToString(svgDoc);
      const blob = new Blob([coloredSvg], { type: "image/svg+xml" });
      const blobUrl = URL.createObjectURL(blob);

      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, i * size, 0, size, size);
          URL.revokeObjectURL(blobUrl);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          resolve();
        };
        img.src = blobUrl;
      });
    } catch {
      continue;
    }
  }

  return canvas.toDataURL("image/png").split(",")[1];
}

async function generateCNDiagram(word: string): Promise<string | null> {
  const chars = [...word];
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
      const res = await fetch(
        `https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/${chars[ci]}.json`
      );
      if (!res.ok) continue;
      const charData = await res.json();

      const innerSize = charSize - padding * 2;
      // hanzi-writer-data uses bottom-left origin; flip Y with transform on path group
      const paths = (charData.strokes as string[])
        .map(
          (d, i) =>
            `<path d="${d}" fill="${STROKE_COLORS[i % STROKE_COLORS.length]}"/>`
        )
        .join("");

      // Place stroke order numbers at the start of each stroke's median.
      // Medians are in stroke-space coords (y increases upward); convert to SVG space: svgY = 900 - strokeY.
      // Text is placed outside the flipped <g> so it reads correctly.
      const numbers = (charData.medians as number[][][])
        .map((median, i) => {
          if (!median || median.length === 0) return "";
          const [mx, my] = median[0];
          const svgY = 900 - my;
          return `<text x="${mx}" y="${svgY}" font-size="80" fill="white" stroke="#222" stroke-width="18" paint-order="stroke" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-weight="bold">${i + 1}</text>`;
        })
        .join("");

      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${innerSize}" height="${innerSize}"><g transform="scale(1,-1) translate(0,-900)">${paths}</g>${numbers}</svg>`;
      const blob = new Blob([svgStr], { type: "image/svg+xml" });
      const blobUrl = URL.createObjectURL(blob);

      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, ci * charSize + padding, padding, innerSize, innerSize);
          URL.revokeObjectURL(blobUrl);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          resolve();
        };
        img.src = blobUrl;
      });
    } catch {
      continue;
    }
  }

  return canvas.toDataURL("image/png").split(",")[1];
}

function WritingCard({ language, settings }: WritingCardProps) {
  const { getAccessTokenSilently } = useAuth0();
  const { t } = useTranslation();
  const isJP = language === "jp-JP";

  const deckKey = `writingDeck-${language}`;

  const [word, setWord] = useState("");
  const [reading, setReading] = useState("");
  const [sentence, setSentence] = useState("");
  const [level, setLevel] = useState("");
  const [meaning, setMeaning] = useState("");
  const [deck, setDeck] = useState<string>(
    () => localStorage.getItem(deckKey) ?? settings.ankiDeck
  );
  const [isFetchingMeaning, setIsFetchingMeaning] = useState(false);
  const [diagramBase64, setDiagramBase64] = useState<string | null>(null);
  const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false);
  const [saveResult, setSaveResult] = useState<AnkiConnectResult | null>(null);

  const handleDeckChange = (value: string) => {
    setDeck(value);
    localStorage.setItem(deckKey, value);
  };

  const sentenceFront = word && reading ? sentence.replace(word, reading) : sentence;

  const handleGetMeaning = async () => {
    if (!word) return;
    setIsFetchingMeaning(true);
    try {
      const accessToken = await getAccessTokenSilently({
        authorizationParams: {
          audience: "https://card.backend/",
          scope: "read:current_user",
        },
      });
      const result = await new ApiClient(accessToken).getSentenceMeaning(
        { text: word, meaning: "", reading: "" },
        language
      );
      setMeaning(result.reply.meaning);
      if (!reading && result.reply.reading) {
        // Extract kana from furigana markup e.g. " 様[よう]子[す]" → "ようす"
        const brackets = result.reply.reading.match(/\[([^\]]+)\]/g);
        if (brackets && brackets.length > 0) {
          setReading(brackets.map((m) => m.slice(1, -1)).join(""));
        } else {
          setReading(result.reply.reading.trim());
        }
      }
    } catch {
      /* silent — user can type manually */
    } finally {
      setIsFetchingMeaning(false);
    }
  };

  const handleGenerateDiagram = async () => {
    if (!word) return;
    setIsGeneratingDiagram(true);
    try {
      const base64 = isJP
        ? await generateJPDiagram(word)
        : await generateCNDiagram(word);
      setDiagramBase64(base64);
    } catch {
      /* silent */
    } finally {
      setIsGeneratingDiagram(false);
    }
  };

  const handleSaveToAnki = async () => {
    const data: WritingCardData = { word, reading, sentence, level, meaning, diagramBase64 };
    const result = await addWritingCardToAnki(data, { ...settings, ankiDeck: deck }, language);
    setSaveResult(result);
  };

  return (
    <div className="writing-card-container">
      <div className="writing-card-field">
        <label className="writing-card-label">{t(isJP ? "kanji" : "hanzi")}</label>
        <input
          type="text"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          className="writing-card-input"
        />
      </div>

      <div className="writing-card-field">
        <label className="writing-card-label">{t(isJP ? "kana" : "pinyin")}</label>
        <input
          type="text"
          value={reading}
          onChange={(e) => setReading(e.target.value)}
          className="writing-card-input"
        />
      </div>

      <div className="writing-card-field">
        <label className="writing-card-label">{t("example_sentence")}</label>
        <textarea
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          rows={3}
          className="writing-card-textarea"
        />
      </div>

      {word && reading && sentence && (
        <div className="result writing-card-preview">
          <p>
            <strong>{t("sentence_front")}:</strong> {sentenceFront}
          </p>
          <p>
            <strong>{t("sentence_back")}:</strong> {sentence}
          </p>
        </div>
      )}

      <div className="writing-card-field">
        <label className="writing-card-label">
          {t(isJP ? "kanken_level" : "hsk_level")}
        </label>
        <input
          type="number"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="writing-card-input writing-card-input-narrow"
        />
      </div>

      <div className="writing-card-field writing-card-field-row">
        <div className="writing-card-field-grow">
          <label className="writing-card-label">{t("meaning")}</label>
          <input
            type="text"
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            className="writing-card-input"
          />
        </div>
        <button
          className="button-alt writing-card-inline-btn"
          onClick={handleGetMeaning}
          disabled={!word || isFetchingMeaning}
        >
          {isFetchingMeaning ? "..." : t("get_meaning")}
        </button>
      </div>

      <div className="writing-card-diagram-section">
        <button
          className="button-alt"
          onClick={handleGenerateDiagram}
          disabled={!word || isGeneratingDiagram}
        >
          {isGeneratingDiagram ? t("generating_diagram") : t("generate_diagram")}
        </button>
        {diagramBase64 && (
          <img
            src={`data:image/png;base64,${diagramBase64}`}
            alt={t("diagram_preview")}
            className="writing-card-diagram-img"
          />
        )}
      </div>

      {settings.ankConnect && (
        <>
          <div className="writing-card-field">
            <label className="writing-card-label">{t("Anki deck")}</label>
            <input
              type="text"
              value={deck}
              onChange={(e) => handleDeckChange(e.target.value)}
              className="writing-card-input"
            />
          </div>
          <button
            className="button-save"
            onClick={handleSaveToAnki}
            disabled={!word || !reading || !sentence || !meaning}
          >
            {t("save_to_anki")}
          </button>
        </>
      )}

      {saveResult && (
        <div className="result">
          {saveResult.error && (
            <span style={{ color: "red" }}>❌ {saveResult.error}</span>
          )}
          {saveResult.success && (
            <span style={{ color: "green" }}>✅ {saveResult.success}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default WritingCard;
