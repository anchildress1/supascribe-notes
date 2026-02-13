.PHONY: install lint format test test-coverage secrets-scan ai-checks build clean dev

dev:

	npm run dev

install:
	npm install
	npx lefthook install

lint:
	npx eslint .

format:
	npx prettier --write .

test:
	npx vitest run

test-coverage:
	npx vitest run --coverage

secrets-scan:
	npx secretlint "**/*"

ai-checks: format lint test-coverage secrets-scan
	@echo "✅ All checks passed"

build:
	npx tsc

clean:
	rm -rf dist coverage
