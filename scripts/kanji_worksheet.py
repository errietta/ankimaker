#!/usr/bin/env python3
"""
Generate a printable kanji-writing worksheet from today's due Anki reviews.

Proof of concept: talks to a locally running Anki instance via the
AnkiConnect add-on (http://127.0.0.1:8765), pulls due cards from the
"漢字 Writing" deck (and its subdecks), and writes a plain-text (and
optionally HTML) worksheet with a blank writing space under each prompt
and an optional answer key at the end.

Requirements:
- Anki must be running with the AnkiConnect add-on installed and enabled.
- Python standard library only (no third-party dependencies).

Usage:
    python3 scripts/kanji_worksheet.py
    python3 scripts/kanji_worksheet.py --deck "漢字 Writing" --output worksheet.txt
    python3 scripts/kanji_worksheet.py --html --output worksheet.html
    python3 scripts/kanji_worksheet.py --max-cards 20 --no-answer-key
"""

import argparse
import html
import json
import re
import sys
import urllib.error
import urllib.request
from html.parser import HTMLParser

ANKICONNECT_URL = "http://127.0.0.1:8765"
ANKICONNECT_VERSION = 6

# Field names (in priority order) that are likely to hold "the answer" i.e.
# the kanji/expression the card is testing. Anki note types vary a lot from
# person to person, so once you've inspected your own note type's field
# names (see the printed "Available fields" debug output when a card has
# no match), add/reorder names here to match your deck.
ANSWER_FIELD_CANDIDATES = [
    "Kanji",
    "Answer",
    "Back",
    "Target",
    "Expression",
    "漢字",
]


class AnkiConnectError(RuntimeError):
    """Raised when AnkiConnect is unreachable or returns an error."""


def anki_request(action, params=None, url=ANKICONNECT_URL, timeout=10):
    """Send a single AnkiConnect request and return its `result` field.

    Raises AnkiConnectError with a human-readable message on any failure
    (Anki not running, AnkiConnect not installed, bad request, etc.).
    """
    payload = {
        "action": action,
        "version": ANKICONNECT_VERSION,
        "params": params or {},
    }
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
    except urllib.error.URLError as exc:
        raise AnkiConnectError(
            "Could not reach AnkiConnect at {url}.\n"
            "Make sure Anki is open and the AnkiConnect add-on (code 2055492159) "
            "is installed and enabled.\n"
            "Underlying error: {err}".format(url=url, err=exc)
        ) from exc

    try:
        response_json = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise AnkiConnectError(
            "AnkiConnect returned a response that could not be parsed as JSON."
        ) from exc

    if "error" not in response_json or "result" not in response_json:
        raise AnkiConnectError(
            "Unexpected AnkiConnect response shape: {resp}".format(resp=response_json)
        )
    if response_json["error"] is not None:
        raise AnkiConnectError("AnkiConnect error: {err}".format(err=response_json["error"]))

    return response_json["result"]


class _HTMLTextExtractor(HTMLParser):
    """Minimal HTML-to-text converter that preserves line breaks.

    This is deliberately simple (stdlib html.parser, no external deps).
    It turns <br>/<div>/<p> into newlines and drops everything else,
    which is enough for typical Anki card HTML (furigana ruby markup,
    <b>/<span> styling, etc.) in this PoC.
    """

    BLOCK_TAGS = {"div", "p", "tr", "li"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.chunks = []

    def handle_starttag(self, tag, attrs):
        if tag == "br":
            self.chunks.append("\n")
        elif tag in self.BLOCK_TAGS:
            self.chunks.append("\n")

    def handle_endtag(self, tag):
        if tag in self.BLOCK_TAGS:
            self.chunks.append("\n")

    def handle_data(self, data):
        self.chunks.append(data)

    def get_text(self):
        text = "".join(self.chunks)
        # Collapse runs of blank lines and trailing/leading whitespace per line.
        lines = [line.strip() for line in text.splitlines()]
        lines = [line for line in lines if line]
        return "\n".join(lines)


def strip_html(raw_html):
    """Convert Anki card HTML into plain text, preserving line breaks."""
    if not raw_html:
        return ""
    parser = _HTMLTextExtractor()
    parser.feed(raw_html)
    parser.close()
    text = parser.get_text()
    # Collapse repeated whitespace that can appear inside a single line.
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def build_due_query(deck):
    """Build an Anki search query for due cards in `deck` and its subdecks.

    Anki's `deck:"Name"` search already matches subdecks automatically
    (it's a prefix match on the deck hierarchy), so `deck:"漢字 Writing"`
    covers e.g. "漢字 Writing::N5" too -- no need for a `deck:"漢字 Writing::*"`
    wildcard. If you ever rename the deck to include special characters
    that confuse the query parser, the wildcard form below is a fallback:
        deck:"漢字 Writing" OR deck:"漢字 Writing::*"

    `is:due` covers cards that are due for review *today*, which includes
    both review-stage and learning-stage cards that are currently due
    (but not cards still in learning with a future due time today, e.g.
    a card due in 10 minutes -- those aren't "due" yet in Anki's own
    definition either). To also sweep in cards still mid-learning-step
    for today regardless of exact due time, you can broaden this to:
        deck:"漢字 Writing" (is:due OR is:learn)
    """
    escaped_deck = deck.replace('"', '\\"')
    return 'deck:"{deck}" is:due'.format(deck=escaped_deck)


def fetch_due_cards(deck, max_cards=None, url=ANKICONNECT_URL):
    """Return cardsInfo results for due cards in `deck` (incl. subdecks)."""
    query = build_due_query(deck)
    card_ids = anki_request("findCards", {"query": query}, url=url)

    if not card_ids:
        raise AnkiConnectError(
            "No due cards found for query: {query}\n"
            "Double-check the deck name (it must match exactly, including "
            "any spaces/kanji) and that you actually have cards due today."
            .format(query=query)
        )

    if max_cards is not None:
        card_ids = card_ids[:max_cards]

    cards = anki_request("cardsInfo", {"cards": card_ids}, url=url)
    return cards


def extract_answer(card):
    """Try to find a likely 'answer' (target kanji/expression) for a card.

    Looks at card["fields"] for any of ANSWER_FIELD_CANDIDATES (case-
    sensitive exact match first, then case-insensitive). Returns None if
    nothing matches, in which case the worksheet just omits the answer
    for that item.

    ADJUST ME: once you've inspected your real note type's field names
    (run this script once and check the "Available fields" note printed
    to stderr for unmatched cards), add your field name to
    ANSWER_FIELD_CANDIDATES above.
    """
    fields = card.get("fields", {})

    for name in ANSWER_FIELD_CANDIDATES:
        if name in fields:
            value = strip_html(fields[name].get("value", ""))
            if value:
                return value

    lower_map = {name.lower(): name for name in fields}
    for candidate in ANSWER_FIELD_CANDIDATES:
        actual_name = lower_map.get(candidate.lower())
        if actual_name:
            value = strip_html(fields[actual_name].get("value", ""))
            if value:
                return value

    return None


def extract_prompt(card):
    """Extract the printable prompt/context sentence for a card.

    For the PoC we use the rendered `question` HTML (this is what Anki
    shows on the front of the card, including any card-template
    formatting), stripped down to plain text. If that's empty for some
    reason, we fall back to the note's first field.

    ADJUST ME: if your note type puts the context sentence in a specific
    field (e.g. "Sentence" or "Context") rather than relying on the
    rendered question, prefer that field directly here, e.g.:
        fields = card.get("fields", {})
        if "Sentence" in fields:
            return strip_html(fields["Sentence"]["value"])
    """
    question_text = strip_html(card.get("question", ""))
    if question_text:
        return question_text

    fields = card.get("fields", {})
    if fields:
        first_field = next(iter(fields.values()))
        return strip_html(first_field.get("value", ""))

    return "(no prompt found)"


def build_worksheet_items(cards):
    """Turn raw AnkiConnect card dicts into (prompt, answer) tuples."""
    items = []
    for card in cards:
        prompt = extract_prompt(card)
        answer = extract_answer(card)
        if answer is None:
            # Helpful for adjusting ANSWER_FIELD_CANDIDATES to your note type.
            print(
                "Note: no answer field matched for card {card_id}. "
                "Available fields: {fields}".format(
                    card_id=card.get("cardId"),
                    fields=list(card.get("fields", {}).keys()),
                ),
                file=sys.stderr,
            )
        items.append((prompt, answer))
    return items


def render_txt(items, include_answer_key=True, blank_lines=4):
    """Render worksheet items as plain text."""
    out = []
    out.append("Kanji Writing Worksheet")
    out.append("=" * 24)
    out.append("")

    for index, (prompt, _answer) in enumerate(items, start=1):
        out.append("{num}. {prompt}".format(num=index, prompt=prompt))
        for _ in range(blank_lines):
            out.append("")
        out.append("-" * 40)
        out.append("")

    if include_answer_key:
        answered = [(i, a) for i, (_, a) in enumerate(items, start=1) if a]
        if answered:
            out.append("")
            out.append("Answer Key")
            out.append("=" * 10)
            for index, answer in answered:
                out.append("{num}. {answer}".format(num=index, answer=answer))

    return "\n".join(out) + "\n"


def render_html(items, include_answer_key=True, deck_name=""):
    """Render worksheet items as a print-friendly HTML document."""
    rows = []
    for index, (prompt, _answer) in enumerate(items, start=1):
        rows.append(
            """
        <div class="item">
          <div class="prompt"><span class="num">{num}.</span> {prompt}</div>
          <div class="writing-box"></div>
        </div>""".format(num=index, prompt=html.escape(prompt).replace("\n", "<br>"))
        )

    answer_key_html = ""
    if include_answer_key:
        answered = [(i, a) for i, (_, a) in enumerate(items, start=1) if a]
        if answered:
            answer_rows = "\n".join(
                "        <li><strong>{num}.</strong> {answer}</li>".format(
                    num=index, answer=html.escape(answer)
                )
                for index, answer in answered
            )
            answer_key_html = """
      <div class="answer-key">
        <h2>Answer Key</h2>
        <ol class="answer-list">
{rows}
        </ol>
      </div>""".format(rows=answer_rows)

    title = "Kanji Writing Worksheet"
    if deck_name:
        title += " &mdash; " + html.escape(deck_name)

    return """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<style>
  @page {{
    size: A4;
    margin: 18mm;
  }}
  body {{
    font-family: "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
    font-size: 14pt;
    color: #111;
  }}
  h1 {{
    font-size: 18pt;
    margin-bottom: 4mm;
  }}
  .item {{
    break-inside: avoid;
    page-break-inside: avoid;
    margin-bottom: 8mm;
  }}
  .num {{
    font-weight: bold;
  }}
  .prompt {{
    margin-bottom: 3mm;
    line-height: 1.6;
  }}
  .writing-box {{
    border: 1px solid #888;
    height: 28mm;
    background-image: repeating-linear-gradient(
      to bottom,
      transparent,
      transparent 6.9mm,
      #ddd 7mm
    );
  }}
  .answer-key {{
    margin-top: 12mm;
    page-break-before: always;
  }}
  .answer-list {{
    column-count: 2;
  }}
</style>
</head>
<body>
  <h1>{title}</h1>
{rows}
{answer_key}
</body>
</html>
""".format(title=title, rows="".join(rows), answer_key=answer_key_html)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Generate a printable kanji-writing worksheet from Anki's due cards."
    )
    parser.add_argument(
        "--deck",
        default="漢字 Writing",
        help='Deck name to pull due cards from, including subdecks (default: "漢字 Writing").',
    )
    parser.add_argument(
        "--output",
        default="kanji_writing_worksheet.txt",
        help="Output file path (default: kanji_writing_worksheet.txt).",
    )
    parser.add_argument(
        "--max-cards",
        type=int,
        default=None,
        help="Maximum number of cards to include (default: no limit).",
    )
    parser.add_argument(
        "--no-answer-key",
        action="store_true",
        help="Omit the answer key section from the worksheet.",
    )
    parser.add_argument(
        "--html",
        action="store_true",
        help="Generate a print-friendly HTML worksheet instead of plain text.",
    )
    parser.add_argument(
        "--ankiconnect-url",
        default=ANKICONNECT_URL,
        help="AnkiConnect endpoint URL (default: http://127.0.0.1:8765).",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    include_answer_key = not args.no_answer_key

    try:
        anki_request("version", url=args.ankiconnect_url)
    except AnkiConnectError as exc:
        print("Error: {exc}".format(exc=exc), file=sys.stderr)
        return 1

    try:
        cards = fetch_due_cards(args.deck, max_cards=args.max_cards, url=args.ankiconnect_url)
    except AnkiConnectError as exc:
        print("Error: {exc}".format(exc=exc), file=sys.stderr)
        return 1

    items = build_worksheet_items(cards)

    if args.html:
        content = render_html(items, include_answer_key=include_answer_key, deck_name=args.deck)
    else:
        content = render_txt(items, include_answer_key=include_answer_key)

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(content)

    print(
        "Exported {count} card(s) from deck \"{deck}\" to {output}".format(
            count=len(items), deck=args.deck, output=args.output
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
