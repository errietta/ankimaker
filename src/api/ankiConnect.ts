import { SentenceCard, WritingCardData } from "../types/Cards";
import { AnkiConnectResult } from "../types/AnkiConnect";
import { AppSettings } from "../types/AppSettings";


function constructAnkiPayload(settings: AppSettings, sentence: SentenceCard, translationLanguage: string="jp-JP") {
  return {
    action: "addNote",
    version: 6,
    params: {
      note: {
        deckName: settings.ankiDeck,
        modelName: (translationLanguage === "jp-JP") ? "Tango Card Format" : "Chinese deck",
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
  settings: AppSettings,
  translationLanguage: string,
): Promise<AnkiConnectResult[]> => {
  const results: AnkiConnectResult[] = [];

  for (const sentence of sentences) {
    if (!sentence.text || !sentence.meaning || !sentence.reading) {
      continue;
    }

    const payload = constructAnkiPayload(settings, sentence, translationLanguage);

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

export async function addWritingCardToAnki(
  data: WritingCardData,
  settings: AppSettings,
  language: string
): Promise<AnkiConnectResult> {
  const isJP = language === "jp-JP";
  const modelName = isJP ? "Writing Cards Japanese" : "Writing Cards Chinese";
  const sentenceFront = data.sentence.replace(data.word, data.reading);

  const fields = isJP
    ? {
        Kanji: data.word,
        Kana: data.reading,
        SentenceFront: sentenceFront,
        SentenceBack: data.sentence,
        KankenLevel: data.level,
        Meaning: data.meaning,
        Picture: "",
        KankenAudio: "",
        Diagram: "",
      }
    : {
        Hanzi: data.word,
        Pinyin: data.reading,
        SentenceFront: sentenceFront,
        SentenceBack: data.sentence,
        HSKLevel: data.level,
        Meaning: data.meaning,
        Picture: "",
        HSKAudio: "",
        Diagram: "",
      };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const note: Record<string, any> = {
    deckName: settings.ankiDeck,
    modelName,
    fields,
    tags: ["anki-maker"],
    options: { allowDuplicate: false },
  };

  if (data.diagramBase64) {
    note.picture = [
      {
        data: data.diagramBase64,
        filename: `ankimaker-diagram-${data.word}.png`,
        fields: ["Diagram"],
      },
    ];
  }

  try {
    const response = await fetch(settings.ankiConnectUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addNote", version: 6, params: { note } }),
    });
    const result = await response.json();
    if (result.error) return { error: result.error };
    return { success: `Added: ${data.word}` };
  } catch (e) {
    return { error: String(e) };
  }
}
