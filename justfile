# List available commands
default:
    @just --list

# Validate the Mintlify build and check for broken links (as CI does)
[group("dev")]
lint:
    npm run validate
    npm run check-links

# Serve the docs locally with Mintlify
[group("dev")]
run:
    npm run dev

# Build the Mintlify static export into dist/
[group("deploy")]
export:
    npx --yes mint@latest export
    rm -rf dist
    unzip -q export.zip -d dist

# Deploy the docs site to Cloudflare
[group("deploy")]
deploy: export
    npx --yes wrangler@latest deploy --assets dist --name docs-mantis --compatibility-date 2026-05-01
