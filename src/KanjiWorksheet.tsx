import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AppSettings } from "./types/AppSettings";
import { fetchDueWorksheetCards } from "./api/ankiConnect";
import { buildWorksheetItems, WorksheetItem } from "./service/worksheet";

interface KanjiWorksheetProps {
  settings: AppSettings;
}

const DECK_STORAGE_KEY = "worksheetDeck";

function KanjiWorksheet({ settings }: KanjiWorksheetProps) {
  const { t } = useTranslation();

  const [deck, setDeck] = useState<string>(
    () => localStorage.getItem(DECK_STORAGE_KEY) ?? settings.ankiDeck
  );
  const [maxCards, setMaxCards] = useState("");
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [items, setItems] = useState<WorksheetItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleDeckChange = (value: string) => {
    setDeck(value);
    localStorage.setItem(DECK_STORAGE_KEY, value);
  };

  const handleFetch = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const cards = await fetchDueWorksheetCards(deck, settings, {
        maxCards: maxCards ? parseInt(maxCards, 10) : undefined,
      });
      setItems(buildWorksheetItems(cards));
    } catch (err) {
      setItems([]);
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [deck, maxCards, settings]);

  const answeredItems = items
    .map((item, index) => ({ ...item, number: index + 1 }))
    .filter((item): item is WorksheetItem & { number: number; answer: string } => Boolean(item.answer));

  return (
    <div className="writing-card-container">
      <div className="writing-card-field">
        <label className="writing-card-label">{t("worksheet_deck")}</label>
        <input
          type="text"
          value={deck}
          onChange={(e) => handleDeckChange(e.target.value)}
          className="writing-card-input"
        />
      </div>

      <div className="writing-card-field writing-card-field-row">
        <div className="writing-card-field-grow">
          <label className="writing-card-label">{t("worksheet_max_cards")}</label>
          <input
            type="number"
            min={1}
            value={maxCards}
            onChange={(e) => setMaxCards(e.target.value)}
            className="writing-card-input writing-card-input-narrow"
            placeholder={t("worksheet_no_limit")}
          />
        </div>
        <label className="worksheet-checkbox-label">
          <input
            type="checkbox"
            checked={includeAnswerKey}
            onChange={(e) => setIncludeAnswerKey(e.target.checked)}
          />
          {t("worksheet_include_answer_key")}
        </label>
      </div>

      <button className="button-alt" onClick={handleFetch} disabled={!deck || isLoading}>
        {isLoading ? t("worksheet_loading") : t("worksheet_fetch")}
      </button>

      {errorMessage && (
        <div className="result">
          <span style={{ color: "red" }}>❌ {errorMessage}</span>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="worksheet-toolbar">
            <span>{t("worksheet_card_count", { count: items.length })}</span>
            <button className="button-save worksheet-print-btn" onClick={() => window.print()}>
              {t("worksheet_print")}
            </button>
          </div>

          <div className="worksheet-print-area">
            <h2 className="worksheet-title">{t("worksheet_title")}</h2>

            {items.map((item, index) => (
              <div className="worksheet-item" key={index}>
                <div className="worksheet-prompt">
                  <span className="worksheet-num">{index + 1}.</span>{" "}
                  {item.prompt.split("\n").map((line, lineIndex) => (
                    <span key={lineIndex}>
                      {lineIndex > 0 && <br />}
                      {line}
                    </span>
                  ))}
                </div>
                <div className="worksheet-writing-box" />
              </div>
            ))}

            {includeAnswerKey && answeredItems.length > 0 && (
              <div className="worksheet-answer-key">
                <h3>{t("worksheet_answer_key")}</h3>
                <ul className="worksheet-answer-list">
                  {answeredItems.map((item) => (
                    <li key={item.number}>
                      <strong>{item.number}.</strong> {item.answer}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="worksheet-font-credit">{t("worksheet_font_credit")}</div>
          </div>
        </>
      )}
    </div>
  );
}

export default KanjiWorksheet;
