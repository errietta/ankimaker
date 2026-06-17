UNAME := $(shell uname 2>/dev/null || echo Windows)
ifeq ($(UNAME), Darwin)
    ANKI_ADDONS := $(HOME)/Library/Application Support/Anki2/addons21
else ifeq ($(UNAME), Windows)
    ANKI_ADDONS := $(APPDATA)/Anki2/addons21
else
    ANKI_ADDONS := $(HOME)/.local/share/Anki2/addons21
endif

ADDON_NAME := ankimaker

.PHONY: deps build install clean

deps:
	pip install -r requirements.txt --target vendor/

build: deps
	cd .. && zip -r $(ADDON_NAME).ankiaddon anki_addon/ \
	    --exclude "anki_addon/vendor/__pycache__/*" \
	    --exclude "*.pyc" \
	    --exclude "anki_addon/.gitkeep" \
	    --exclude "anki_addon/Makefile" \
	    --exclude "anki_addon/requirements.txt" \
	    --exclude "anki_addon/config.md"

install: deps
	mkdir -p "$(ANKI_ADDONS)"
	ln -sfn "$(abspath .)" "$(ANKI_ADDONS)/$(ADDON_NAME)"

clean:
	rm -rf vendor/ ../$(ADDON_NAME).ankiaddon
