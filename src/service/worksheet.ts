import { AnkiCardInfo } from "../types/AnkiConnect";

export type WorksheetItem = {
  prompt: string;
  answer: string | null;
};

const BLOCK_TAGS = new Set(["div", "p", "tr", "li", "br"]);

/**
 * Convert Anki card HTML into plain text, preserving line breaks.
 * Uses DOMParser (available in the browser) rather than a regex, so it
 * correctly ignores the contents of <style>/<script> tags instead of
 * dumping template CSS into the worksheet text.
 */
export function stripHtml(rawHtml: string): string {
  if (!rawHtml) return "";

  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  doc.querySelectorAll("style, script").forEach((el) => el.remove());

  const lines: string[] = [];
  let current = "";

  const flush = () => {
    lines.push(current);
    current = "";
  };

  const walk = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = (node as Element).tagName.toLowerCase();
    if (tag === "br") {
      flush();
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) flush();
    node.childNodes.forEach(walk);
    if (isBlock) flush();
  };

  doc.body.childNodes.forEach(walk);
  flush();

  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

// This app's own writing-card note models ("Writing Cards Japanese" /
// "Writing Cards Chinese", see api/ankiConnect.ts addWritingCardToAnki)
// always use SentenceFront as the context sentence and Kanji/Hanzi as the
// target character, so those are checked first. The rest are fallbacks for
// decks that contain cards from other note types/sources.
//
// ADJUST ME: if your deck uses a note type with different field names, add
// them here (or reorder) once you've inspected the "no answer field
// matched" messages logged to the console.
const PROMPT_FIELD_CANDIDATES = ["SentenceFront", "Sentence", "Context"];
const ANSWER_FIELD_CANDIDATES = ["Kanji", "Hanzi", "Answer", "Back", "Target", "Expression", "漢字"];

function findFieldValue(fields: AnkiCardInfo["fields"], candidates: string[]): string | null {
  for (const name of candidates) {
    if (fields[name]?.value) {
      const value = stripHtml(fields[name].value);
      if (value) return value;
    }
  }

  const lowerMap: Record<string, string> = {};
  for (const name of Object.keys(fields)) lowerMap[name.toLowerCase()] = name;
  for (const candidate of candidates) {
    const actualName = lowerMap[candidate.toLowerCase()];
    if (actualName && fields[actualName]?.value) {
      const value = stripHtml(fields[actualName].value);
      if (value) return value;
    }
  }

  return null;
}

/** Try to find a likely "answer" (target kanji/expression) for a card. */
export function extractAnswer(card: AnkiCardInfo): string | null {
  return findFieldValue(card.fields || {}, ANSWER_FIELD_CANDIDATES);
}

/** Extract the printable prompt/context sentence for a card. */
export function extractPrompt(card: AnkiCardInfo): string {
  const fields = card.fields || {};

  const knownField = findFieldValue(fields, PROMPT_FIELD_CANDIDATES);
  if (knownField) return knownField;

  const questionText = stripHtml(card.question);
  if (questionText) return questionText;

  const firstField = Object.values(fields)[0];
  if (firstField?.value) return stripHtml(firstField.value);

  return "";
}

/** Turn raw AnkiConnect card objects into printable worksheet items. */
export function buildWorksheetItems(cards: AnkiCardInfo[]): WorksheetItem[] {
  return cards.map((card) => {
    const prompt = extractPrompt(card);
    const answer = extractAnswer(card);
    if (answer === null) {
      // Helpful for adjusting ANSWER_FIELD_CANDIDATES to your note type.
      console.warn(
        `No answer field matched for card ${card.cardId}. Available fields: ${Object.keys(
          card.fields || {}
        ).join(", ")}`
      );
    }
    return { prompt, answer };
  });
}

/**
 * Build an Anki search query for due cards in `deck` and its subdecks.
 *
 * Anki's `deck:"Name"` search already matches subdecks automatically (it's
 * a prefix match on the deck hierarchy), so `deck:"漢字 Writing"` covers e.g.
 * "漢字 Writing::N5" too -- no need for a wildcard. `is:due` covers cards
 * due for review today (review + learning cards that are currently due).
 */
export function buildDueQuery(deck: string): string {
  const escapedDeck = deck.replace(/"/g, '\\"');
  return `deck:"${escapedDeck}" is:due`;
}
