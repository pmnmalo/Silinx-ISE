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

/** The GitHub release text of a version: "What's new" (its changelog section), then the common part. */
export function releaseNotes(md, version, common) {
  const s = changesOf(md, version);
  const head = s ? `## What's new in ${s.version}\n\n${s.body}\n\n` : '';
  return `${head}${String(common || '').trim()}\n`;
}
