// The drawings' diffs and merges (#3197, phase 3 of #3194): a schematic (.sch.json), an ASM chart (.asm.json), a state
// diagram (.fsm.json), a truth table (.tt.json), a Boolean function (.bool.json) or a Petri net (.pn.json) compared, and
// merged, object by object, never as text. A drawing is a description (its name, clock, reset… : its properties) and
// collections of objects (its arrays of objects: symbols, wires, labels, ports; nodes, edges; states, transitions;
// places, arcs; inputs, outputs, registers…), each object known by its id (or, with none, its name), and maps (a
// Boolean function's table and expressions: an output's column each), each entry known by its name. A diff says what
// was added, removed, moved (only its place changed) or changed; a three-way merge (the base: the last commit both
// sides had) takes what only one side changed and leaves what both changed differently to the user, "mine" or "theirs"
// for each, never mixed. Isomorphic.

/** The drawings' files: their kind by the name. */
export const DRAWING_RE = /\.(sch|asm|fsm|tt|bool|pn)\.json$/i;
export const drawingKind = path => DRAWING_RE.exec(String(path || ''))?.[1].toLowerCase() || null;

// an object's place, not what it is: a change of these only is a move
const GEOMETRY = new Set(['x', 'y', 'points', 'bend', 'rot', 'mirror', 'w', 'h', 'width2', 'labelX', 'labelY', 'labelDx', 'labelDy', 'cx', 'cy', 'route']);

const keyOf = o => (o && typeof o === 'object' && !Array.isArray(o) ? (o.id ?? o.name ?? null) : null);
// a collection: an array of objects each with its key, the keys distinct
const isCollection = v => Array.isArray(v) && v.length > 0 && v.every(o => keyOf(o) !== null) && new Set(v.map(keyOf)).size === v.length;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byKey = arr => new Map((arr || []).map(o => [String(keyOf(o)), o]));
const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v);
// the maps of a set of versions: a property that is a map in every version that has it (its entries merged one by one)
const MAPS = new Set(['table', 'exprs', 'outputsByState']);
function maps(...docs) {
  const names = new Set();
  for (const d of docs) for (const [k, v] of Object.entries(d || {})) if (MAPS.has(k) && isMap(v)) names.add(k);
  return [...names].filter(k => docs.every(d => !d || !(k in d) || isMap(d[k])));
}
const entries = m => new Map(Object.entries(m || {}));

// the collections of a set of versions (an array that is one in any version, or empty in all where it is one)
function collections(...docs) {
  const names = new Set();
  for (const d of docs) for (const [k, v] of Object.entries(d || {})) if (isCollection(v)) names.add(k);
  for (const k of [...names]) if (docs.some(d => d && k in d && !(Array.isArray(d[k]) && (d[k].length === 0 || isCollection(d[k]))))) names.delete(k);
  return [...names];
}

/** What changed from a to b: { added, removed, moved, changed: [{ coll, key, fields? }], props: [name] }. */
export function diffDrawings(a, b) {
  const out = { added: [], removed: [], moved: [], changed: [], props: [] };
  const colls = collections(a, b);
  for (const coll of colls) {
    const A = byKey(a?.[coll]), B = byKey(b?.[coll]);
    for (const [key, o] of B) {
      const p = A.get(key);
      if (!p) { out.added.push({ coll, key }); continue; }
      if (same(p, o)) continue;
      const fields = [...new Set([...Object.keys(p), ...Object.keys(o)])].filter(f => !same(p[f], o[f])).sort();
      (fields.every(f => GEOMETRY.has(f)) ? out.moved : out.changed).push({ coll, key, fields });
    }
    for (const key of A.keys()) if (!B.has(key)) out.removed.push({ coll, key });
  }
  const mapNames = maps(a, b);
  for (const coll of mapNames) {
    const A = entries(a?.[coll]), B = entries(b?.[coll]);
    for (const [key, v] of B) { if (!A.has(key)) out.added.push({ coll, key }); else if (!same(A.get(key), v)) out.changed.push({ coll, key, fields: [] }); }
    for (const key of A.keys()) if (!B.has(key)) out.removed.push({ coll, key });
  }
  for (const k of [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])]) if (!colls.includes(k) && !mapNames.includes(k) && !same(a?.[k], b?.[k])) out.props.push(k);
  out.props.sort();
  return out;
}

/** Whether a diff has nothing. */
export const noDiff = d => !d.added.length && !d.removed.length && !d.moved.length && !d.changed.length && !d.props.length;

/** A conflict's id: 'coll/key' for an object, '.name' for a property. */
export const conflictId = c => (c.coll ? `${c.coll}/${c.key}` : `.${c.prop}`);

/** A three-way merge: { merged, conflicts: [{ coll, key, base, mine, theirs } | { prop, base, mine, theirs }] }; with
 *  choices ({ [conflictId]: 'mine' | 'theirs' }) each conflict takes its side's (an object removed on that side:
 *  removed). A conflict with no choice keeps mine in `merged`. */
export function mergeDrawings(base, mine, theirs, choices = {}) {
  const conflicts = [];
  const pick = (id, b, m, t) => {
    if (same(m, t)) return m;
    if (same(m, b)) return t;
    if (same(t, b)) return m;
    return choices[id] === 'theirs' ? t : m;
  };
  const merged = {};
  const colls = collections(base, mine, theirs), mapNames = maps(base, mine, theirs);
  // the properties, in mine's order, then theirs' new ones
  const props = [...new Set([...Object.keys(mine || {}), ...Object.keys(theirs || {}), ...Object.keys(base || {})])];
  for (const k of props) {
    if (colls.includes(k) || mapNames.includes(k)) { merged[k] = null; continue; }
    const b = base?.[k], m = mine?.[k], t = theirs?.[k];
    if (!same(m, t) && !same(m, b) && !same(t, b)) conflicts.push({ prop: k, base: b, mine: m, theirs: t });
    const v = pick(`.${k}`, b, m, t);
    if (v === undefined) delete merged[k]; else merged[k] = v;
  }
  for (const coll of colls) {
    const B = byKey(base?.[coll]), M = byKey(mine?.[coll]), T = byKey(theirs?.[coll]);
    const keys = [...new Set([...M.keys(), ...T.keys()])];
    const out = [];
    for (const key of keys) {
      const b = B.get(key), m = M.get(key), t = T.get(key);
      if (!same(m, t) && !same(m, b) && !same(t, b)) conflicts.push({ coll, key, base: b ?? null, mine: m ?? null, theirs: t ?? null });
      const v = pick(`${coll}/${key}`, b, m, t);
      if (v !== undefined) out.push(v);
    }
    merged[coll] = out;
  }
  for (const coll of mapNames) {
    const B = entries(base?.[coll]), M = entries(mine?.[coll]), T = entries(theirs?.[coll]);
    const out = {};
    for (const key of new Set([...M.keys(), ...T.keys()])) {
      const b = B.get(key), m = M.get(key), t = T.get(key);
      if (!same(m, t) && !same(m, b) && !same(t, b)) conflicts.push({ coll, key, base: b ?? null, mine: m ?? null, theirs: t ?? null });
      const v = pick(`${coll}/${key}`, b, m, t);
      if (v !== undefined) out[key] = v;
    }
    // (a map one side added, the other has not: as it is)
    merged[coll] = (mine && coll in mine) || (theirs && coll in theirs) ? out : undefined;
  }
  for (const k of Object.keys(merged)) if (merged[k] === null || merged[k] === undefined) delete merged[k];
  return { merged, conflicts };
}

/** The conflicts' resolution, every one chosen: the merged drawing, or an Error naming the conflicts left. */
export function resolveDrawing(base, mine, theirs, choices = {}) {
  const { merged, conflicts } = mergeDrawings(base, mine, theirs, choices);
  const left = conflicts.map(conflictId).filter(id => choices[id] !== 'mine' && choices[id] !== 'theirs');
  if (left.length) throw Object.assign(new Error(`not every conflict is resolved: ${left.join(', ')}`), { status: 400, left });
  return merged;
}

/** The objects a merge leaves pointing at nothing (an edge, a transition, an arc, a wire's pin…): [{ coll, key, field,
 *  to }], so that a resolution that mixes the sides is said before it is saved, as Check Drawing would. */
export function danglingRefs(doc) {
  const ids = new Set();
  for (const v of Object.values(doc || {})) if (isCollection(v)) for (const o of v) if (o.id !== undefined) ids.add(String(o.id));
  const out = [];
  for (const [coll, v] of Object.entries(doc || {})) {
    if (!isCollection(v)) continue;
    for (const o of v) for (const f of ['from', 'to', 'source', 'target', 'place', 'transition']) {
      if (typeof o[f] === 'string' && /^[a-z]+\d+$/i.test(o[f]) && !ids.has(o[f])) out.push({ coll, key: String(keyOf(o)), field: f, to: o[f] });
    }
  }
  if (typeof doc?.initial === 'string' && /^[a-z]+\d+$/i.test(doc.initial) && !ids.has(doc.initial)) out.push({ coll: null, key: 'initial', field: 'initial', to: doc.initial });
  return out;
}
