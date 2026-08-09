#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];
const anchorCache = new Map();
const linkedFileCache = new Set();
const navPageCache = new Set();

/** Frontmatter keys a page may declare. Anything else is a warning. */
const ALLOWED_FRONTMATTER_KEYS = new Set(["title", "description", "icon", "sidebarTitle"]);
const REQUIRED_FRONTMATTER_KEYS = ["title", "description"];

/**
 * Tags that are legitimate JSX in an MDX page. Anything else in angle brackets is
 * either a Mintlify component (capitalised, so it passes the case test below) or a
 * stray token that will fail the MDX parse — most often a `<placeholder>` that should
 * have been backticked, or committed tool-call debris like `</content>`.
 */
const KNOWN_HTML_TAGS = new Set([
  "a", "b", "br", "code", "div", "em", "hr", "i", "img", "kbd", "li", "ol", "p",
  "pre", "small", "span", "strong", "sub", "sup", "table", "tbody", "td", "th",
  "thead", "tr", "ul", "details", "summary", "picture", "source", "video",
]);

function relative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/") || ".";
}

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    addError(`${relative(filePath)} could not be parsed as JSON: ${error.message}`);
    return null;
  }
}

function stripCodeFences(source) {
  return source
    .replace(/```[\s\S]*?```/g, (block) => "\n".repeat(block.split("\n").length - 1))
    .replace(/~~~[\s\S]*?~~~/g, (block) => "\n".repeat(block.split("\n").length - 1));
}

function stripInlineCode(source) {
  return source.replace(/`[^`\n]*`/g, (span) => " ".repeat(span.length));
}

function splitTarget(target) {
  const withoutQuery = target.split("?")[0];
  const hashIndex = withoutQuery.indexOf("#");

  if (hashIndex === -1) {
    return { targetPath: withoutQuery, anchor: "" };
  }

  return {
    targetPath: withoutQuery.slice(0, hashIndex),
    anchor: decodeURIComponent(withoutQuery.slice(hashIndex + 1)),
  };
}

function isExternal(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target);
}

function trimMarkdownTarget(target) {
  const trimmed = target.trim();
  const angleWrapped = trimmed.match(/^<([^>]+)>$/);

  if (angleWrapped) {
    return angleWrapped[1];
  }

  return trimmed.split(/\s+/)[0];
}

function slugify(heading) {
  return heading
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/&amp;/g, "and")
    .replace(/&/g, "and")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function collectAnchors(filePath) {
  if (anchorCache.has(filePath)) {
    return anchorCache.get(filePath);
  }

  const source = stripCodeFences(fs.readFileSync(filePath, "utf8"));
  const anchors = new Set();
  const seen = new Map();
  const headingPattern = /^#{1,6}\s+(.+?)\s*#*\s*$/gm;

  for (const match of source.matchAll(headingPattern)) {
    const baseSlug = slugify(match[1]);

    if (!baseSlug) {
      continue;
    }

    const seenCount = seen.get(baseSlug) ?? 0;
    const slug = seenCount === 0 ? baseSlug : `${baseSlug}-${seenCount}`;
    seen.set(baseSlug, seenCount + 1);
    anchors.add(slug);
  }

  anchorCache.set(filePath, anchors);
  return anchors;
}

function resolveFile(targetPath, sourceFile) {
  const base = targetPath.startsWith("/")
    ? path.join(root, targetPath.slice(1))
    : path.resolve(path.dirname(sourceFile), targetPath);

  if (exists(base)) {
    return base;
  }

  if (!path.extname(base)) {
    for (const extension of [".mdx", ".md"]) {
      const candidate = `${base}${extension}`;
      if (exists(candidate)) {
        return candidate;
      }
    }
  }

  return base;
}

function isInsideRoot(filePath) {
  const relativePath = path.relative(root, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function checkAssetReference(target, context) {
  if (!target || !target.startsWith("/")) {
    return;
  }

  const { targetPath } = splitTarget(target);
  const filePath = path.join(root, targetPath.slice(1));

  if (!exists(filePath)) {
    addError(`${context} references missing asset ${target}`);
  }
}

function checkPageSlug(slug, context) {
  for (const extension of [".mdx", ".md"]) {
    const filePath = path.join(root, `${slug}${extension}`);

    if (exists(filePath)) {
      linkedFileCache.add(filePath);
      navPageCache.add(filePath);
      return;
    }
  }

  addError(`${context} references missing page ${slug}.mdx`);
}

function checkOpenApiReference(openapiPath, context) {
  const filePath = path.join(root, openapiPath);

  if (!exists(filePath)) {
    addError(`${context} references missing OpenAPI file ${openapiPath}`);
    return;
  }

  const source = fs.readFileSync(filePath, "utf8");
  if (!/^openapi:\s*3\./m.test(source)) {
    addError(`${openapiPath} does not look like an OpenAPI 3.x spec`);
  }
  if (!/^paths:\s*$/m.test(source)) {
    addError(`${openapiPath} is missing a top-level paths section`);
  }
}

function checkNavigationGroups(groups, prefix) {
  for (const [groupIndex, group] of (groups ?? []).entries()) {
    const groupLabel = group.group ?? `group ${groupIndex + 1}`;
    const context = `docs.json navigation ${prefix}${groupLabel}`;

    if (typeof group.root === "string") {
      checkPageSlug(group.root, context);
    }

    for (const page of group.pages ?? []) {
      if (typeof page === "string") {
        checkPageSlug(page, context);
      }
    }

    if (group.openapi) {
      checkOpenApiReference(group.openapi, context);
    }
  }
}

function checkDocsJson() {
  const docsPath = path.join(root, "docs.json");
  const docs = readJson(docsPath);

  if (!docs) {
    return;
  }

  checkAssetReference(docs.favicon, "docs.json favicon");
  checkAssetReference(docs.logo?.light, "docs.json logo.light");
  checkAssetReference(docs.logo?.dark, "docs.json logo.dark");

  checkNavigationGroups(docs.navigation?.groups, "");

  for (const [tabIndex, tab] of (docs.navigation?.tabs ?? []).entries()) {
    const tabLabel = tab.tab ?? `tab ${tabIndex + 1}`;
    checkNavigationGroups(tab.groups, `${tabLabel} > `);
  }
}

function shouldIgnoreLink(target) {
  return (
    !target ||
    target.startsWith("#") ||
    isExternal(target) ||
    target.startsWith("mailto:") ||
    target.startsWith("tel:") ||
    target.includes("{{") ||
    target.includes("<")
  );
}

function checkInternalLink(target, sourceFile, lineNumber) {
  if (shouldIgnoreLink(target)) {
    return;
  }

  const { targetPath, anchor } = splitTarget(target);
  const targetFile = resolveFile(targetPath || relative(sourceFile), sourceFile);
  const sourceLabel = `${relative(sourceFile)}:${lineNumber}`;

  if (!isInsideRoot(targetFile)) {
    addError(`${sourceLabel} points outside the docs root: ${target}`);
    return;
  }

  if (!exists(targetFile)) {
    addError(`${sourceLabel} points to missing file or page: ${target}`);
    return;
  }

  linkedFileCache.add(targetFile);

  if (anchor && [".md", ".mdx"].includes(path.extname(targetFile))) {
    const anchors = collectAnchors(targetFile);
    if (!anchors.has(anchor)) {
      addError(`${sourceLabel} points to missing anchor #${anchor} in ${relative(targetFile)}`);
    }
  }
}

function lineNumberForIndex(source, index) {
  return source.slice(0, index).split("\n").length;
}

/**
 * Every .mdx page must open with a frontmatter block declaring exactly the keys
 * CONTRIBUTING.md promises. Mintlify renders `title` as the H1 and `description` as the
 * sidebar tooltip and SEO description, so a page missing either ships broken.
 */
function checkFrontmatter(filePath, source) {
  if (path.extname(filePath) !== ".mdx") {
    return;
  }

  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!match) {
    addError(`${relative(filePath)} has no frontmatter block`);
    return;
  }

  const keys = new Set();

  for (const line of match[1].split("\n")) {
    const keyMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*):/);
    if (keyMatch) {
      keys.add(keyMatch[1]);
    }
  }

  for (const required of REQUIRED_FRONTMATTER_KEYS) {
    if (!keys.has(required)) {
      addError(`${relative(filePath)} frontmatter is missing "${required}"`);
    }
  }

  for (const key of keys) {
    if (!ALLOWED_FRONTMATTER_KEYS.has(key)) {
      addWarning(`${relative(filePath)} frontmatter has unexpected key "${key}"`);
    }
  }
}

/**
 * MDX parses anything in angle brackets as JSX. A lowercase tag that isn't valid HTML is
 * either an unbackticked placeholder (`<prefix>`, `<rg>`) or committed tool-call debris
 * (`</content>`) — both fail the Mintlify build with an unhelpful parse error, so catch
 * them here where the message can name the file and line.
 */
function checkStrayJsx(filePath, searchable) {
  // Only .mdx is parsed as MDX. Plain .md files here (README, CONTRIBUTING, SPEC) are
  // rendered by GitHub, where angle brackets are harmless.
  if (path.extname(filePath) !== ".mdx") {
    return;
  }

  const withoutInlineCode = stripInlineCode(searchable);
  const tagPattern = /<\/?([A-Za-z][A-Za-z0-9._-]*)(\s[^<>]*)?\/?>/g;

  for (const match of withoutInlineCode.matchAll(tagPattern)) {
    const tag = match[1];

    // Capitalised tags are Mintlify/React components — assume they are intentional.
    if (tag[0] === tag[0].toUpperCase() && tag[0] !== tag[0].toLowerCase()) {
      continue;
    }

    if (KNOWN_HTML_TAGS.has(tag.toLowerCase())) {
      continue;
    }

    const line = lineNumberForIndex(withoutInlineCode, match.index ?? 0);
    addError(
      `${relative(filePath)}:${line} has stray JSX "${match[0]}" — backtick the placeholder or delete the tag`,
    );
  }
}

function checkContentFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const searchable = stripCodeFences(source);
  // Inline code spans hold syntax examples (`![](URL)`, `<img src="...">`), not links.
  // stripInlineCode replaces them with equal-length whitespace, so line numbers hold.
  const linkable = stripInlineCode(searchable);
  const markdownLinkPattern = /!?\[[^\]]*?\]\(([^)]+)\)/g;
  const jsxAttributePattern = /\b(?:href|src)=["']([^"']+)["']/g;

  checkFrontmatter(filePath, source);
  checkStrayJsx(filePath, searchable);

  for (const match of linkable.matchAll(markdownLinkPattern)) {
    const target = trimMarkdownTarget(match[1]);
    checkInternalLink(target, filePath, lineNumberForIndex(linkable, match.index ?? 0));
  }

  for (const match of linkable.matchAll(jsxAttributePattern)) {
    checkInternalLink(match[1], filePath, lineNumberForIndex(linkable, match.index ?? 0));
  }
}

function walkFiles(directory, predicate, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", ".mintlify", "node_modules"].includes(entry.name)) {
      continue;
    }

    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(filePath, predicate, files);
    } else if (predicate(filePath)) {
      files.push(filePath);
    }
  }

  return files;
}

function checkHiddenPages() {
  const contentPages = walkFiles(root, (filePath) => filePath.endsWith(".mdx"));

  for (const page of contentPages) {
    if (relative(page).startsWith("snippets/")) {
      continue;
    }

    if (!navPageCache.has(page)) {
      addWarning(`${relative(page)} is not listed in docs.json navigation`);
    }
  }
}

checkDocsJson();

for (const filePath of walkFiles(root, (candidate) => [".md", ".mdx"].includes(path.extname(candidate)))) {
  checkContentFile(filePath);
}

checkHiddenPages();

for (const warning of warnings) {
  console.warn(`warning: ${warning}`);
}

if (errors.length > 0) {
  console.error("Docs check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Docs check passed (${linkedFileCache.size} linked files checked).`);
