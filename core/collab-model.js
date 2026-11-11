// A shared project's drawings edited live (#3183, phase 3 of #3180): each drawing as a Yjs structure of its own, in the
// project's document (core/collab-doc.js), so that several participants edit one drawing at once and their changes merge
// per object and per field (a Y.Text of its JSON would merge characters, and break it).
//   drawings  Y.Map  path -> Y.Map   kind      the drawing's kind ('fsm', 'tt', 'asm')
//                                    settings  Y.Map  key -> value: the drawing's own settings (its name, language,
//                                                     generatedFile, encoding, inputs, outputs, initial state, …)
//                                    <coll>    Y.Map  id -> Y.Map  field -> value, one per object of each of its
//                                                     collections (the FSM: states, transitions; the truth table: its
//                                                     outputs, by name, a field per cell of its column; the ASM chart:
//                                                     boxes, links); _o its place
// A value is JSON (a field's whole value: last write wins, per field). An editor keeps its "model in, model out"
// interface: putDrawing applies a new model as the smallest set of changes (a diff by ids against `base`, the model the
// editor last had: what others changed since is kept), drawingModel reads it back (normalized, as the editor's).
//   drawingKind(path)                                   the kind of a drawing edited live (null: not one)
//   putDrawing(doc, path, model, { base, client })      -> { renamed: Map(old id -> new id) }
//   drawingModel(doc, path)                             -> { model, dropped: [{ coll, id }] } | null
//   pruneDrawing(doc, path)                             the connections whose ends are gone, deleted
//   syncDrawings(doc, files, bases)                     the project's drawings from their files (the owner's)
//   syncDrawing(doc, path, text, bases)                 one of them
//   revertDrawing(doc, path, bases)                     one made its file's again (a participant's change refused)
//   drawingPathsOf(tr)                                  the drawings a transaction changed
import * as Y from 'yjs';
import { normalizeFsm } from './fsm.js';
import { normalizeTable } from './logic.js';
import { normalizeModel as normalizeAsm } from './asm.js';
import { drawingKind, liveDrawing } from './collab-kinds.js';
export { drawingKind, liveDrawing };

// the truth table's shape (#3183): its outputs a collection keyed by their names (two participants adding one output
// add one), each with a field per cell of its column (c0, c1, …: two changing two cells of one column keep both), its
// typed expression, its form and minimal solutions (core/logic-choice.js); the rest its settings (its inputs, whose
// order makes the rows, a whole value)
function ttShape(m) {
  const { outputs, table, exprs = {}, forms = {}, solutions = {}, ...settings } = normalizeTable(m);
  return {
    ...settings,
    outputs: outputs.map(o => ({
      id: o, ...Object.fromEntries([...table[o]].map((c, r) => [`c${r}`, c])),
      ...(exprs[o] ? { expr: exprs[o] } : {}), ...(forms[o] ? { form: forms[o] } : {}), ...(solutions[o] ? { solution: solutions[o] } : {}),
    })),
  };
}
function ttModel(sh) {
  const { outputs = [], ...settings } = sh;
  const rows = 1 << Math.min(arr(settings.inputs).length, 8);
  const outs = outputs.map(o => ({ ...o, id: String(o.id) }));
  const of = f => Object.fromEntries(outs.filter(o => o[f] != null).map(o => [o.id, o[f]]));
  const doc = {
    ...settings, outputs: outs.map(o => o.id),
    table: Object.fromEntries(outs.map(o => [o.id, Array.from({ length: rows }, (_, r) => String(o[`c${r}`] ?? '0')).join('')])),
    exprs: of('expr'), forms: of('form'), solutions: of('solution'),
  };
  // (its keys in one order on every side, whatever order the structure's settings arrived in: the same file everywhere)
  const keys = [...TT_KEYS.filter(k => k in doc), ...Object.keys(doc).filter(k => !TT_KEYS.includes(k)).sort()];
  return normalizeTable(Object.fromEntries(keys.map(k => [k, doc[k]])));
}
const TT_KEYS = ['version', 'name', 'inputs', 'outputs', 'table', 'exprs', 'notes', 'form', 'lang', 'kmapOrder', 'generatedFile', 'forms', 'solutions'];

/** The structure of the drawings edited live (core/collab-kinds.js), by kind: their collections, the fields of an
 *  object that name another (refs, in a collection or one of several: a connection goes with what it connects, #3183), the settings that do (setRefs),
 *  shape (a model as its settings and collections, normalized) and model (back, as its editor has it); ownIds: a
 *  participant's new objects' ids made its own (ids that are names, a truth table's outputs, are not). */
export const DRAWING_KINDS = Object.freeze({
  fsm: { collections: ['states', 'transitions'], refs: { transitions: { from: 'states', to: 'states' } }, setRefs: { initial: 'states' }, shape: normalizeFsm, model: normalizeFsm, ownIds: true },
  tt: { collections: ['outputs'], refs: {}, setRefs: {}, shape: ttShape, model: ttModel, ownIds: false },
  asm: { collections: ['nodes', 'edges'], refs: { edges: { from: 'nodes', to: 'nodes' } }, setRefs: { initial: 'nodes' }, shape: normalizeAsm, model: normalizeAsm, ownIds: true },
});
/** What a follower takes of a room's drawings (#3361: the owner may be hostile): their objects, all together. */
export const DRAWING_OBJECTS_MAX = 100_000;

const json = v => (v instanceof Y.AbstractType ? v.toJSON() : v);
// (a value's text, its keys sorted: two values the same whatever their keys' order)
const canon = v => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x));
const same = (a, b) => canon(a) === canon(b);
const arr = v => (Array.isArray(v) ? v : []);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

/** The drawing's structure (null: not in the document). */
export function drawingMap(doc, path) {
  const m = doc.getMap('drawings').get(path);
  return m instanceof Y.Map ? m : null;
}
const collMap = (ymap, c) => { const m = ymap.get(c); return m instanceof Y.Map ? m : null; };
const order = cm => [...cm.entries()].filter(([, o]) => o instanceof Y.Map)
  .map(([id, o]) => ({ id, o, k: Number.isFinite(o.get('_o')) ? o.get('_o') : 0 }))
  .sort((a, b) => a.k - b.k || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// the model the structure holds, as it is (no object left out, not normalized)
function rawModel(ymap, K) {
  const out = {};
  const st = ymap.get('settings');
  if (st instanceof Y.Map) for (const [k, v] of st.entries()) if (!K.collections.includes(k)) out[k] = json(v);
  for (const c of K.collections) {
    const cm = collMap(ymap, c);
    out[c] = cm ? order(cm).map(({ id, o }) => {
      const x = { id };
      for (const k of [...o.keys()].sort()) if (k !== '_o' && k !== 'id') x[k] = json(o.get(k));
      return x;
    }) : [];
  }
  return out;
}

// the objects whose connections name an object no longer there (a state deleted by one while another connected it)
function dangling(model, K) {
  const ids = Object.fromEntries(K.collections.map(c => [c, new Set(arr(model[c]).map(o => String(o.id)))]));
  const out = [];
  for (const [c, refs] of Object.entries(K.refs)) {
    for (const o of arr(model[c])) if (Object.entries(refs).some(([f, to]) => ![to].flat().some(t => ids[t].has(String(o[f]))))) out.push({ coll: c, id: String(o.id) });
  }
  return out;
}

/** The drawing's model as its editor has it: { model (normalized), dropped: the connections left out, whose ends are
 *  gone }; null: not in the document. */
export function drawingModel(doc, path) {
  const ymap = drawingMap(doc, path), K = DRAWING_KINDS[drawingKind(path)];
  if (!ymap || !K) return null;
  const raw = rawModel(ymap, K);
  const dropped = dangling(raw, K);
  for (const { coll, id } of dropped) raw[coll] = raw[coll].filter(o => String(o.id) !== id);
  return { model: K.model(raw), dropped };
}

/** The connections whose ends are gone, deleted from the structure (a merge's, said by the caller: nothing is changed
 *  silently); returns them. */
export function pruneDrawing(doc, path, origin = null) {
  const ymap = drawingMap(doc, path), K = DRAWING_KINDS[drawingKind(path)];
  if (!ymap || !K) return [];
  const gone = dangling(rawModel(ymap, K), K);
  if (gone.length) doc.transact(() => { for (const { coll, id } of gone) collMap(ymap, coll)?.delete(id); }, origin);
  return gone;
}

// an object's fields set (those of `next` that differ from `base`'s; a field gone, deleted)
function setFields(om, base, next) {
  for (const k of new Set([...Object.keys(base || {}), ...Object.keys(next)])) {
    if (k === 'id' || k === '_o') continue;
    if (!(k in next) || next[k] === undefined) { if (base && k in base && om.has(k)) om.delete(k); continue; }
    if ((!base || !same(base[k], next[k])) && !(om.has(k) && same(json(om.get(k)), next[k]))) om.set(k, next[k]);
  }
}

/** A new model of the drawing applied to its structure: what changed from `base` (the model this participant last had;
 *  none: the structure's own) is set, field by field, so that what others changed since is kept; an object deleted by
 *  another while this one changed it stays deleted. `client` (a participant's edit): its new objects' ids made its own
 *  (two participants adding "s4" at once keep both), their references with them. Returns { renamed }. */
export function putDrawing(doc, path, model, { base = null, client = null, origin = null } = {}) {
  const kind = drawingKind(path), K = DRAWING_KINDS[kind];
  if (!K) throw new Error(`${path}: not a drawing that is edited live`);
  const drawings = doc.getMap('drawings');
  const next = K.shape(model);
  const renamed = new Map();
  doc.transact(() => {
    let ymap = drawingMap(doc, path);
    if (!ymap || ymap.get('kind') !== kind) {
      ymap = new Y.Map();
      ymap.set('kind', kind);
      ymap.set('settings', new Y.Map());
      for (const c of K.collections) ymap.set(c, new Y.Map());
      drawings.set(path, ymap);
    }
    for (const c of ['settings', ...K.collections]) if (!(ymap.get(c) instanceof Y.Map)) ymap.set(c, new Y.Map());
    const b = base ? K.shape(base) : rawModel(ymap, K);
    // (the new objects' ids: a participant's own, unique in the structure)
    if (client !== null && K.ownIds) {
      const tag = Number(client).toString(36);
      for (const c of K.collections) {
        const had = new Set(arr(b[c]).map(o => String(o.id))), cm = collMap(ymap, c);
        const taken = new Set([...cm.keys(), ...next[c].map(o => String(o.id))]);
        for (const o of next[c]) {
          const id = String(o.id);
          if (had.has(id) || id.endsWith(`~${tag}`) && !cm.has(id)) continue;
          let n = `${id}~${tag}`;
          for (let i = 2; taken.has(n); i++) n = `${id}~${tag}.${i}`;
          taken.add(n);
          renamed.set(id, n);
        }
      }
      if (renamed.size) {
        for (const [c, refs] of Object.entries(K.refs)) for (const o of next[c]) for (const f of Object.keys(refs)) if (renamed.has(String(o[f]))) o[f] = renamed.get(String(o[f]));
        for (const c of K.collections) for (const o of next[c]) if (renamed.has(String(o.id))) o.id = renamed.get(String(o.id));
        for (const f of Object.keys(K.setRefs)) if (renamed.has(String(next[f]))) next[f] = renamed.get(String(next[f]));
      }
    }
    // the settings
    const st = ymap.get('settings');
    const bs = Object.fromEntries(Object.entries(b).filter(([k]) => !K.collections.includes(k)));
    const ns = Object.fromEntries(Object.entries(next).filter(([k]) => !K.collections.includes(k)));
    setFields(st, bs, ns);
    // each collection: the objects added, changed, deleted, and their order
    for (const c of K.collections) {
      const cm = collMap(ymap, c);
      const was = new Map(arr(b[c]).map(o => [String(o.id), o]));
      const now = new Set(next[c].map(o => String(o.id)));
      for (const id of was.keys()) if (!now.has(id) && cm.has(id)) cm.delete(id);
      const fresh = [];
      for (const o of next[c]) {
        const id = String(o.id);
        if (was.has(id)) { const om = cm.get(id); if (om instanceof Y.Map) setFields(om, was.get(id), o); continue; }   // (deleted by another: stays so)
        const had = cm.get(id) instanceof Y.Map;   // (added by another with the same id: the owner's disk's)
        if (!had) cm.set(id, new Y.Map());
        setFields(cm.get(id), had ? rawModel(ymap, K)[c].find(x => x.id === id) || null : null, o);
        fresh.push(id);
      }
      placeOrder(cm, next[c].map(o => String(o.id)).filter(id => cm.get(id) instanceof Y.Map), new Set(fresh));
    }
  }, origin);
  return { renamed };
}

// the objects' order (_o: an object's place): the new ones between their neighbours; all of them numbered again
// only when the order of those already there changed
function placeOrder(cm, ids, fresh) {
  const k = id => cm.get(id).get('_o');
  const old = ids.filter(id => !fresh.has(id) && Number.isFinite(k(id)));
  const sorted = old.slice().sort((a, b) => k(a) - k(b) || (a < b ? -1 : a > b ? 1 : 0));
  const known = new Set(old);
  if (old.some((id, i) => id !== sorted[i]) || ids.some(id => !fresh.has(id) && !known.has(id))) {
    ids.forEach((id, i) => { if (k(id) !== i) cm.get(id).set('_o', i); });
    return;
  }
  for (let i = 0; i < ids.length;) {
    if (!fresh.has(ids[i])) { i++; continue; }
    let j = i;
    while (j < ids.length && fresh.has(ids[j])) j++;
    const lo = i > 0 ? k(ids[i - 1]) : null, hi = j < ids.length ? k(ids[j]) : null;
    for (let n = i; n < j; n++) {
      const step = n - i + 1, count = j - i + 1;
      const v = lo === null && hi === null ? n : lo === null ? hi - (j - n) : hi === null ? lo + step : lo + (hi - lo) * step / count;
      cm.get(ids[n]).set('_o', v);
    }
    i = j;
  }
}

/** A drawing's structure made its file's last text again (bases: syncDrawings'), what a participant changed in it undone
 *  (a change the owner refuses); false: no text to make it from. */
export function revertDrawing(doc, path, bases) {
  let m = null;
  try { m = JSON.parse(bases.get(path) ?? 'null'); } catch { m = null; }
  if (!isObj(m)) return false;
  putDrawing(doc, path, m);
  return true;
}

/** A drawing taken out of the document. */
export function dropDrawing(doc, path) { const d = doc.getMap('drawings'); if (d.has(path)) d.delete(path); }

/** The project's drawings edited live, from their files' texts (the owner's: files, path -> text): each one's change
 *  since `bases` (path -> the text last put, kept up to date) applied to its structure, so that what the participants
 *  changed since stays; a drawing whose text did not change, left as it is; one no longer there, or not edited live,
 *  taken out. A text that is not a drawing's JSON is left out. */
export function syncDrawings(doc, files, bases = new Map()) {
  const drawings = doc.getMap('drawings');
  doc.transact(() => {
    for (const [path, text] of Object.entries(files)) if (liveDrawing(path) && typeof text === 'string') syncDrawing(doc, path, text, bases);
    for (const p of [...drawings.keys()]) if (!liveDrawing(p) || typeof files[p] !== 'string') { drawings.delete(p); bases.delete(p); }
  });
}
/** One drawing's file into its structure, as syncDrawings does. */
export function syncDrawing(doc, path, text, bases) {
  if (!liveDrawing(path)) return;
  if (bases.get(path) === text && drawingMap(doc, path)?.get('kind') === drawingKind(path)) return;
  let model, base = null;
  try { model = JSON.parse(text); } catch { model = null; }
  if (!isObj(model)) { dropDrawing(doc, path); bases.delete(path); return; }
  try { if (bases.has(path) && drawingMap(doc, path)) base = JSON.parse(bases.get(path)); } catch { base = null; }
  putDrawing(doc, path, model, { base: isObj(base) ? base : null });
  bases.set(path, text);
}

/** The paths of the drawings a transaction changed (sorted). */
export function drawingPathsOf(tr) {
  const drawings = tr.doc.getMap('drawings');
  const out = new Set();
  for (const [type, keys] of tr.changed) {
    if (type === drawings) { for (const k of keys) if (k !== null) out.add(k); continue; }
    let t = type;
    while (t?._item && t._item.parent !== drawings) t = t._item.parent;
    if (t?._item?.parent === drawings && t._item.parentSub) out.add(t._item.parentSub);
  }
  return [...out].sort();
}

/** How many objects the document's drawings hold (a follower's limit, DRAWING_OBJECTS_MAX). */
export function drawingObjects(doc) {
  let n = 0;
  for (const d of doc.getMap('drawings').values()) {
    if (!(d instanceof Y.Map)) continue;
    for (const [k, v] of d.entries()) if (k !== 'settings' && v instanceof Y.Map) n += v.size;
  }
  return n;
}
