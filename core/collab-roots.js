// What a Yjs update of a shared project changes (#3527): the roots of the document its insertions and its deletions
// reach, read before it is applied. An insertion names its root when it is a root's first child; else its parent (a
// nested type) or its neighbour (origin, right origin) is another item, found in the document or earlier in the update,
// whose root it shares. A deletion reaches the roots of the items it deletes. What it builds on that the document does
// not have (an item, a client's earlier changes) is said too.
import * as Y from 'yjs';

const DEPTH_MAX = 10_000;

// the root's name of an item of the document (undefined: a struct of no type, collected)
function rootOfItem(item) {
  if (!(item instanceof Y.Item)) return undefined;
  let t = item.parent;
  for (let n = 0; t?._item && n < DEPTH_MAX; n++) t = t._item.parent;
  return t && typeof t === 'object' && t.doc && !t._item ? Y.findRootTypeKey(t) : undefined;
}

// the document's struct holding `id` (null: not there)
function storeStruct(doc, id) {
  const structs = doc.store.clients.get(id.client);
  if (!structs || Y.getState(doc.store, id.client) <= id.clock) return null;
  return structs[Y.findIndexSS(structs, id.clock)];
}

/** The roots an update changes in `doc`: { roots (a Set of names), unknown (some of it refers to what the document
 *  does not have yet) }; null when it does not decode. */
export function updateRoots(doc, bytes) {
  let u;
  try { u = Y.decodeUpdate(bytes); } catch { return null; }
  const byClient = new Map();
  for (const s of u.structs) { if (!byClient.has(s.id.client)) byClient.set(s.id.client, []); byClient.get(s.id.client).push(s); }
  const inUpdate = id => (byClient.get(id.client) || []).find(s => s.id.clock <= id.clock && id.clock < s.id.clock + s.length) || null;
  const roots = new Set();
  let unknown = false;
  const UNKNOWN = Symbol('unknown');
  const memo = new Map();
  const resolve = (s, depth = 0) => {
    if (!(s instanceof Y.Item)) return undefined;
    if (typeof s.parent === 'string') return s.parent;
    if (memo.has(s)) return memo.get(s);
    const ref = s.parent ?? s.origin ?? s.rightOrigin;
    let r = UNKNOWN;
    if (ref && depth < DEPTH_MAX) {
      const there = storeStruct(doc, ref);
      if (there) r = rootOfItem(there);
      else { const v = inUpdate(ref); if (v && v !== s) r = resolve(v, depth + 1); }
    }
    memo.set(s, r);
    return r;
  };
  const add = r => { if (r === UNKNOWN) unknown = true; else if (r !== undefined) roots.add(r); };
  for (const s of u.structs) add(resolve(s));
  // (a client's structs past what the document has of it: the update waits for the ones before)
  for (const [client, structs] of byClient) if (structs[0].id.clock > Y.getState(doc.store, client)) unknown = true;
  for (const [client, ranges] of u.ds.clients) {
    const structs = doc.store.clients.get(client) || [];
    const own = byClient.get(client) || [];
    for (const { clock, len } of ranges) {
      if (structs.length && Y.getState(doc.store, client) > clock) {
        for (let i = Y.findIndexSS(structs, clock); i < structs.length && structs[i].id.clock < clock + len; i++) add(rootOfItem(structs[i]));
      }
      for (const s of own) if (s.id.clock < clock + len && clock < s.id.clock + s.length) add(resolve(s));
      if (!structs.length && !own.length) unknown = true;
    }
  }
  return { roots, unknown };
}
