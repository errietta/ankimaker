import { useState, useEffect, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation } from "react-i18next";
import { ApiClient } from "./api/meaning";
import { addWritingCardToAnki } from "./api/ankiConnect";
import { AppSettings } from "./types/AppSettings";
import { WritingCardData } from "./types/Cards";
import { AnkiConnectResult } from "./types/AnkiConnect";
import {
  generateJPDiagram,
  generateCNDiagram,
  preloadDiagramData,
  isDiagramDataReady,
} from "./diagrams";

type DataState = "loading" | "ready" | "error";

interface WritingCardProps {
  language: "jp-JP" | "zh-CN";
  settings: AppSettings;
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
  const [dataState, setDataState] = useState<DataState>(
    () => isDiagramDataReady(language) ? "ready" : "loading"
  );

  const startDataLoad = useCallback(() => {
    setDataState("loading");
    preloadDiagramData(language)
      .then(() => setDataState("ready"))
      .catch(() => setDataState("error"));
  }, [language]);

  useEffect(() => {
    if (!isDiagramDataReady(language)) startDataLoad();
    else setDataState("ready");
  }, [language, startDataLoad]);

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
          onChange={(e) => {
            if (sentence === word) setSentence(e.target.value);
            setWord(e.target.value);
          }}
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
        {dataState === "loading" && (
          <div className="diagram-loading">
            <div className="diagram-loading-row">
              <span className="diagram-loading-spinner" />
              <span>{t("loading_stroke_data")}</span>
            </div>
            <span className="diagram-loading-hint">{t("loading_stroke_hint")}</span>
          </div>
        )}
        {dataState === "error" && (
          <div className="diagram-loading">
            <span className="diagram-loading-error">{t("loading_stroke_error")}</span>
            <button className="button-alt writing-card-inline-btn" onClick={startDataLoad}>
              {t("retry")}
            </button>
          </div>
        )}
        {dataState === "ready" && (
          <>
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
          </>
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
