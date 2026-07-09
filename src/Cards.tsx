import { useState, useEffect, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation } from "react-i18next";

import LogoutButton from "./LogoutButton";
import SettingsComponent from "./Settings";
import PhotoOCR from "./PhotoOCR";
import WritingCard from "./WritingCard";
import KanjiWorksheet from "./KanjiWorksheet";
import "./App.css";
import { SentenceCard } from "./types/Cards";
import { AppSettings } from "./types/AppSettings";
import { ApiClient } from "./api/meaning";
import { addSentencesToAnki } from "./api/ankiConnect";
import { AnkiConnectResult } from "./types/AnkiConnect";
import { createCSV } from "./service/csv";

function Cards() {
  const { getAccessTokenSilently } = useAuth0();
  const { t } = useTranslation();

  const [sentences, setSentences] = useState<SentenceCard[]>(() => {
    // Retrieve sentences from local storage on page load
    const savedSentences = localStorage.getItem("sentences");
    return savedSentences
      ? JSON.parse(savedSentences)
      : [{ text: "", meaning: "", reading: "" }];
  });

  // Save sentences to local storage whenever it changes
  useEffect(() => {
    localStorage.setItem("sentences", JSON.stringify(sentences));
  }, [sentences]);

  const clearAll = () => {
    if (window.confirm(t("really_clear"))) {
      setSentences([{ text: "", meaning: "", reading: "" }]); // Reset to a single empty sentence field
      localStorage.removeItem("sentences"); // Clear localStorage
      setAnkiResults([]); // Clear Anki results
    }
  };

  // Add new sentence
  const addSentence = () => {
    setSentences([...sentences, { text: "", meaning: "", reading: "" }]);
  };

  // Handle input change
  const handleSentenceChange = (index: number, event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newSentences = [...sentences];
    newSentences[index].text = event.target.value;
    setSentences(newSentences);
  };

  // Fetch meaning from the backend API (Mocked as setTimeout for now)
  const getMeaning = async (index: number) => {
    const sentence = sentences[index];
    if (!sentence.text) return;

    const accessToken = await getAccessTokenSilently({
      authorizationParams: {
        audience: `https://card.backend/`,
        scope: "read:current_user",
      },
    });

    console.log({ accessToken });

    const client = new ApiClient(accessToken);
    const meaning = await client.getSentenceMeaning(sentence, translationLanguage);

    setSentences((currentSentences) => {
      const newSentences = [...currentSentences];
      newSentences[index].reading = meaning.reply.reading;
      newSentences[index].meaning = meaning.reply.meaning;
      newSentences[index].text = meaning.reply.sentence;
      return newSentences;
    });
  };

  const downloadCSV = async () => {
    // Retrieve meanings for sentences that don't have one yet
    for (let i = 0; i < sentences.length; i++) {
      if (!sentences[i].meaning) {
        await getMeaning(i);
      }
    }

    const csvWithBOM = createCSV(sentences);

    // Create Blob with BOM
    const blob = new Blob([csvWithBOM], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    forceDownload(url);
  };

  const [settings, setSettings] = useState<AppSettings>(() => {
    // Retrieve settings from local storage on page load
    const savedSettings = localStorage.getItem("settings");
    return savedSettings
      ? JSON.parse(savedSettings)
      : {
          ankConnect: true,
          ankiConnectUrl: "http://localhost:8765",
          ankiDeck: "Default",
          ankiModel: "Basic",
        };
  });

  // Save settings to local storage whenever it changes
  useEffect(() => {
    localStorage.setItem("settings", JSON.stringify(settings));
  }, [settings]);

  const settingsUpdated = useCallback((newSettings: AppSettings) => {
    setSettings({ ...newSettings });
  }, []);

  const [translationLanguage, setTranslationLanguage] = useState<string>(() => {
    const saved = localStorage.getItem("translationLanguage");
    return saved || "jp-JP";
  });

  // Save translation language to localStorage
  useEffect(() => {
    localStorage.setItem("translationLanguage", translationLanguage);
  }, [translationLanguage]);

  const [ankiResults, setAnkiResults] = useState<AnkiConnectResult[]>([]);

  const [activeSection, setActiveSection] = useState<"card-gen" | "worksheet-gen">("card-gen");
  const [activeTab, setActiveTab] = useState<"text" | "photo" | "kanji-writing" | "hanzi-writing">("text");
  const [hasPhotoOCR, setHasPhotoOCR] = useState(false);

  useEffect(() => {
    getAccessTokenSilently({
      authorizationParams: { audience: "https://card.backend/", scope: "read:current_user" },
    })
      .then((token) => {
        const payload = JSON.parse(atob(token.split(".")[1]));
        const perms: string[] = payload.permissions || [];
        setHasPhotoOCR(perms.includes("use:photo-ocr"));
      })
      .catch(() => setHasPhotoOCR(false));
  }, [getAccessTokenSilently]);

  const addSentenceFromOCR = useCallback((card: SentenceCard) => {
    setSentences((prev) => [...prev, card]);
    setActiveTab("text");
  }, []);

  const saveToAnkiConnect = async () => {
    // Retrieve meanings for sentences that don't have one yet
    for (let i = 0; i < sentences.length; i++) {
      if (!sentences[i].meaning) {
        await getMeaning(i);
      }
    }

    setSentences((currentSentences) => {
      const processSentences = async () => {
        const results: AnkiConnectResult[] = await addSentencesToAnki(
          currentSentences,
          settings,
          translationLanguage
        );

        setAnkiResults(results);
      };

      processSentences();
      return currentSentences;
    });
  };

  return (
    <div className="app">
      <h1>{t("welcome")}</h1>

      <SettingsComponent
        settingsUpdated={settingsUpdated}
        defaultSettings={settings}
      />

      <div className="section-nav">
        <button
          className={`section-btn${activeSection === "card-gen" ? " section-btn--active" : ""}`}
          onClick={() => setActiveSection("card-gen")}
        >
          {t("section_card_gen")}
        </button>
        <button
          className={`section-btn${activeSection === "worksheet-gen" ? " section-btn--active" : ""}`}
          onClick={() => setActiveSection("worksheet-gen")}
        >
          {t("section_worksheet_gen")}
        </button>
      </div>

      {activeSection === "card-gen" && (
        <>
          <div className="tab-nav">
            <button
              className={`tab-btn${activeTab === "text" ? " tab-btn--active" : ""}`}
              onClick={() => setActiveTab("text")}
            >
              {t("tab_text")}
            </button>
            {hasPhotoOCR && (
              <button
                className={`tab-btn${activeTab === "photo" ? " tab-btn--active" : ""}`}
                onClick={() => setActiveTab("photo")}
              >
                {t("tab_photo")}
              </button>
            )}
            <button
              className={`tab-btn${activeTab === "kanji-writing" ? " tab-btn--active" : ""}`}
              onClick={() => setActiveTab("kanji-writing")}
            >
              {t("tab_kanji_writing")}
            </button>
            <button
              className={`tab-btn${activeTab === "hanzi-writing" ? " tab-btn--active" : ""}`}
              onClick={() => setActiveTab("hanzi-writing")}
            >
              {t("tab_hanzi_writing")}
            </button>
          </div>

          {activeTab === "text" && (
            <>
              <div className="language-section">
                <h2>{t("source_language")}</h2>
                <select
                  value={translationLanguage}
                  onChange={(e) => setTranslationLanguage(e.target.value)}
                  className="language-dropdown"
                >
                  <option value="jp-JP">{t("japanese")}</option>
                  <option value="zh-CN">{t("chinese")}</option>
                </select>
              </div>
              {sentences.map((sentence, index) => (
                <div key={index} className="sentence-container">
                  <textarea
                    value={sentence.text}
                    onChange={(event) => handleSentenceChange(index, event)}
                    placeholder={t("add_sentence")}
                    rows={2}
                    cols={30}
                  ></textarea>
                  <button onClick={() => getMeaning(index)}>{t("get_meaning")}</button>
                  {sentence.meaning && (
                    <p>
                      {t("meaning")}: {sentence.meaning}
                    </p>
                  )}
                  {sentence.reading && (
                    <p>
                      {t("reading")}: {sentence.reading}
                    </p>
                  )}
                </div>
              ))}

              <button className="button-add" onClick={addSentence}>
                {t("add_sentence")}
              </button>
              {settings.ankConnect && (
                <button className="button-save" onClick={saveToAnkiConnect}>
                  {t("save_to_anki")}
                </button>
              )}

              {ankiResults && (
                <div className="result">
                  <div>
                    {ankiResults.map((result, index) => (
                      <p key={index}>
                        {result.error && (
                          <span style={{ color: "red" }}>❌ {result.error}</span>
                        )}
                        {result.success && (
                          <span style={{ color: "green" }}>✅ {result.success}</span>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <button className="button-download" onClick={downloadCSV}>
                {t("get_csv")}
              </button>
              <button className="button-danger" onClick={clearAll}>
                {t("clear_all")}
              </button>
            </>
          )}

          {activeTab === "photo" && hasPhotoOCR && (
            <PhotoOCR
              translationLanguage={translationLanguage}
              onCardAdded={addSentenceFromOCR}
            />
          )}

          {activeTab === "kanji-writing" && (
            <WritingCard language="jp-JP" settings={settings} />
          )}

          {activeTab === "hanzi-writing" && (
            <WritingCard language="zh-CN" settings={settings} />
          )}
        </>
      )}

      {activeSection === "worksheet-gen" && <KanjiWorksheet settings={settings} />}

      <br />
      <br />
      <div>
        <LogoutButton />
      </div>
    </div>
  );

  

  function forceDownload(url: string) {
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "anki-sentences.csv");
    document.body.appendChild(link); // Required for FF
    link.click();
    document.body.removeChild(link);
  }
}

export default Cards;
