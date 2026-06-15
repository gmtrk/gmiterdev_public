# gmiterdev — common dev tasks. Run `make` or `make help` for the list.
PY     := .venv/bin/python
PIP    := .venv/bin/pip
MANAGE := $(PY) manage.py

.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

.venv: ## (internal) create the virtualenv with python3.12
	python3.12 -m venv .venv
	$(PY) -m pip install --upgrade pip

install: .venv ## Create venv, install deps, create .env if missing
	$(PIP) install -r requirements-dev.txt
	@test -f .env || (cp .env.example .env && echo "Created .env from .env.example")

setup: install migrate ## One-shot: install + migrate a fresh local DB (then `make run`)

run: ## Run the dev server at http://127.0.0.1:8000
	$(MANAGE) runserver

test: ## Run the test suite
	.venv/bin/pytest

lint: ## Lint with ruff
	.venv/bin/ruff check .

format: ## Auto-format with ruff
	.venv/bin/ruff format .

check: lint test ## Lint + test (run before every PR)

migrate: ## Apply database migrations
	$(MANAGE) migrate

makemigrations: ## Create new migrations
	$(MANAGE) makemigrations

collectstatic: ## Rebuild the staticfiles/ bundle
	$(MANAGE) collectstatic --no-input

shell: ## Open the Django shell
	$(MANAGE) shell

.PHONY: help install setup run test lint format check migrate makemigrations collectstatic shell
