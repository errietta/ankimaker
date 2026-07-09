import { AnkiCardInfo } from "../types/AnkiConnect";

export type WorksheetItem = {
  promptHtml: string;
  answer: string | null;
};

const BLOCK_TAGS = new Set(["div", "p", "tr", "li", "br"]);
const INLINE_FORMAT_TAGS = new Set(["u", "b", "strong", "em", "i", "mark", "s", "strike"]);

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Convert Anki card HTML into a small, safe HTML string for rendering in the
 * worksheet: text is escaped from scratch (nothing from the original markup
 * passes through unescaped) and only a short allowlist of inline formatting
 * tags (<u>, <b>, <em>, ...) survives, since Anki cards commonly underline
 * or bold the target word/reading and that cue is worth keeping on the
 * worksheet. Everything else (styling classes, <span>, <ruby>/<rt>, etc.) is
 * unwrapped -- its text is kept, the tag is dropped.
 */
export function sanitizeCardHtml(rawHtml: string): string {
  if (!rawHtml) return "";

  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  doc.querySelectorAll("style, script").forEach((el) => el.remove());

  const render = (node: ChildNode): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml(node.textContent ?? "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const inner = Array.from(el.childNodes).map(render).join("");

    if (tag === "br") return "<br>";
    if (BLOCK_TAGS.has(tag)) return inner + "<br>";
    if (INLINE_FORMAT_TAGS.has(tag)) return `<${tag}>${inner}</${tag}>`;
    return inner;
  };

  let html = Array.from(doc.body.childNodes).map(render).join("");

  html = html
    .replace(/[ \t]+/g, " ")
    .replace(/(\s*<br>\s*){2,}/g, "<br>")
    .replace(/^(\s*<br>\s*)+/, "")
    .replace(/(\s*<br>\s*)+$/, "");

  return html.trim();
}

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

// Fallback field names, used only when a card's rendered `question` HTML
// (see extractPrompt below) is empty. This app's own writing-card note
// models use SentenceFront/Kanji/Hanzi (see api/ankiConnect.ts
// addWritingCardToAnki).
//
// ADJUST ME: if your deck uses a note type with different field names, add
// them here (or reorder) once you've inspected the "no answer field
// matched" messages logged to the console.
const PROMPT_FIELD_CANDIDATES = ["SentenceFront", "Sentence", "Context"];
const ANSWER_FIELD_CANDIDATES = ["Kanji", "Hanzi", "Answer", "Back", "Target", "Expression", "漢字"];

function findFormattedFieldValue(fields: AnkiCardInfo["fields"], candidates: string[]): string | null {
  for (const name of candidates) {
    if (fields[name]?.value) {
      const value = sanitizeCardHtml(fields[name].value);
      if (value) return value;
    }
  }
  return null;
}

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

/**
 * Extract the printable prompt/context sentence for a card, as safe HTML
 * (see sanitizeCardHtml).
 *
 * Prefers the card's rendered `question` HTML -- i.e. literally what Anki
 * shows on the front of the card -- over the raw field values, because
 * formatting cues like an underlined target word are often applied by the
 * card template (or added by hand in Anki's rich-text field editor) and
 * only show up in the rendered HTML, not in a plain field value.
 */
export function extractPrompt(card: AnkiCardInfo): string {
  const questionHtml = sanitizeCardHtml(card.question);
  if (questionHtml) return questionHtml;

  const fields = card.fields || {};
  const knownField = findFormattedFieldValue(fields, PROMPT_FIELD_CANDIDATES);
  if (knownField) return knownField;

  const firstField = Object.values(fields)[0];
  if (firstField?.value) return sanitizeCardHtml(firstField.value);

  return "";
}

/** Turn raw AnkiConnect card objects into printable worksheet items. */
export function buildWorksheetItems(cards: AnkiCardInfo[]): WorksheetItem[] {
  return cards.map((card) => {
    const promptHtml = extractPrompt(card);
    const answer = extractAnswer(card);
    if (answer === null) {
      // Helpful for adjusting ANSWER_FIELD_CANDIDATES to your note type.
      console.warn(
        `No answer field matched for card ${card.cardId}. Available fields: ${Object.keys(
          card.fields || {}
        ).join(", ")}`
      );
    }
    return { promptHtml, answer };
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
