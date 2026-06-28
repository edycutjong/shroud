# Convenience Makefile targets for Shroud project

.PHONY: help e2e lighthouse security-scan build dev clean ci

help:
	@echo "Shroud Makefile Convenience Targets:"
	@echo "  make dev             - Run local development server"
	@echo "  make build           - Build Next.js application"
	@echo "  make e2e             - Run Playwright end-to-end tests (demo mode)"
	@echo "  make lighthouse      - Run Lighthouse CI audit locally"
	@echo "  make security-scan   - Run dependency audit and license checks"
	@echo "  make ci              - Run all CI checks (lint, typecheck, coverage, contracts)"
	@echo "  make clean           - Clear build artifacts"

dev:
	npm run dev

build:
	npm run build

e2e:
	@echo "🎭 Running Playwright E2E tests (demo mode)..."
	npm run e2e

lighthouse:
	@echo "🔦 Running Lighthouse CI audit..."
	npm run lighthouse

security-scan:
	@echo "=== NPM AUDIT ==="
	npm run audit || true
	@echo ""
	@echo "=== LICENSE CHECK ==="
	npx license-checker --production --failOn "GPL-3.0;AGPL-3.0" --summary || true

ci:
	@echo "🧹 Running code quality and audit checks..."
	npm run ci
	@echo "🦀 Running Rust contract unit tests..."
	cargo test
	@echo "✅ All CI checks passed!"

clean:
	rm -rf .next out coverage test-results playwright-report .lighthouseci target
