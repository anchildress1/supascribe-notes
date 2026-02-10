.PHONY: lint format test test-coverage secrets-scan ai-checks build clean dev

dev:
	npm run dev

lint:
	npx eslint .
	npx prettier --check .

format:
	npx prettier --write .
	npx eslint --fix .

test:
	npx vitest run

test-coverage:
	npx vitest run --coverage

secrets-scan:
	npx secretlint "**/*"

ai-checks: lint test-coverage secrets-scan
	@echo "✅ All checks passed"

build:
	npx tsc

clean:
	rm -rf dist coverage
