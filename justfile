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
    npm run build

# Deploy the docs site to Cloudflare
[group("deploy")]
deploy: export
    npx --yes wrangler@latest deploy
