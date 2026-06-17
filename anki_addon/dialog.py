"""Ankimaker Qt dialog — sentence input, meaning fetch, direct card creation."""

from __future__ import annotations

import threading
from typing import Optional

from aqt import mw
from aqt.qt import (
    QComboBox,
    QDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    Qt,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)
from aqt.utils import showInfo, showWarning

from . import ADDON_PACKAGE
from .api import APIError, get_meaning
from .auth import clear_tokens, device_flow_login, get_or_refresh_token
from .cards import add_sentence_card, get_model_field_map


# ---------------------------------------------------------------------------
# Sentence row widget
# ---------------------------------------------------------------------------

class SentenceRow(QWidget):
    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.resolved_sentence = ""
        self.resolved_meaning = ""
        self.resolved_reading = ""
        self._build_ui()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 4, 0, 4)

        # Text input + remove button
        row = QHBoxLayout()
        self.text_edit = QTextEdit()
        self.text_edit.setPlaceholderText("Enter sentence…")
        self.text_edit.setMaximumHeight(60)
        row.addWidget(self.text_edit)

        self.remove_btn = QPushButton("✕")
        self.remove_btn.setMaximumWidth(30)
        self.remove_btn.setToolTip("Remove row")
        row.addWidget(self.remove_btn, alignment=Qt.AlignmentFlag.AlignTop)
        layout.addLayout(row)

        self.reading_label = QLabel("")
        self.reading_label.setWordWrap(True)
        layout.addWidget(self.reading_label)

        self.meaning_label = QLabel("")
        self.meaning_label.setWordWrap(True)
        layout.addWidget(self.meaning_label)

        self.status_label = QLabel("")
        layout.addWidget(self.status_label)

    def get_text(self) -> str:
        return self.text_edit.toPlainText().strip()

    def set_result(self, sentence: str, meaning: str, reading: str) -> None:
        self.resolved_sentence = sentence
        self.resolved_meaning = meaning
        self.resolved_reading = reading
        self.text_edit.setPlainText(sentence)
        self.reading_label.setText(f"Reading: {reading}" if reading else "")
        self.meaning_label.setText(f"Meaning: {meaning}" if meaning else "")
        self.status_label.setText("")

    def set_status(self, text: str, success: bool) -> None:
        icon = "✅" if success else "❌"
        color = "green" if success else "red"
        self.status_label.setText(f'<span style="color:{color}">{icon} {text}</span>')


# ---------------------------------------------------------------------------
# Main dialog
# ---------------------------------------------------------------------------

class AnkimakerDialog(QDialog):
    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent or mw)
        self.setWindowTitle("Ankimaker")
        self.setMinimumWidth(520)
        self._rows: list[SentenceRow] = []
        self._config: dict = mw.addonManager.getConfig(ADDON_PACKAGE) or {}
        self._build_ui()
        self._populate_anki_data()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)

        # Settings row
        form = QFormLayout()

        self.deck_combo = QComboBox()
        form.addRow("Deck:", self.deck_combo)

        self.model_combo = QComboBox()
        self.model_combo.currentTextChanged.connect(self._on_model_changed)
        form.addRow("Note type:", self.model_combo)

        self.lang_combo = QComboBox()
        self.lang_combo.addItem("Japanese", "jp-JP")
        self.lang_combo.addItem("Chinese", "zh-CN")
        saved_lang = self._config.get("language", "jp-JP")
        self.lang_combo.setCurrentIndex(0 if saved_lang == "jp-JP" else 1)
        form.addRow("Language:", self.lang_combo)

        layout.addLayout(form)

        # Model field warning
        self.model_warning = QLabel("")
        self.model_warning.setStyleSheet("color: orange;")
        self.model_warning.setWordWrap(True)
        self.model_warning.setVisible(False)
        layout.addWidget(self.model_warning)

        # Scrollable sentence rows
        self.rows_widget = QWidget()
        self.rows_layout = QVBoxLayout(self.rows_widget)
        self.rows_layout.setContentsMargins(0, 0, 0, 0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(self.rows_widget)
        scroll.setMinimumHeight(200)
        layout.addWidget(scroll)

        # First row
        self._add_row()

        # Buttons
        btn_row = QHBoxLayout()

        self.add_row_btn = QPushButton("+ Add row")
        self.add_row_btn.clicked.connect(self._add_row)
        btn_row.addWidget(self.add_row_btn)

        btn_row.addStretch()

        self.login_btn = QPushButton("Login")
        self.login_btn.clicked.connect(self._on_login)
        btn_row.addWidget(self.login_btn)

        self.get_meaning_btn = QPushButton("Get Meaning")
        self.get_meaning_btn.clicked.connect(self._on_get_meaning)
        btn_row.addWidget(self.get_meaning_btn)

        self.add_btn = QPushButton("Add to Anki")
        self.add_btn.clicked.connect(self._on_add_to_anki)
        btn_row.addWidget(self.add_btn)

        layout.addLayout(btn_row)

        # Auth status
        self.login_status = QLabel("")
        self.login_status.setOpenExternalLinks(True)
        self.login_status.setWordWrap(True)
        layout.addWidget(self.login_status)

        self._refresh_login_status()

    def _populate_anki_data(self) -> None:
        col = mw.col

        # Decks — read live from Anki
        try:
            deck_names = sorted(d.name for d in col.decks.all_names_and_ids())
        except Exception:
            deck_names = sorted(col.decks.all_names())

        self.deck_combo.addItems(deck_names)
        saved_deck = self._config.get("deck", "Default")
        if saved_deck in deck_names:
            self.deck_combo.setCurrentText(saved_deck)

        # Note types — read live from Anki
        model_names = sorted(col.models.all_names())
        self.model_combo.addItems(model_names)
        saved_model = self._config.get("model", "")
        if saved_model in model_names:
            self.model_combo.setCurrentText(saved_model)

    def _on_model_changed(self, model_name: str) -> None:
        if not model_name:
            return
        fm = get_model_field_map(model_name)
        if not fm["expression"]:
            self.model_warning.setText(
                f'⚠ "{model_name}" has no recognised expression field '
                f"(Expression / Front / Hanzi / …). Cards may be incomplete."
            )
            self.model_warning.setVisible(True)
        else:
            self.model_warning.setVisible(False)

    def _add_row(self) -> None:
        row = SentenceRow()
        row.remove_btn.clicked.connect(lambda: self._remove_row(row))
        self._rows.append(row)
        self.rows_layout.addWidget(row)
        self._update_remove_buttons()

    def _remove_row(self, row: SentenceRow) -> None:
        if len(self._rows) <= 1:
            return
        self._rows.remove(row)
        row.deleteLater()
        self._update_remove_buttons()

    def _update_remove_buttons(self) -> None:
        for row in self._rows:
            row.remove_btn.setVisible(len(self._rows) > 1)

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    def _refresh_login_status(self) -> None:
        token = get_or_refresh_token(self._config)
        if token:
            self.login_status.setText('<span style="color:green">✅ Logged in</span>')
            self.login_btn.setText("Logout")
        else:
            self.login_status.setText(
                '<span style="color:orange">⚠ Not logged in — click Login to authenticate</span>'
            )
            self.login_btn.setText("Login")

    def _on_login(self) -> None:
        token = get_or_refresh_token(self._config)

        if token:
            clear_tokens(self._config)
            self._refresh_login_status()
            return

        self.login_btn.setEnabled(False)
        self.login_status.setText("Starting login…")

        def on_code(user_code: str, uri: str, uri_complete: str) -> None:
            def _ui() -> None:
                self.login_status.setText(
                    f'Open <a href="{uri_complete}">{uri}</a> and enter code: <b>{user_code}</b>'
                )
            mw.taskman.run_on_main(_ui)

        def on_success(_token: str) -> None:
            def _ui() -> None:
                self.login_btn.setEnabled(True)
                self._refresh_login_status()
            mw.taskman.run_on_main(_ui)

        def on_error(msg: str) -> None:
            def _ui() -> None:
                self.login_btn.setEnabled(True)
                self.login_status.setText(f'<span style="color:red">❌ {msg}</span>')
            mw.taskman.run_on_main(_ui)

        device_flow_login(self._config, on_code, on_success, on_error)

    # ------------------------------------------------------------------
    # Get Meaning
    # ------------------------------------------------------------------

    def _on_get_meaning(self) -> None:
        token = get_or_refresh_token(self._config)
        if not token:
            showWarning("Please login first.", parent=self)
            return

        rows = [r for r in self._rows if r.get_text() and not r.resolved_meaning]
        if not rows:
            showInfo("No sentences without meanings to process.", parent=self)
            return

        language = self.lang_combo.currentData()
        api_base = self._config.get(
            "api_base_url", "https://ankimaker-backend-88a288e4b6bb.herokuapp.com/"
        )

        self.get_meaning_btn.setEnabled(False)

        def _worker() -> None:
            for row in rows:
                text = row.get_text()
                try:
                    result = get_meaning(text, language, token, api_base)

                    def _update(r=row, res=result) -> None:
                        r.set_result(res["sentence"], res["meaning"], res["reading"])

                    mw.taskman.run_on_main(_update)
                except APIError as exc:
                    def _err(r=row, e=exc) -> None:
                        r.set_status(str(e), success=False)

                    mw.taskman.run_on_main(_err)

            mw.taskman.run_on_main(lambda: self.get_meaning_btn.setEnabled(True))

        threading.Thread(target=_worker, daemon=True).start()

    # ------------------------------------------------------------------
    # Add to Anki
    # ------------------------------------------------------------------

    def _on_add_to_anki(self) -> None:
        deck_name = self.deck_combo.currentText()
        model_name = self.model_combo.currentText()

        if not deck_name or not model_name:
            showWarning("Please select a deck and note type.", parent=self)
            return

        # Persist preferences
        self._config["deck"] = deck_name
        self._config["model"] = model_name
        self._config["language"] = self.lang_combo.currentData()
        mw.addonManager.writeConfig(ADDON_PACKAGE, self._config)

        added = 0
        for row in self._rows:
            sentence = row.resolved_sentence or row.get_text()
            if not sentence:
                continue

            result = add_sentence_card(
                deck_name, model_name, sentence, row.resolved_meaning, row.resolved_reading
            )
            if result.get("success"):
                row.set_status("Added successfully", success=True)
                added += 1
            else:
                row.set_status(result.get("error", "Unknown error"), success=False)

        if added:
            mw.col.reset()
            mw.reset()
            showInfo(f"Added {added} card(s) to Anki.", parent=self)


# ---------------------------------------------------------------------------
# Entry point called from __init__.py
# ---------------------------------------------------------------------------

def open_dialog() -> None:
    if not mw.col:
        showWarning("Please open an Anki profile first.", parent=mw)
        return
    dlg = AnkimakerDialog(mw)
    dlg.exec()
