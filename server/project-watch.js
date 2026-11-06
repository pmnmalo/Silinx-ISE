// The open projects watched (#2843): what another process changes in a project's folder (the MCP server,
// `silinx-ise mcp`, an editor, git) is told to the pages that have it open (GET /api/projects/:p/events), so
// that they show it without opening the project again.
//
// A project is watched while a page listens to it: its files are looked at every `interval` ms (their size and
// time; a poll, the same on every system, where fs.watch is not), the build's outputs aside but its summary
// (build/reports.json) and the processes' marks (build/silinx-status.json). The changes this server makes itself
// (the page's own requests, its runs) are not told: while one of them runs the project is held, and once it ends
// what it changed is taken as known, silently.
import fs from 'node:fs/promises';
import path from 'node:path';

/** The build's files told: the Design Summary of the last run, the processes' marks the page saved. */
export const BUILD_WATCHED = ['build/reports.json', 'build/silinx-status.json'];

// the project's files as the Files page lists them (server/projects.js's walk, hidden files and build/ aside),
// with the build's files above: rel -> 'size:mtime'
async function scan(dir) {
  const out = new Map();
  const walk = async base => {
    let ents;
    try { ents = await fs.readdir(path.join(dir, base), { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      if (ent.name.startsWith('.') || (base === '' && ent.name === 'build')) continue;
      const rel = base ? `${base}/${ent.name}` : ent.name;
      if (ent.isDirectory()) await walk(rel);
      else if (ent.isFile()) await stamp(rel);
    }
  };
  const stamp = async rel => {
    const st = await fs.stat(path.join(dir, rel)).catch(() => null);
    if (st?.isFile()) out.set(rel, `${st.size}:${st.mtimeMs}`);
  };
  await walk('');
  for (const rel of BUILD_WATCHED) await stamp(rel);
  return out;
}

/** What changed between two scans: [{ path, kind: 'created' | 'changed' | 'deleted' }], by path. */
export function diffScans(before, after) {
  const out = [];
  for (const [rel, sig] of after) {
    if (!before.has(rel)) out.push({ path: rel, kind: 'created' });
    else if (before.get(rel) !== sig) out.push({ path: rel, kind: 'changed' });
  }
  for (const rel of before.keys()) if (!after.has(rel)) out.push({ path: rel, kind: 'deleted' });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * A watcher of the projects: dirOf(name) is a project's folder; busy(name), whether this server runs something
 * in it now (a run: its changes are its own).
 *   subscribe(name, onChange) -> unsubscribe; onChange({ project, changes })
 *   hold(name) -> release: the changes made until release() are this server's own (not told)
 */
export function createProjectWatcher({ dirOf, busy = () => false, interval = 500, scanDir = scan } = {}) {
  const watched = new Map();   // key -> { name, dir, listeners, snap, holds, timer, inflight, next, wasBusy, resync, releases, ready }
  const keyOf = name => String(name).toLowerCase();   // (case-insensitive file systems: one folder)

  // one look at a time; asked while one runs (a release, a check): another one after it (the timer's: skipped)
  function poll(w, { after = true } = {}) {
    if (w.inflight) return after ? (w.next ||= w.inflight.then(() => { w.next = null; return poll(w); })) : w.inflight;
    w.inflight = look(w).finally(() => { w.inflight = null; });
    return w.inflight;
  }
  async function look(w) {
    await w.ready;
    const heldBefore = w.holds > 0 || busy(w.name), releases = w.releases;
    const now = await scanDir(w.dir);
    const held = heldBefore || w.holds > 0 || busy(w.name);   // (held during the scan: its files may be our own)
    // held, or just released by a run: what changed is known, not told; released during the scan, the scan may have
    // read the folder before the request's writes: the next look too (#2913)
    if (held || w.wasBusy || w.resync) { w.snap = now; w.wasBusy = held && busy(w.name); w.resync = w.releases !== releases; return; }
    const changes = diffScans(w.snap, now);
    w.snap = now;
    if (changes.length) for (const fn of [...w.listeners]) { try { fn({ project: w.name, changes }); } catch { /* a listener's own error */ } }
  }

  function subscribe(name, onChange) {
    const key = keyOf(name);
    let w = watched.get(key);
    if (!w) {
      w = { name, dir: dirOf(name), listeners: new Set(), snap: new Map(), holds: 0, inflight: null, next: null, wasBusy: false, resync: false, releases: 0 };
      w.ready = scanDir(w.dir).then(s => { w.snap = s; });
      w.timer = setInterval(() => { poll(w, { after: false }).catch(() => {}); }, interval);
      w.timer.unref?.();
      watched.set(key, w);
    }
    w.listeners.add(onChange);
    return () => {
      w.listeners.delete(onChange);
      if (!w.listeners.size && watched.get(key) === w) { clearInterval(w.timer); watched.delete(key); }
    };
  }

  function hold(name) {
    const w = watched.get(keyOf(name));
    if (!w) return () => {};
    w.holds++;
    let done = false;
    return () => { if (done) return; done = true; w.holds--; w.resync = true; w.releases++; poll(w).catch(() => {}); };
  }

  /** Looks at the project now (the tests; a page told sooner). */
  const check = name => { const w = watched.get(keyOf(name)); return w ? poll(w) : Promise.resolve(); };
  const close = () => { for (const w of watched.values()) clearInterval(w.timer); watched.clear(); };
  return { subscribe, hold, check, close, watching: name => watched.has(keyOf(name)) };
}
