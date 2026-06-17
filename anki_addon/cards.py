"""Direct Anki card creation using the native collection API (no AnkiConnect)."""

from __future__ import annotations

from typing import Optional

# Field name candidates in priority order
_EXPRESSION_FIELDS = ["Expression", "Front", "Word", "Sentence", "Hanzi", "Text"]
_MEANING_FIELDS = ["Meaning", "Back", "Definition", "Translation"]
_READING_FIELDS = ["Reading", "Kana", "Pinyin", "Pronunciation", "Furigana"]


def _find_field(model_fields: list, candidates: list) -> Optional[str]:
    for candidate in candidates:
        if candidate in model_fields:
            return candidate
    return None


def get_model_field_map(model_name: str) -> dict:
    """
    Return {'expression': field_name, 'meaning': field_name, 'reading': field_name}
    for the named note type, or empty strings if a field could not be detected.
    """
    from aqt import mw
    model = mw.col.models.by_name(model_name)
    if not model:
        return {"expression": "", "meaning": "", "reading": ""}

    field_names = [f["name"] for f in model["flds"]]
    return {
        "expression": _find_field(field_names, _EXPRESSION_FIELDS) or "",
        "meaning": _find_field(field_names, _MEANING_FIELDS) or "",
        "reading": _find_field(field_names, _READING_FIELDS) or "",
    }


def add_sentence_card(
    deck_name: str,
    model_name: str,
    sentence: str,
    meaning: str,
    reading: str,
) -> dict:
    """
    Add a sentence card directly via mw.col.

    Returns {'success': True} or {'error': str}.
    Must be called from the main thread.
    """
    from aqt import mw
    from anki.notes import Note

    col = mw.col

    model = col.models.by_name(model_name)
    if not model:
        return {"error": f'Note type "{model_name}" not found'}

    field_names = [f["name"] for f in model["flds"]]
    expr_field = _find_field(field_names, _EXPRESSION_FIELDS)
    meaning_field = _find_field(field_names, _MEANING_FIELDS)
    reading_field = _find_field(field_names, _READING_FIELDS)

    if not expr_field:
        return {
            "error": (
                f'No expression field found in "{model_name}". '
                f"Expected one of: {_EXPRESSION_FIELDS}"
            )
        }

    # Duplicate check
    escaped = sentence.replace('"', '\\"')
    if col.find_notes(f'{expr_field}:"{escaped}"'):
        return {"error": f'Duplicate: "{sentence}" already exists in this collection'}

    # Get or create deck
    deck_id = col.decks.id(deck_name, create=True)

    # Create note
    try:
        note = col.new_note(model)
    except AttributeError:
        note = Note(col, model)

    note[expr_field] = sentence
    if meaning_field and meaning:
        note[meaning_field] = meaning
    if reading_field and reading:
        note[reading_field] = reading
    note.tags = ["anki-maker"]

    col.add_note(note, deck_id)
    return {"success": True}
