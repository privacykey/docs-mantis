#!/usr/bin/env node

/**
 * Regenerate changelog.mdx from the product repo's GitHub Releases.
 *
 * Mantis has no releases.json — its release manifest IS GitHub Releases on
 * privacykey/mantis, the same feed /updating tells operators to watch: `cli-v*` tags
 * publish CLI binaries and plain `v*` tags publish server releases. The tag prefix
 * becomes a component label, the published date becomes the entry's date line, and the
 * first prose paragraph of the release body becomes the summary.
 *
 * Usage:
 *   node scripts/sync-changelog.mjs              # fetch from the GitHub API
 *   MANIFEST_URL=... node scripts/sync-changelog.mjs
 *   MANIFEST_FILE=releases.json node scripts/sync-changelog.mjs
 *
 * GITHUB_TOKEN (or GH_TOKEN), when set, is sent as a bearer token — the workflow passes
 * its built-in token so runner-IP rate limits never bite. Unauthenticated works locally.
 *
 * Writes changelog.mdx and exits 0 whether or not anything changed. The workflow diffs
 * the working tree afterwards and opens a PR only when the file actually moved.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(root, "changelog.mdx");

const MANIFEST_URL =
  process.env.MANIFEST_URL ??
  "https://api.github.com/repos/privacykey/mantis/releases?per_page=100";
const MANIFEST_FILE = process.env.MANIFEST_FILE ?? "";
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

const RELEASES_PAGE = "https://github.com/privacykey/mantis/releases";

/** Tag prefix → the component label rendered in the entry heading. */
const COMPONENT_LABELS = {
  cli: "CLI",
  edge: "Edge worker",
  "iot-helper": "IoT helper",
};

function fail(message) {
  console.error(`sync-changelog: ${message}`);
  process.exit(1);
}

async function loadManifest() {
  if (MANIFEST_FILE) {
    const filePath = path.resolve(root, MANIFEST_FILE);
    if (!fs.existsSync(filePath)) {
      fail(`MANIFEST_FILE not found: ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }

  const headers = { accept: "application/vnd.github+json" };
  if (TOKEN) {
    headers.authorization = `Bearer ${TOKEN}`;
  }

  const response = await fetch(MANIFEST_URL, { headers });

  if (!response.ok) {
    fail(`could not fetch ${MANIFEST_URL} (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * `cli-v0.1.6` → { component: "CLI", version: "0.1.6" }; `v0.2.0` → Server.
 * Unrecognised prefixes pass through with their first letter capitalised.
 */
function parseTag(tagName) {
  const tag = String(tagName ?? "");
  const prefixed = tag.match(/^([a-z][a-z0-9-]*)-v(.+)$/);

  if (prefixed) {
    const [, prefix, version] = prefixed;
    const component =
      COMPONENT_LABELS[prefix] ?? prefix.charAt(0).toUpperCase() + prefix.slice(1);
    return { component, version };
  }

  const plain = tag.match(/^v(.+)$/);
  if (plain) {
    return { component: "Server", version: plain[1] };
  }

  return { component: "", version: tag };
}

/** Newest first, by published date; created date and tag break ties. */
function comparePublishedDesc(a, b) {
  const left = Date.parse(a.published_at ?? a.created_at ?? "") || 0;
  const right = Date.parse(b.published_at ?? b.created_at ?? "") || 0;

  if (left !== right) {
    return right - left;
  }

  return String(b.tag_name ?? "").localeCompare(String(a.tag_name ?? ""));
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * First prose paragraph of the release body — skip headings, code fences, lists,
 * tables and block HTML, and collapse the paragraph's line wraps to spaces.
 */
function summarise(body) {
  const blocks = String(body ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/);

  for (const block of blocks) {
    const trimmed = block.trim();

    if (!trimmed || /^(#|`{3}|~{3}|<|[-*+] |\d+\. |\|)/.test(trimmed)) {
      continue;
    }

    return trimmed.replace(/\s*\n\s*/g, " ");
  }

  return "";
}

function renderRelease(release) {
  const { component, version } = parseTag(release.tag_name);
  const heading = component ? `## ${component} v${version}` : `## ${version}`;
  const lines = [heading, ""];

  const meta = [
    formatDate(release.published_at ?? release.created_at),
    release.prerelease ? "`Pre-release`" : "",
  ].filter(Boolean);
  if (meta.length > 0) {
    lines.push(meta.join(" · "), "");
  }

  const summary = summarise(release.body);
  if (summary) {
    lines.push(summary, "");
  }

  if (release.html_url) {
    lines.push(`[Full release notes →](${release.html_url})`, "");
  }

  return lines.join("\n");
}

function renderPage(releases) {
  const header = [
    "---",
    "title: Changelog",
    'description: "Published Mantis releases — CLI and server — what changed and where the full notes live."',
    "---",
    "",
    "{/* GENERATED FILE — do not edit by hand. */}",
    "{/* Regenerate with `npm run sync-changelog`; the source is GitHub Releases on privacykey/mantis. */}",
    "",
    "<Note>",
    `  This page mirrors [GitHub Releases](${RELEASES_PAGE}) — \`cli-v*\` tags publish CLI`,
    "  binaries, plain `v*` tags publish server releases. After updating, run `mantis doctor`",
    "  to confirm CLI/server compatibility, and see [Updating](/updating) for the per-component",
    "  update commands.",
    "</Note>",
    "",
  ];

  if (releases.length === 0) {
    header.push(
      "No releases have been published yet.",
      "",
      `Releases will appear here and at [GitHub Releases](${RELEASES_PAGE}).`,
      "",
    );

    return header.join("\n");
  }

  const body = releases.map(renderRelease).join("\n");
  return `${header.join("\n")}${body}`;
}

const manifest = await loadManifest();

if (!Array.isArray(manifest)) {
  fail("manifest is not an array of releases");
}

const releases = manifest
  .filter((release) => release && release.tag_name && !release.draft)
  .sort(comparePublishedDesc);

const page = `${renderPage(releases).trimEnd()}\n`;
const previous = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf8") : "";

fs.writeFileSync(OUTPUT, page, "utf8");

if (previous === page) {
  console.log(`changelog.mdx is already up to date (${releases.length} release(s)).`);
} else {
  console.log(`changelog.mdx regenerated from ${releases.length} release(s).`);
}
