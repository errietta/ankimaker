import { SentenceCard } from "../types/Cards";
import { AnkiConnectResult } from "../types/AnkiConnect";
import { AppSettings } from "../types/AppSettings";


function constructAnkiPayload(settings: AppSettings, sentence: SentenceCard) {
  return {
    action: "addNote",
    version: 6,
    params: {
      note: {
        deckName: settings.ankiDeck,
        modelName: "Tango Card Format",
        fields: {
          Expression: sentence.text,
          Meaning: sentence.meaning,
          Reading: sentence.reading,
        },
        options: { allowDuplicate: false },
        tags: ["anki-maker"],
      },
    },
  };
}

export const addSentencesToAnki = async (
  sentences: SentenceCard[],
  settings: AppSettings
): Promise<AnkiConnectResult[]> => {
  const results: AnkiConnectResult[] = [];

  for (const sentence of sentences) {
    if (!sentence.text || !sentence.meaning || !sentence.reading) {
      continue;
    }

    const payload = constructAnkiPayload(settings, sentence);

    try {
      const response = await fetch(settings.ankiConnectUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        results.push({
          error: `Error saving "${sentence.text}": ${response.statusText}`,
        });
        continue;
      }

      const data = await response.json();
      console.log(data);
      results.push({
        success: `Saved "${sentence.text}" successfully`,
        data,
      });
    } catch (error) {
      results.push({
        error: `Error saving "${sentence.text}"`,
      });
    }
  }

  return results;
};
