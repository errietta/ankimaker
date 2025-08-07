import { useState, useEffect, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation } from "react-i18next";

import LogoutButton from "./LogoutButton";
import SettingsComponent from "./Settings";
import "./App.css";
import { SentenceCard } from "./types/Cards";
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
    }
  };

  // Add new sentence
  const addSentence = () => {
    setSentences([...sentences, { text: "", meaning: "", reading: "" }]);
  };

  // Handle input change
  const handleSentenceChange = (index, event) => {
    const newSentences = [...sentences];
    newSentences[index].text = event.target.value;
    setSentences(newSentences);
  };

  // Fetch meaning from the backend API (Mocked as setTimeout for now)
  const getMeaning = async (index) => {
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
    const meaning = await client.getSentenceMeaning(sentence);

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

  const [settings, setSettings] = useState(() => {
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

  const settingsUpdated = useCallback((newSettings) => {
    setSettings({ ...newSettings });
  }, []);

  const [ankiResults, setAnkiResults] = useState<AnkiConnectResult[]>([]);

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
          settings
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
          {ankiResults && (
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
          )}
        </div>
      )}

      <button className="button-download" onClick={downloadCSV}>
        {t("get_csv")}
      </button>
      <button className="button-danger" onClick={clearAll}>
        {t("clear_all")}
      </button>
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
