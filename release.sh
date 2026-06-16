#!/usr/bin/env sh
# Fly release_command — runs in a temporary VM (with secrets) before each new version
# goes live. Applies migrations then seeds game data; seed_games is idempotent.
# `set -e` so any failure aborts the deploy instead of cutting over a broken release.
set -e
python manage.py migrate --noinput
python manage.py seed_games
