#!/usr/bin/env node
// Generate a printable kanji-writing worksheet from today's due Anki reviews.
//
// Proof of concept: talks to a locally running Anki instance via the
// AnkiConnect add-on (http://127.0.0.1:8765), pulls due cards from the
// "漢字 Writing" deck (and its subdecks), and writes a printable HTML
// worksheet (a self-contained file with a bundled Japanese font, so kanji
// render correctly regardless of what fonts are installed on the machine
// that prints it) with a blank writing space under each prompt and an
// optional answer key at the end. Plain-text output is still available via
// --text if you don't need the font/print styling.
//
// Requirements:
// - Anki must be running with the AnkiConnect add-on installed and enabled.
// - Node.js only (built-in modules + global fetch, Node 18+). No npm
//   dependencies -- this file is standalone and is never imported by the
//   React app, so it can't end up in the webpack bundle. Run it directly
//   with `node scripts/kanji-worksheet.js`, no `npm install` needed.
//
// Usage:
//   node scripts/kanji-worksheet.js
//   node scripts/kanji-worksheet.js --deck "漢字 Writing" --output worksheet.html
//   node scripts/kanji-worksheet.js --text --output worksheet.txt
//   node scripts/kanji-worksheet.js --max-cards 20 --no-answer-key

const fs = require("fs");
const path = require("path");

const ANKICONNECT_URL = "http://127.0.0.1:8765";
const ANKICONNECT_VERSION = 6;

// Bundled font used for the HTML worksheet, embedded as base64 so the
// output file is fully self-contained (no missing-kanji-glyph "tofu" boxes
// when printing from a machine that doesn't have a Japanese font
// installed). HGKyokashotai is a "kyokasho-tai" (textbook-style) typeface,
// which is the same style used in Japanese school textbooks for stroke
// practice. Source: OnlineWebFonts.com, CC BY 4.0 -- see
// scripts/fonts/ATTRIBUTION.txt.
const DEFAULT_FONT_PATH = path.join(__dirname, "fonts", "HGKyokashotai.woff2");
const FONT_FAMILY_NAME = "HGKyokashotai";

// Field names (in priority order) that are likely to hold "the answer" i.e.
// the kanji/expression the card is testing. Anki note types vary a lot from
// person to person, so once you've inspected your own note type's field
// names (see the "Note: no answer field matched" messages printed to
// stderr), add/reorder names here to match your deck.
const ANSWER_FIELD_CANDIDATES = ["Kanji", "Answer", "Back", "Target", "Expression", "漢字"];

class AnkiConnectError extends Error {}

/**
 * Send a single AnkiConnect request and return its `result` field.
 * Throws AnkiConnectError with a human-readable message on any failure
 * (Anki not running, AnkiConnect not installed, bad request, etc.).
 */
async function ankiRequest(action, params = {}, url = ANKICONNECT_URL) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: ANKICONNECT_VERSION, params }),
    });
  } catch (err) {
    throw new AnkiConnectError(
      `Could not reach AnkiConnect at ${url}.\n` +
        "Make sure Anki is open and the AnkiConnect add-on (code 2055492159) " +
        "is installed and enabled.\n" +
        `Underlying error: ${err.message}`
    );
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    throw new AnkiConnectError("AnkiConnect returned a response that could not be parsed as JSON.");
  }

  if (!("error" in body) || !("result" in body)) {
    throw new AnkiConnectError(`Unexpected AnkiConnect response shape: ${JSON.stringify(body)}`);
  }
  if (body.error !== null) {
    throw new AnkiConnectError(`AnkiConnect error: ${body.error}`);
  }

  return body.result;
}

const HTML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === "#") {
      const codePoint = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }
    return Object.prototype.hasOwnProperty.call(HTML_ENTITIES, entity) ? HTML_ENTITIES[entity] : match;
  });
}

const BLOCK_TAGS = new Set(["div", "p", "tr", "li"]);

/**
 * Convert Anki card HTML into plain text, preserving line breaks.
 *
 * This is deliberately simple (regex-based, no DOM/parser dependency). It
 * turns <br>/<div>/<p>/etc. into newlines and drops everything else, which
 * is enough for typical Anki card HTML (furigana <ruby> markup, <b>/<span>
 * styling, etc.) in this PoC.
 */
function stripHtml(rawHtml) {
  if (!rawHtml) return "";

  let text = rawHtml.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  text = text.replace(/<\/?([a-zA-Z0-9]+)[^>]*>/g, (match, tag) => (BLOCK_TAGS.has(tag.toLowerCase()) ? "\n" : ""));
  text = decodeHtmlEntities(text);

  const lines = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0);
  return lines.join("\n");
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Build an Anki search query for due cards in `deck` and its subdecks.
 *
 * Anki's `deck:"Name"` search already matches subdecks automatically (it's
 * a prefix match on the deck hierarchy), so `deck:"漢字 Writing"` covers e.g.
 * "漢字 Writing::N5" too -- no need for a `deck:"漢字 Writing::*"` wildcard.
 * If you ever rename the deck to include special characters that confuse
 * the query parser, the wildcard form below is a fallback:
 *   deck:"漢字 Writing" OR deck:"漢字 Writing::*"
 *
 * `is:due` covers cards that are due for review *today*, which includes
 * both review-stage and learning-stage cards that are currently due (but
 * not cards still in learning with a future due time today, e.g. a card
 * due in 10 minutes -- those aren't "due" yet in Anki's own definition
 * either). To also sweep in cards still mid-learning-step for today
 * regardless of exact due time, you can broaden this to:
 *   deck:"漢字 Writing" (is:due OR is:learn)
 */
function buildDueQuery(deck) {
  const escapedDeck = deck.replace(/"/g, '\\"');
  return `deck:"${escapedDeck}" is:due`;
}

/** Return cardsInfo results for due cards in `deck` (incl. subdecks). */
async function fetchDueCards(deck, { maxCards, url = ANKICONNECT_URL } = {}) {
  const query = buildDueQuery(deck);
  let cardIds = await ankiRequest("findCards", { query }, url);

  if (!cardIds || cardIds.length === 0) {
    throw new AnkiConnectError(
      `No due cards found for query: ${query}\n` +
        "Double-check the deck name (it must match exactly, including any " +
        "spaces/kanji) and that you actually have cards due today."
    );
  }

  if (typeof maxCards === "number") {
    cardIds = cardIds.slice(0, maxCards);
  }

  return ankiRequest("cardsInfo", { cards: cardIds }, url);
}

/**
 * Try to find a likely "answer" (target kanji/expression) for a card.
 *
 * Looks at card.fields for any of ANSWER_FIELD_CANDIDATES (exact match
 * first, then case-insensitive). Returns null if nothing matches, in which
 * case the worksheet just omits the answer for that item.
 *
 * ADJUST ME: once you've inspected your real note type's field names (run
 * this script once and check the "Available fields" message printed to
 * stderr for unmatched cards), add your field name to
 * ANSWER_FIELD_CANDIDATES above.
 */
function extractAnswer(card) {
  const fields = card.fields || {};

  for (const name of ANSWER_FIELD_CANDIDATES) {
    if (fields[name]) {
      const value = stripHtml(fields[name].value || "");
      if (value) return value;
    }
  }

  const lowerMap = {};
  for (const name of Object.keys(fields)) lowerMap[name.toLowerCase()] = name;
  for (const candidate of ANSWER_FIELD_CANDIDATES) {
    const actualName = lowerMap[candidate.toLowerCase()];
    if (actualName) {
      const value = stripHtml(fields[actualName].value || "");
      if (value) return value;
    }
  }

  return null;
}

/**
 * Extract the printable prompt/context sentence for a card.
 *
 * For the PoC we use the rendered `question` HTML (this is what Anki shows
 * on the front of the card, including any card-template formatting),
 * stripped down to plain text. If that's empty for some reason, we fall
 * back to the note's first field.
 *
 * ADJUST ME: if your note type puts the context sentence in a specific
 * field (e.g. "Sentence" or "Context") rather than relying on the rendered
 * question, prefer that field directly here, e.g.:
 *   const fields = card.fields || {};
 *   if (fields.Sentence) return stripHtml(fields.Sentence.value);
 */
function extractPrompt(card) {
  const questionText = stripHtml(card.question || "");
  if (questionText) return questionText;

  const fields = card.fields || {};
  const firstField = Object.values(fields)[0];
  if (firstField) return stripHtml(firstField.value || "");

  return "(no prompt found)";
}

/** Turn raw AnkiConnect card objects into { prompt, answer } items. */
function buildWorksheetItems(cards) {
  return cards.map((card) => {
    const prompt = extractPrompt(card);
    const answer = extractAnswer(card);
    if (answer === null) {
      // Helpful for adjusting ANSWER_FIELD_CANDIDATES to your note type.
      console.error(
        `Note: no answer field matched for card ${card.cardId}. Available fields: ${JSON.stringify(
          Object.keys(card.fields || {})
        )}`
      );
    }
    return { prompt, answer };
  });
}

/** Render worksheet items as plain text. */
function renderTxt(items, { includeAnswerKey = true, blankLines = 4 } = {}) {
  const out = ["Kanji Writing Worksheet", "=".repeat(24), ""];

  items.forEach(({ prompt }, index) => {
    out.push(`${index + 1}. ${prompt}`);
    for (let i = 0; i < blankLines; i++) out.push("");
    out.push("-".repeat(40));
    out.push("");
  });

  if (includeAnswerKey) {
    const answered = items.map((item, i) => [i + 1, item.answer]).filter(([, a]) => a);
    if (answered.length > 0) {
      out.push("");
      out.push("Answer Key");
      out.push("=".repeat(10));
      for (const [num, answer] of answered) out.push(`${num}. ${answer}`);
    }
  }

  return out.join("\n") + "\n";
}

/**
 * Return an @font-face CSS block with the font embedded as base64.
 *
 * Returns an empty string (and prints a warning) if the font file can't be
 * read -- the worksheet still renders fine, it just falls back to whatever
 * Japanese-capable system fonts are installed.
 */
function loadFontFaceCss(fontPath, familyName = FONT_FAMILY_NAME) {
  let fontBuffer;
  try {
    fontBuffer = fs.readFileSync(fontPath);
  } catch (err) {
    console.error(`Warning: could not load bundled font at ${fontPath} (${err.message}); falling back to system fonts.`);
    return "";
  }

  const encoded = fontBuffer.toString("base64");
  return `
  @font-face {
    font-family: "${familyName}";
    src: url(data:font/woff2;base64,${encoded}) format("woff2");
    font-weight: normal;
    font-style: normal;
  }`;
}

/** Render worksheet items as a print-friendly, self-contained HTML document. */
function renderHtml(items, { includeAnswerKey = true, deckName = "", fontPath = DEFAULT_FONT_PATH } = {}) {
  const fontFaceCss = loadFontFaceCss(fontPath);

  const rows = items
    .map(
      ({ prompt }, index) => `
        <div class="item">
          <div class="prompt"><span class="num">${index + 1}.</span> ${escapeHtml(prompt).replace(/\n/g, "<br>")}</div>
          <div class="writing-box"></div>
        </div>`
    )
    .join("");

  let answerKeyHtml = "";
  if (includeAnswerKey) {
    const answered = items.map((item, i) => [i + 1, item.answer]).filter(([, a]) => a);
    if (answered.length > 0) {
      const answerRows = answered
        .map(([num, answer]) => `        <li><strong>${num}.</strong> ${escapeHtml(answer)}</li>`)
        .join("\n");
      answerKeyHtml = `
      <div class="answer-key">
        <h2>Answer Key</h2>
        <ol class="answer-list">
${answerRows}
        </ol>
      </div>`;
    }
  }

  let title = "Kanji Writing Worksheet";
  if (deckName) title += " &mdash; " + escapeHtml(deckName);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
${fontFaceCss}
  @page {
    size: A4;
    margin: 18mm;
  }
  body {
    font-family: "${FONT_FAMILY_NAME}", "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
    font-size: 14pt;
    color: #111;
  }
  h1 {
    font-size: 18pt;
    margin-bottom: 4mm;
  }
  .item {
    break-inside: avoid;
    page-break-inside: avoid;
    margin-bottom: 8mm;
  }
  .num {
    font-weight: bold;
  }
  .prompt {
    margin-bottom: 3mm;
    line-height: 1.6;
    font-size: 16pt;
  }
  .writing-box {
    border: 1px solid #888;
    height: 28mm;
    background-image: repeating-linear-gradient(
      to bottom,
      transparent,
      transparent 6.9mm,
      #ddd 7mm
    );
  }
  .answer-key {
    margin-top: 12mm;
    page-break-before: always;
  }
  .answer-list {
    column-count: 2;
  }
  .font-credit {
    margin-top: 10mm;
    font-size: 8pt;
    color: #999;
  }
</style>
</head>
<body>
  <h1>${title}</h1>
${rows}
${answerKeyHtml}
  <!-- Font attribution required by CC BY 4.0, see scripts/fonts/ATTRIBUTION.txt -->
  <div class="font-credit">Font: HGKyokashotai, from <a href="http://www.onlinewebfonts.com">OnlineWebFonts.com</a> (CC BY 4.0)</div>
</body>
</html>
`;
}

function parseArgs(argv) {
  const args = {
    deck: "漢字 Writing",
    output: "kanji_writing_worksheet.html",
    maxCards: null,
    noAnswerKey: false,
    text: false,
    font: DEFAULT_FONT_PATH,
    ankiconnectUrl: ANKICONNECT_URL,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      case "--deck":
        args.deck = argv[++i];
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "--max-cards":
        args.maxCards = parseInt(argv[++i], 10);
        break;
      case "--no-answer-key":
        args.noAnswerKey = true;
        break;
      case "--text":
        args.text = true;
        break;
      case "--font":
        args.font = argv[++i];
        break;
      case "--ankiconnect-url":
        args.ankiconnectUrl = argv[++i];
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Generate a printable kanji-writing worksheet from Anki's due cards.

Usage: node scripts/kanji-worksheet.js [options]

Options:
  --deck <name>            Deck name to pull due cards from, including subdecks
                            (default: "漢字 Writing").
  --output <path>           Output file path (default: kanji_writing_worksheet.html).
  --max-cards <n>           Maximum number of cards to include (default: no limit).
  --no-answer-key           Omit the answer key section from the worksheet.
  --text                    Generate a plain-text worksheet instead of the default
                            print-friendly HTML (HTML is recommended: it bundles a
                            Japanese font so kanji always render correctly when printed).
  --font <path>             Path to a .woff2 font to embed in the HTML worksheet
                            (default: bundled scripts/fonts/HGKyokashotai.woff2).
                            Ignored with --text.
  --ankiconnect-url <url>   AnkiConnect endpoint URL (default: http://127.0.0.1:8765).
  -h, --help                Show this help message.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const includeAnswerKey = !args.noAnswerKey;

  try {
    await ankiRequest("version", {}, args.ankiconnectUrl);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  let cards;
  try {
    cards = await fetchDueCards(args.deck, { maxCards: args.maxCards, url: args.ankiconnectUrl });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const items = buildWorksheetItems(cards);

  const content = args.text
    ? renderTxt(items, { includeAnswerKey })
    : renderHtml(items, { includeAnswerKey, deckName: args.deck, fontPath: args.font });

  fs.writeFileSync(args.output, content, "utf-8");

  console.log(`Exported ${items.length} card(s) from deck "${args.deck}" to ${args.output}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  ankiRequest,
  stripHtml,
  escapeHtml,
  buildDueQuery,
  fetchDueCards,
  extractAnswer,
  extractPrompt,
  buildWorksheetItems,
  renderTxt,
  renderHtml,
  loadFontFaceCss,
  AnkiConnectError,
};
