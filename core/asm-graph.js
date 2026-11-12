// Silinx ASM charts - the chart's graph checked (#405: out of analyze in core/asm.js): its states and initial
// state, the edges' ends, the every-cycle blocks, each node's exits, the blocks' trees, the states reachable.
import { blockTrees, buildIndex, describe, normPort, treeNodes, treeParts, walkAlways } from './asm.js';

/** { alwaysNodes, alwaysTrees, idx, trees } of analyze. */
export function mountGraphChecks(ctx) {
  const {
    add, checkName, claim, err, m, warn
  } = ctx;

  // ---- graph --------------------------------------------------------------------------
  const idx = buildIndex(m);
  const seenIds = new Set();
  for (const n of m.nodes) {
    if (seenIds.has(n.id)) err(`Duplicate node id '${n.id}'`, n.id);
    seenIds.add(n.id);
  }
  const states = m.nodes.filter((n) => n.type === 'state');
  if (!states.length) err('The chart has no states');
  const stateNames = new Map();
  for (const s of states) {
    if (!checkName(s.name, 'State', s.id, false)) continue;
    const k = s.name.toLowerCase();
    if (stateNames.has(k)) { err(`Duplicate state name '${s.name}'`, s.id); continue; }
    stateNames.set(k, s.id);
    claim(`S_${s.name}`, `State constant`, s.id);
  }
  if (!m.initial) err('No initial (reset) state selected');
  else if (!idx.nodes.has(m.initial) || idx.nodes.get(m.initial).type !== 'state') err(`Initial state '${m.initial}' is not a state of the chart`);

  for (const e of idx.badEdges) {
    const from = idx.nodes.get(e.from);
    if (!from || !idx.nodes.has(e.to)) err(`Edge '${e.id}' refers to a missing node`, from ? from.id : undefined);
    else err(`Edge '${e.id}' uses port '${e.port}' which a ${from.type === 'always' ? 'every-cycle' : from.type} box does not have`, from.id);
  }
  for (const e of idx.dupExits) {
    const from = idx.nodes.get(e.from);
    err(`${describe(from)} has more than one '${normPort(e.port, from.type)}' exit`, from.id);
  }

  // every-cycle blocks
  const alwaysNodes = m.nodes.filter((n) => n.type === 'always');
  const alwaysTrees = new Map();
  const alwaysOf = new Map(); // node id -> [always ids]
  const alwaysNames = new Map();
  for (const a of alwaysNodes) {
    if (checkName(a.name, 'Every-cycle block', a.id, false)) {
      const k = a.name.toLowerCase();
      if (alwaysNames.has(k)) err(`Duplicate every-cycle block name '${a.name}'`, a.id);
      else alwaysNames.set(k, a.id);
    }
    const tree = walkAlways(idx, a);
    alwaysTrees.set(a.id, tree);
    for (const id of treeNodes(tree)) { if (!alwaysOf.has(id)) alwaysOf.set(id, []); alwaysOf.get(id).push(a.id); }
    const reported = new Set();
    for (const t of treeParts(tree)) {   // (each shared subtree once: its leaves' errors are the same, #3554)
      const key = `${t.k}:${t.id}`;
      if (t.k === 'state' && !reported.has(key)) {
        reported.add(key);
        err(`${describe(a)}: a path reaches state '${t.name}' (the paths of an every-cycle block end without a next state: leave the exit unconnected)`, t.from);
      }
      if (t.k === 'loop' && !reported.has(key)) { reported.add(key); err(`${describe(a)}: loop through decision/output boxes (an every-cycle block must not loop)`, t.id); }
      if (t.k === 'badcase' && !reported.has(key)) { reported.add(key); err(`${describe(a)}: case boxes are not supported in every-cycle blocks (use decision boxes)`, t.id); }
    }
  }
  for (const e of m.edges) {
    if (idx.nodes.get(e.to)?.type === 'always' && idx.nodes.has(e.from)) {
      err(`${describe(idx.nodes.get(e.to))} cannot be entered: connections may only leave an every-cycle block`, e.from);
    }
  }

  // exits per node
  for (const n of m.nodes) {
    const ex = idx.exits.get(n.id) || {};
    const inAlways = n.type === 'always' || alwaysOf.has(n.id);
    if (n.type === 'decision') {
      if (inAlways) {
        if (!ex.true && !ex.false) warn(`${describe(n)} has no exits (it has no effect)`, n.id);
      } else if (!ex.true && !ex.false) err(`${describe(n)} has no exits (needs a 1 and a 0 branch)`, n.id);
      else if (!ex.true) err(`${describe(n)} has no 1 (true) branch`, n.id);
      else if (!ex.false) err(`${describe(n)} has no 0 (false) branch`, n.id);
      if (ex.true && ex.false && ex.true.to === ex.false.to) warn(`${describe(n)}: both branches go to the same box (the decision has no effect)`, n.id);
    } else if (n.type === 'case') {
      if (!(idx.cases.get(n.id) || []).length) err(`${describe(n)} has no exits (connect one exit per value, or 'others')`, n.id);
    } else if (!ex.next && !inAlways) {
      err(`${describe(n)} has no exit${n.type === 'state' ? ' (next state path)' : ''}`, n.id);
    }
  }

  const trees = blockTrees(m, idx);
  const inBlock = new Map(); // node id -> [state ids]
  for (const [sid, tree] of trees) {
    for (const id of treeNodes(tree)) { if (!inBlock.has(id)) inBlock.set(id, []); inBlock.get(id).push(sid); }
    const loops = new Set();
    for (const t of treeParts(tree)) {
      if (t.k === 'loop' && !loops.has(t.id)) { loops.add(t.id); err(`Loop through decision/output boxes without a state (in the block of state '${idx.nodes.get(sid).name}')`, t.id); }
    }
  }
  for (const n of m.nodes) {
    if (n.type === 'state' || n.type === 'always') continue;
    const owners = inBlock.get(n.id);
    const aOwners = alwaysOf.get(n.id);
    if (owners && aOwners) {
      err(`${describe(n)} belongs both to the block of state '${idx.nodes.get(owners[0]).name}' and to ${describe(idx.nodes.get(aOwners[0]))}`, n.id);
    } else if (aOwners && aOwners.length > 1) {
      err(`${describe(n)} is shared by the every-cycle blocks ${aOwners.map((id) => `'${idx.nodes.get(id).name}'`).join(', ')}`, n.id);
    } else if (!owners && !aOwners) warn(`${describe(n)} cannot be reached from any state or every-cycle block`, n.id);
    else if (owners && owners.length > 1) {
      add('info', `${describe(n)} is shared by the blocks of ${owners.map((id) => idx.nodes.get(id).name).join(', ')} (logic will be duplicated per state)`, n.id);
    }
  }

  // reachability of states from the initial state
  if (idx.nodes.get(m.initial)?.type === 'state') {
    const seen = new Set([m.initial]);
    const q = [m.initial];
    while (q.length) {
      const s = q.shift();
      for (const t of treeParts(trees.get(s))) if (t.k === 'goto' && !seen.has(t.id)) { seen.add(t.id); q.push(t.id); }
    }
    for (const s of states) if (!seen.has(s.id)) warn(`State '${s.name}' is unreachable from the initial state`, s.id);
  }

  return { alwaysNodes, alwaysTrees, idx, trees };
}
