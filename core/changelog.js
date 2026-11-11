// Silinx - the changelog (CHANGELOG.md): one "## <version>" section per release, newest first.
// Used by the release workflow (the "What's new" part of a GitHub release) and by the update dialog
// (what changed between the running version and the latest release).
import { compareVersions } from './version.js';

/** Sections of the changelog: [{ version, body }] in file order (newest first). */
export function parseChangelog(md) {
  const out = [];
  let cur = null;
  for (const line of String(md || '').split(/\r?\n/)) {
    const m = /^##\s+v?(\d+\.\d+\.\d+)\b/.exec(line);
    if (m) { cur = { version: m[1], lines: [] }; out.push(cur); continue; }
    if (/^#\s/.test(line)) { cur = null; continue; }
    if (cur) cur.lines.push(line);
  }
  return out.map(s => ({ version: s.version, body: s.lines.join('\n').trim() }));
}

/** The section of one version (null if there is none). */
export function changesOf(md, version) {
  return parseChangelog(md).find(s => s.version === String(version).replace(/^v/, '')) || null;
}

/** The sections newer than `from` and not newer than `to` (newest first): what an update brings. */
export function changesSince(md, from, to) {
  return parseChangelog(md).filter(s => compareVersions(s.version, from) > 0 && (!to || compareVersions(s.version, to) <= 0));
}

/** The GitHub release text of a version: "What's new" (its changelog section), the common part, then the
 *  files' SHA-256 checksums (the SHA256SUMS file's text, #485) and how to check a download, when given. */
export function releaseNotes(md, version, common, sums) {
  const s = changesOf(md, version);
  const head = s ? `## What's new in ${s.version}\n\n${s.body}\n\n` : '';
  const check = sums ? `\n\n## Checking a download\n\nThe files' SHA-256 checksums (the file SHA256SUMS):\n\n\`\`\`\n${String(sums).trim()}\n\`\`\`\n\n`
    + 'In the folder of the downloads: `sha256sum -c SHA256SUMS --ignore-missing` (Linux), '
    + '`shasum -a 256 -c SHA256SUMS --ignore-missing` (macOS), `Get-FileHash <file>` (Windows PowerShell, compared by eye). '
    + 'Each file also has a build provenance attestation (it was built by this repository\'s Release workflow from this tag): '
    + '`gh attestation verify <file> --repo pmnmalo/Silinx`.' : '';
  const notes = `${head}${String(common || '').trim()}${check}\n`;
  return s && bytes(notes) > NOTES_LIMIT ? shortenNotes(notes, s, head, NOTES_LIMIT) : notes;
}

/** A release's notes stay under GitHub's 125,000 characters (#2685), counted in UTF-8 bytes, never fewer. */
export const NOTES_LIMIT = 120000;
const bytes = t => new TextEncoder().encode(t).length;   // (core/ runs in the browser too: no Buffer)

// the section's "In detail" entries (each "- " at a line's start, its continuation indented) kept from the
// newest, the first, until the notes and the line saying how many were left out fit
function shortenNotes(notes, s, head, limit) {
  const rest = notes.slice(head.length), mark = '\nIn detail:\n\n', at = head.lastIndexOf(mark);
  if (at < 0) return notes;
  const top = head.slice(0, at), items = head.slice(at + mark.length).replace(/\n+$/, '').split(/\n(?=- )/);
  const note = n => `${n} more entr${n === 1 ? 'y' : 'ies'} of "In detail" left out (a release's notes hold at most 125,000 characters): ` +
    `the full list is in CHANGELOG.md, https://github.com/pmnmalo/Silinx/blob/v${s.version}/CHANGELOG.md\n\n`;
  for (let keep = items.length - 1; keep > 0; keep--) {
    const t = `${top}${mark}${items.slice(0, keep).join('\n')}\n\n${note(items.length - keep)}${rest}`;
    if (bytes(t) <= limit) return t;
  }
  return `${top.trimEnd()}\n\n${note(items.length)}${rest}`;
}

// ---- changelog fragments (#519): each change adds a file changes/<issue>-<slug>.md instead of editing
// CHANGELOG.md (no merge conflicts between pull requests); a release assembles them into its section
// (scripts/changelog-release.mjs). A fragment is an optional "In short:" list, then the "In detail:" list,
// as in a section of CHANGELOG.md (changes/README.md).

/** A fragment's file name: <issue>-<slug>.md, the slug in lower-case words joined by hyphens. */
export const FRAGMENT_NAME = /^(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

/** A fragment's lists: { short: [item], detail: [item] }, each item a "- " bullet with its continuation
 *  lines (indented); throws an Error saying what is wrong with a malformed one. */
export function parseFragment(text) {
  const lists = { short: null, detail: null };
  let cur = null, blank = false;
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const at = `line ${i + 1}`;
    line = line.replace(/\s+$/, '');
    if (line === 'In short:' || line === 'In detail:') {
      const k = line === 'In short:' ? 'short' : 'detail';
      if (lists[k] || (k === 'short' && lists.detail)) throw new Error(`${at}: "${line}" again, or after "In detail:"`);
      cur = lists[k] = []; blank = false; return;
    }
    if (!line) { blank = true; return; }
    if (!cur) throw new Error(`${at}: text before "In short:" / "In detail:"`);
    if (blank && cur.length) throw new Error(`${at}: a blank line inside a list`);
    blank = false;
    if (/^- \S/.test(line)) cur.push(line);
    else if (/^ {2,}\S/.test(line) && cur.length) cur[cur.length - 1] += `\n${line}`;
    else throw new Error(`${at}: neither a "- " item nor its indented continuation`);
  });
  if (!lists.detail?.length) throw new Error('no "In detail:" item');
  if (lists.short && !lists.short.length) throw new Error('an empty "In short:" list');
  return { short: lists.short || [], detail: lists.detail };
}

/** The problems of a set of fragments ([{ name, text }]), as messages; [] when all are well formed: the
 *  file name, the format, the issue number of the name in the "In detail:" items, no slug twice. */
export function checkFragments(files) {
  const bad = [], slugs = new Map();
  for (const { name, text } of files) {
    const m = FRAGMENT_NAME.exec(name);
    if (!m) { bad.push(`${name}: not named <issue>-<slug>.md (lower case, e.g. 490-generate-and-simulate.md)`); continue; }
    if (slugs.has(m[2])) bad.push(`${name}: the same slug as ${slugs.get(m[2])}`);
    slugs.set(m[2], name);
    let f;
    try { f = parseFragment(text); } catch (e) { bad.push(`${name}: ${e.message}`); continue; }
    if (!new RegExp(`#${m[1]}(?!\\d)`).test(f.detail.join('\n'))) bad.push(`${name}: its "In detail:" items do not name #${m[1]}`);
  }
  return bad;
}

/** The fragments in a release's order: the newest issue first (the highest number), then by file name. */
export function sortFragments(files) {
  const issue = n => parseInt(n, 10) || 0;
  return [...files].sort((a, b) => issue(b.name) - issue(a.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** A section's body with the fragments' items put first in its "In short:" and "In detail:" lists (a list
 *  is created when missing; the text before the lists, an introduction, stays first). */
export function mergeFragments(body, files) {
  const frags = sortFragments(files).map(f => parseFragment(f.text));
  const lines = String(body || '').split(/\r?\n/);
  const s = lines.indexOf('In short:'), d = lines.indexOf('In detail:');
  const marks = [s, d].filter(i => i >= 0);
  const block = i => {
    if (i < 0) return '';
    const next = marks.filter(j => j > i);
    return lines.slice(i + 1, next.length ? Math.min(...next) : lines.length).join('\n').trim();
  };
  const intro = lines.slice(0, marks.length ? Math.min(...marks) : lines.length).join('\n').trim();
  const short = [...frags.flatMap(f => f.short), block(s)].filter(Boolean);
  const detail = [...frags.flatMap(f => f.detail), block(d)].filter(Boolean);
  return [intro, short.length && `In short:\n\n${short.join('\n')}`, detail.length && `In detail:\n\n${detail.join('\n')}`]
    .filter(Boolean).join('\n\n');
}

// ---- a development build's changes (its Development menu): the fragments, each change typed by its issue's label
/** A change's title: its first item's bold label ("**Title (#N):**", its lines joined when it is wrapped), without
 *  the issue numbers (also "(Fixes #N)", "(part of #N)", "(Refs #N)") and the colon; an item with no bold label, its
 *  first line without the bold's **. */
export function changeTitle(item) {
  const m = /^- \*\*([\s\S]+?)\*\*/.exec(String(item));
  const t = m ? m[1].replace(/\s*\n\s*/g, ' ') : String(item).replace(/^- /, '').split('\n')[0].replace(/\*\*/g, '');
  return t.replace(/:$/, '').replace(/\s*\((?:(?:fixes|part of|refs)\s+)?#\d+(?:,\s*#\d+)*(?:,[^)]*)?\)$/i, '').replace(/:$/, '').trim();
}
const itemText = item => String(item).replace(/^- /, '').replace(/\n\s+/g, ' ');
/** The fragments ([{ name, text }]) as the changes of a development build, the newest issue first:
 *  [{ issue, type, title, short: [text], detail: [text] }]; type from the issue's labels ({ number: [label] }):
 *  'bugfix' (bug), 'feature' (enhancement), else 'other'. A malformed fragment is left out. */
export function buildChanges(files, labels = {}) {
  const out = [];
  for (const { name, text } of sortFragments(files)) {
    let f;
    try { f = parseFragment(text); } catch { continue; }
    const issue = parseInt(name, 10) || null, ls = labels[issue] || [];
    const type = ls.includes('bug') ? 'bugfix' : ls.includes('enhancement') ? 'feature' : 'other';
    out.push({ issue, type, title: changeTitle(f.short[0] || f.detail[0]), short: f.short.map(itemText), detail: f.detail.map(itemText) });
  }
  return out;
}

/** CHANGELOG.md with the fragments assembled into the "## <version>" section: a new section at the top,
 *  or, when the version has a section already (written by hand), the fragments' items added to it. */
export function assembleRelease(md, version, files) {
  version = String(version).replace(/^v/, '');
  const lines = String(md).split(/\r?\n/);
  const heading = l => /^##\s+v?(\d+\.\d+\.\d+)\b/.exec(l)?.[1];
  let start = lines.findIndex(l => heading(l) === version), end;
  if (start >= 0) {
    end = lines.findIndex((l, i) => i > start && /^##?\s/.test(l));
    if (end < 0) end = lines.length;
  } else {
    if (!files.length) throw new Error(`no changelog fragments and no "## ${version}" section in CHANGELOG.md: nothing to release`);
    start = end = lines.findIndex(l => heading(l));
    if (start < 0) start = end = lines.length;
    else if (compareVersions(version, heading(lines[start])) <= 0)
      throw new Error(`${version} is not newer than ${heading(lines[start])}, the newest version in CHANGELOG.md`);
  }
  const body = mergeFragments(lines.slice(start + 1, end).join('\n'), files);
  const before = lines.slice(0, start).join('\n').replace(/\s*$/, '\n\n');
  const after = lines.slice(end).join('\n');
  return `${before}## ${version}\n\n${body}\n${after ? `\n${after}` : ''}`;
}
