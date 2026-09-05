#!/usr/bin/env node

/**
 * Generates the llms.txt family for this docs site, following https://llmstxt.org:
 *
 *   llms.txt        an index of every page in navigation order, one line each
 *   llms-full.txt   the full text of every page, converted to plain Markdown
 *   <page>.md       the same Markdown, one file per page (build output only)
 *
 * The first two are committed at the repository root so they can be read on GitHub as
 * well as on the published site. `mint export` does not generate any of these, so the
 * build step calls this script to drop them into the export directory alongside the
 * HTML, and `npm run check` calls it with --check so the committed copies cannot drift
 * from the pages they summarise.
 *
 * Usage:
 *   node scripts/build-llms.mjs              rewrite llms.txt and llms-full.txt
 *   node scripts/build-llms.mjs --check      exit 1 if either committed file is stale
 *   node scripts/build-llms.mjs --dist DIR   also write per-page .md files, the two
 *                                            index files, and any OpenAPI spec into DIR
 *
 * Inputs: docs.json (navigation, site name and description, banner, repo links), the
 * frontmatter of each page, and package.json's "homepage" for the site's public URL.
 * Only Node built-ins are used, so this runs with no install.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CALLOUTS = new Set(["Note", "Warning", "Tip", "Info", "Check", "Danger"]);
const PAGE_EXTENSIONS = [".mdx", ".md"];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fail(message) {
  console.error(`build-llms: ${message}`);
  process.exit(1);
}

const docs = readJson(path.join(root, "docs.json"));
const pkg = readJson(path.join(root, "package.json"));

if (typeof pkg.homepage !== "string" || !/^https?:\/\//.test(pkg.homepage)) {
  fail('package.json needs a "homepage" with the site\'s public URL, e.g. "https://docs.example.org"');
}

const site = pkg.homepage.replace(/\/+$/, "");
const siteName = docs.name ?? pkg.name;

const docsRepo =
  typeof pkg.repository === "string"
    ? pkg.repository
    : typeof pkg.repository?.url === "string"
      ? pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "")
      : null;

const productRepo =
  docs.navbar?.primary?.type === "github"
    ? docs.navbar.primary.href
    : (docs.footer?.socials?.github ??
      docs.navigation?.global?.anchors?.find((anchor) => /github\.com/.test(anchor.href ?? ""))?.href ??
      null);

// ---------------------------------------------------------------------------
// Navigation walk
// ---------------------------------------------------------------------------

/**
 * Flattens docs.json navigation into ordered entries of either
 *   { kind: "page", slug, section }   or   { kind: "openapi", file, section }
 * where `section` is the human label path, e.g. ["Guide", "Get started"].
 * Handles tabs, anchors, dropdowns, versions, languages, nested groups, `root`, and
 * `openapi` groups — the shapes Mintlify accepts, whether or not this site uses them.
 */
function walkNavigation(node, section, entries) {
  const containers = [
    ["tabs", "tab"],
    ["anchors", "anchor"],
    ["dropdowns", "dropdown"],
    ["versions", "version"],
    ["languages", "language"],
    ["groups", "group"],
  ];

  for (const [listKey, labelKey] of containers) {
    for (const child of node[listKey] ?? []) {
      const label = child[labelKey];
      walkNavigation(child, label ? [...section, String(label)] : section, entries);
    }
  }

  if (typeof node.root === "string") {
    entries.push({ kind: "page", slug: node.root, section });
  }

  for (const page of node.pages ?? []) {
    if (typeof page === "string") {
      entries.push({ kind: "page", slug: page, section });
    } else if (page && typeof page === "object") {
      walkNavigation(page, page.group ? [...section, String(page.group)] : section, entries);
    }
  }

  if (typeof node.openapi === "string") {
    entries.push({ kind: "openapi", file: node.openapi, section });
  }
}

function resolvePageFile(slug) {
  for (const extension of PAGE_EXTENSIONS) {
    const candidate = path.join(root, `${slug}${extension}`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  fail(`docs.json lists "${slug}" but no ${PAGE_EXTENSIONS.join(" or ")} file exists for it`);
}

/** `index` and `foo/index` are served at `/` and `/foo`, matching Mintlify's routing. */
function pageUrl(slug) {
  if (slug === "index") {
    return `${site}/`;
  }
  return `${site}/${slug.replace(/\/index$/, "")}`;
}

/** Relative path of the page's Markdown twin inside the export, and its public URL. */
function markdownPath(slug) {
  return slug === "index" ? "index.md" : `${slug.replace(/\/index$/, "")}.md`;
}

function markdownUrl(slug) {
  return `${site}/${markdownPath(slug)}`;
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

function unquote(value) {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^"(.*)"$/s) ?? trimmed.match(/^'(.*)'$/s);
  if (!quoted) {
    return trimmed;
  }
  return trimmed.startsWith('"') ? quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\") : quoted[1];
}

function parseFrontmatter(source, filePath) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    fail(`${path.relative(root, filePath)} has no frontmatter block`);
  }

  const fields = {};
  for (const line of match[1].split("\n")) {
    const keyMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (keyMatch) {
      fields[keyMatch[1]] = unquote(keyMatch[2]);
    }
  }

  if (!fields.title) {
    fail(`${path.relative(root, filePath)} frontmatter has no title`);
  }

  return { fields, body: source.slice(match[0].length) };
}

// ---------------------------------------------------------------------------
// MDX → Markdown
// ---------------------------------------------------------------------------

function parseAttributes(attributeSource) {
  const attributes = {};
  const pattern = /([A-Za-z][A-Za-z0-9-]*)=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
  for (const match of attributeSource.matchAll(pattern)) {
    attributes[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  return attributes;
}

function absoluteUrl(target) {
  if (target.startsWith("/") && !target.startsWith("//")) {
    return `${site}${target}`;
  }
  return target;
}

/** Applies `transform` to the parts of a line that are not inline code. */
function outsideInlineCode(line, transform) {
  return line
    .split(/(`+[^`]*`+)/)
    .map((part, index) => (index % 2 === 1 ? part : transform(part)))
    .join("");
}

function transformInline(line) {
  return outsideInlineCode(line, (text) =>
    text
      // <img src="/images/x.png" alt="..." /> → ![...](https://site/images/x.png)
      .replace(/<img\b([^>]*?)\/?>/g, (_, attrs) => {
        const { src = "", alt = "" } = parseAttributes(attrs);
        return src ? `![${alt}](${absoluteUrl(src)})` : "";
      })
      // Markdown links and images with root-relative targets → absolute. Only the
      // `](/…` tail is matched, because the link text may itself hold inline code.
      .replace(/(\]\()(\/[^)\s]*)/g, (_, prefix, target) => `${prefix}${absoluteUrl(target)}`)
      // href="/page" in any remaining HTML → absolute
      .replace(/\bhref="(\/[^"]*)"/g, (_, target) => `href="${absoluteUrl(target)}"`),
  );
}

function stripIndent(line, count) {
  let removed = 0;
  while (removed < count && line[removed] === " ") {
    removed += 1;
  }
  return line.slice(removed);
}

/**
 * Line-oriented conversion. Mintlify components become plain Markdown:
 *   <Note>…</Note>                 blockquote with a bold label (all callouts)
 *   <Steps><Step title>            "**Step n: title**" paragraphs
 *   <Tab title>, <Accordion title> "**title**" paragraphs
 *   <Card title href>              "**[title](href)**" paragraphs
 *   <Frame caption>                the content, then the caption in italics
 *   any other component            removed; its content is kept
 * Component bodies are indented two spaces per level in the source, so each open tag
 * records how much to strip from the lines inside it. Fenced code is passed through
 * untouched apart from that dedent, and inline code is never rewritten.
 */
function mdxToMarkdown(body) {
  const out = [];
  const stack = [];
  let fence = null;

  const totalDedent = () => stack.reduce((sum, frame) => sum + frame.dedent, 0);
  const quotePrefix = () => "> ".repeat(stack.filter((frame) => frame.quote).length);

  // Prose lines: trailing whitespace dropped, and never two blank lines in a row.
  // Code lines (emitCode) are passed through exactly, apart from the dedent.
  const emit = (text) => {
    const prefix = quotePrefix();
    const trimmed = text.trimEnd();
    const rendered = trimmed === "" ? prefix.trimEnd() : `${prefix}${trimmed}`;
    if (trimmed === "" && (out.length === 0 || out[out.length - 1] === rendered)) {
      return;
    }
    out.push(rendered);
  };

  const emitCode = (text) => {
    const prefix = quotePrefix();
    out.push(text === "" ? prefix.trimEnd() : `${prefix}${text}`);
  };

  const emitBlank = () => emit("");

  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = stripIndent(raw, totalDedent());

    if (fence) {
      emitCode(line);
      if (line.trimStart().startsWith(fence)) {
        fence = null;
      }
      continue;
    }

    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      fence = fenceMatch[1];
      emit(line);
      continue;
    }

    if (/^\s*\{\/\*.*\*\/\}\s*$/.test(line)) {
      continue;
    }

    const closing = line.match(/^\s*<\/([A-Z][A-Za-z0-9]*)>\s*$/);
    if (closing) {
      const frame = stack.pop();
      if (frame?.caption) {
        emitBlank();
        emit(`*${frame.caption}*`);
      }
      emitBlank();
      continue;
    }

    const opening = line.match(/^(\s*)<([A-Z][A-Za-z0-9]*)(\s[^>]*?)?\s*(\/?)>\s*$/);
    if (opening) {
      const [, indent, tag, attributeSource = "", selfClosing] = opening;
      const attributes = parseAttributes(attributeSource);
      const frame = { tag, dedent: indent.length + 2, quote: false, caption: null };

      if (CALLOUTS.has(tag)) {
        emitBlank();
        frame.quote = true;
        stack.push(frame);
        emit(`**${tag}**`);
        emit("");
      } else if (tag === "Steps") {
        frame.steps = 0;
        stack.push(frame);
      } else if (tag === "Step") {
        const steps = [...stack].reverse().find((entry) => entry.tag === "Steps");
        const number = steps ? (steps.steps += 1) : null;
        const title = attributes.title ?? "";
        stack.push(frame);
        emitBlank();
        emit(number ? `**Step ${number}: ${title}**` : `**${title}**`);
        emit("");
      } else if (tag === "Card") {
        const title = attributes.title ?? "";
        const href = attributes.href ? absoluteUrl(attributes.href) : null;
        stack.push(frame);
        emitBlank();
        if (title) {
          emit(href ? `**[${title}](${href})**` : `**${title}**`);
          emit("");
        }
      } else if (attributes.title) {
        // Tab, Accordion, and anything else that carries a title
        stack.push(frame);
        emitBlank();
        emit(`**${attributes.title}**`);
        emit("");
      } else {
        frame.caption = attributes.caption ?? null;
        stack.push(frame);
      }

      if (selfClosing) {
        stack.pop();
        emitBlank();
      }
      continue;
    }

    emit(transformInline(line));
  }

  return out.join("\n").trim();
}

// ---------------------------------------------------------------------------
// OpenAPI (a deliberately small reader — enough for a method/path/summary table)
// ---------------------------------------------------------------------------

function readOpenApi(file) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) {
    fail(`docs.json references missing OpenAPI file ${file}`);
  }

  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const info = { title: "API", version: "", description: "" };
  const operations = [];
  let currentPath = null;
  let current = null;
  let inInfo = false;
  let descriptionIndent = null;

  for (const line of lines) {
    if (descriptionIndent !== null) {
      if (line.trim() === "" || line.startsWith(" ".repeat(descriptionIndent))) {
        info.description += `${line.slice(descriptionIndent)}\n`;
        continue;
      }
      descriptionIndent = null;
    }

    if (/^info:\s*$/.test(line)) {
      inInfo = true;
      continue;
    }
    if (/^[A-Za-z]/.test(line)) {
      inInfo = false;
    }

    if (inInfo) {
      const titleMatch = line.match(/^  title:\s*(.+)$/);
      const versionMatch = line.match(/^  version:\s*(.+)$/);
      if (titleMatch) info.title = unquote(titleMatch[1]);
      if (versionMatch) info.version = unquote(versionMatch[1]);
      if (/^  description:\s*[|>]-?\s*$/.test(line)) {
        descriptionIndent = 4;
      }
      continue;
    }

    const pathMatch = line.match(/^  (\/\S*):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      current = null;
      continue;
    }

    const methodMatch = line.match(/^    (get|put|post|delete|options|head|patch|trace):\s*$/);
    if (methodMatch && currentPath) {
      current = { method: methodMatch[1].toUpperCase(), path: currentPath, summary: "" };
      operations.push(current);
      continue;
    }

    const summaryMatch = line.match(/^      summary:\s*(.+)$/);
    if (summaryMatch && current && !current.summary) {
      current.summary = unquote(summaryMatch[1]);
    }
  }

  info.description = info.description.trim();
  return { file, info, operations };
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

const entries = [];
walkNavigation(docs.navigation ?? {}, [], entries);

if (entries.length === 0) {
  fail("docs.json navigation produced no pages");
}

const pages = [];
for (const entry of entries) {
  if (entry.kind === "page") {
    const file = resolvePageFile(entry.slug);
    const { fields, body } = parseFrontmatter(fs.readFileSync(file, "utf8"), file);
    pages.push({
      ...entry,
      file,
      title: fields.title,
      description: fields.description ?? "",
      markdown: mdxToMarkdown(body),
    });
  } else {
    pages.push({ ...entry, ...readOpenApi(entry.file) });
  }
}

function sectionLabel(section) {
  return section.length > 0 ? section.join(" / ") : "Pages";
}

function pageDocument(page) {
  const description = page.description ? `\n${page.description}\n` : "";
  return `# ${page.title}\nSource: ${pageUrl(page.slug)}\n${description}\n${page.markdown}\n`;
}

function openApiDocument(page) {
  const { info, operations, file } = page;
  const heading = info.version ? `${info.title} (version ${info.version})` : info.title;
  const table =
    operations.length > 0
      ? [
          "| Method | Path | Summary |",
          "|---|---|---|",
          ...operations.map((op) => `| ${op.method} | \`${op.path}\` | ${op.summary} |`),
        ].join("\n")
      : "";
  const description = info.description ? `\n${transformInline(info.description)}\n` : "";
  return `# ${heading}\nSource: ${site}/${file}\n${description}\nThe complete OpenAPI document is at ${site}/${file}. Operations it defines:\n\n${table}\n`;
}

function buildLlmsTxt() {
  const lines = [`# ${siteName} documentation`, ""];

  if (docs.description) {
    lines.push(`> ${docs.description}`, "");
  }

  lines.push(
    `This file indexes the ${siteName} documentation site at ${site}. Every page listed below is ` +
      "also served as plain Markdown at the same URL with `.md` appended, and the whole site is " +
      `concatenated into one Markdown file at ${site}/llms-full.txt.`,
    "",
  );

  if (docs.banner?.content) {
    lines.push(`Site notice: ${transformInline(docs.banner.content)}`, "");
  }

  let currentSection = null;
  for (const page of pages) {
    const label = sectionLabel(page.section);
    if (label !== currentSection) {
      if (currentSection !== null) {
        lines.push("");
      }
      lines.push(`## ${label}`, "");
      currentSection = label;
    }

    if (page.kind === "page") {
      const description = page.description ? `: ${page.description}` : "";
      lines.push(`- [${page.title}](${markdownUrl(page.slug)})${description}`);
    } else {
      const count = page.operations.length;
      const summary = count > 0 ? `${count} operations, ` : "";
      lines.push(
        `- [${page.info.title} OpenAPI specification](${site}/${page.file}): ${summary}the HTTP API as an OpenAPI document`,
      );
    }
  }

  const optional = [];
  if (productRepo) {
    optional.push(`- [${siteName} source code](${productRepo}): the product these docs describe`);
  }
  if (docsRepo) {
    optional.push(`- [Documentation source](${docsRepo}): the repository this site is built from`);
  }
  if (optional.length > 0) {
    lines.push("", "## Optional", "", ...optional);
  }

  return `${lines.join("\n")}\n`;
}

function buildLlmsFullTxt() {
  const header = [`# ${siteName} documentation`, ""];
  if (docs.description) {
    header.push(`> ${docs.description}`, "");
  }
  header.push(
    `The full text of every page on ${site}, in navigation order. Each page starts with a ` +
      "level-one heading and a Source line giving its canonical URL.",
    "",
  );
  if (docs.banner?.content) {
    header.push(`Site notice: ${transformInline(docs.banner.content)}`, "");
  }

  const sections = pages.map((page) => (page.kind === "page" ? pageDocument(page) : openApiDocument(page)));
  return `${header.join("\n")}\n${sections.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Write / check
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const distIndex = args.indexOf("--dist");
const dist = distIndex === -1 ? null : args[distIndex + 1];

if (distIndex !== -1 && !dist) {
  fail("--dist needs a directory argument");
}

const outputs = new Map([
  ["llms.txt", buildLlmsTxt()],
  ["llms-full.txt", buildLlmsFullTxt()],
]);

if (checkOnly) {
  const stale = [];
  for (const [name, content] of outputs) {
    const filePath = path.join(root, name);
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, "utf8") !== content) {
      stale.push(name);
    }
  }
  if (stale.length > 0) {
    console.error(`llms check failed: ${stale.join(" and ")} out of date — run \`npm run llms\` and commit the result.`);
    process.exit(1);
  }
  console.log(`llms check passed (${pages.length} entries).`);
  process.exit(0);
}

for (const [name, content] of outputs) {
  fs.writeFileSync(path.join(root, name), content);
}
console.log(`Wrote llms.txt and llms-full.txt (${pages.length} entries).`);

if (dist) {
  const distRoot = path.resolve(root, dist);
  if (!fs.existsSync(distRoot)) {
    fail(`${dist} does not exist — run the export first`);
  }

  let written = 0;
  for (const [name, content] of outputs) {
    fs.writeFileSync(path.join(distRoot, name), content);
    written += 1;
  }

  for (const page of pages) {
    if (page.kind === "page") {
      const target = path.join(distRoot, markdownPath(page.slug));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, pageDocument(page));
    } else {
      const target = path.join(distRoot, page.file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, page.file), target);
    }
    written += 1;
  }

  console.log(`Wrote ${written} files into ${path.relative(root, distRoot) || "."}/.`);
}
