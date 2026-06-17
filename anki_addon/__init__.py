import os
import sys

# Add vendored dependencies (keyring etc.) to path before any other imports
_addon_dir = os.path.dirname(os.path.abspath(__file__))
_vendor_dir = os.path.join(_addon_dir, "vendor")
if os.path.isdir(_vendor_dir) and _vendor_dir not in sys.path:
    sys.path.insert(0, _vendor_dir)

from aqt import gui_hooks, mw
from aqt.qt import QAction

# The package name as loaded by Anki (directory name of the installed add-on)
ADDON_PACKAGE = __name__

_menu_added = False


def _open_dialog():
    from .dialog import open_dialog
    open_dialog()


def _setup_menu():
    global _menu_added
    if _menu_added:
        return
    action = QAction("Ankimaker", mw)
    action.triggered.connect(_open_dialog)
    mw.form.menuTools.addAction(action)
    _menu_added = True


gui_hooks.profile_did_open.append(_setup_menu)
