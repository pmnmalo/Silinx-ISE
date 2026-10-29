// Silinx - a design's use of the device's resources against what the device has (#795, #796; part of #787):
// the resources a design's cells or primitives use (core/resources.js: each UNISIM primitive's resource) and
// the ones it needs more of than the part has, with the message that names them ("14 block RAMs needed, the
// XC3S100E has 4"). Read by the Silinx toolchain's synthesis and MAP (core/open-flow-core.js) and by the
// check of a change of the target device (#796).
//
// Isomorphic ES module (browser + Node), no DOM.
//
// API:
//   usedOfPrimitives(family, counts)  the resources the primitives use: { TYPE: n } -> { resourceId: n }
//   overResources(resources, used)    the resources used over their count: [{ id, used, count, noun, report }]
//   overMessage(over, device)         one of them as a message: '14 block RAMs needed, the XC3S100E has 4'
//   resourceNoun(id)                  a resource's name in a message ('block RAMs')
//   primitiveEquivalent(family, name) a primitive a family lacks: its equivalent there ('DSP48A1'; null: none)
//   primitiveInstances(top)           the primitive instances of an elaborated design: [{ module, primitive }]
//   usedOfReport(report, resources)   the resources a report gives as used: { resourceId: n }
//   deviceChangeIssues({ from, to, … }) a change of the target device checked: the primitives, the resources, the messages
import { resourceOfPrimitive, resourcesOf, RESOURCE_FAMILIES } from './resources.js';

// a resource's name in a message, plural (English; the console's messages are ISE's language)
const NOUNS = {
  ffs: 'flip-flops', luts: 'LUTs', slices: 'slices', distRam: 'bits of distributed RAM', iob: 'I/O pads',
  ramb16: 'block RAMs', ramb16bwer: 'block RAMs', ramb8bwer: 'block RAM halves (RAMB8BWER)', mult18x18: 'multipliers', dsp48a1: 'DSP slices',
  bufgmux: 'global clock buffers', bufio2: 'I/O clock buffers', bufh: 'horizontal clock buffers', dcm: 'DCMs', pll: 'PLLs', mcb: 'memory controllers',
};

/** A resource's name in a message, plural ('block RAMs'); an id not known here, itself. */
export const resourceNoun = id => NOUNS[id] || id;

/** The resources the primitives of a family use: counts { TYPE: n } (a netlist's cells by type, a design's
 *  instances by primitive name, any case) -> { resourceId: n }; a primitive of no counted resource left out. */
export function usedOfPrimitives(family, counts) {
  const used = {};
  for (const [type, n] of Object.entries(counts || {})) {
    const id = resourceOfPrimitive(family, type);
    if (id && n > 0) used[id] = (used[id] || 0) + n;
  }
  return used;
}

/**
 * The resources a design uses more of than the part has: resources, core/resources.js resourcesOf(part, pkg)
 * (or the same entries with counts of the device's own, the MAP's sites); used, { resourceId: n }. A resource
 * of unknown count (null) is not checked. A resource sharing another's sites (Spartan-6's RAMB8BWER, half a
 * RAMB16BWER's) counts in the other's: two halves are one block RAM, and the check is the other's.
 * [{ id, used, count, noun, report }] in the resources' order.
 */
export function overResources(resources, used) {
  const need = { ...used };
  for (const r of resources) {
    if (r.shares && need[r.id]) need[r.shares.with] = (need[r.shares.with] || 0) + Math.ceil(need[r.id] / r.shares.per);
  }
  return resources.filter(r => !r.shares && r.count != null && (need[r.id] || 0) > r.count)
    .map(r => ({ id: r.id, used: need[r.id], count: r.count, noun: resourceNoun(r.id), report: r.report }));
}

/** An overflow as a message: '14 block RAMs needed, the XC3S100E has 4' (device: the part's name, any case). */
export function overMessage(o, device) {
  return `${o.used} ${o.noun} needed, the ${String(device).toUpperCase()} has ${o.count}`;
}

// ------------------------------------------------------------------ a change of the target device (#796)
// The primitives a family lacks, and their equivalent on it (the family's primitive of the same resource): a
// Spartan-3E design's multipliers are DSP48A1 on a Spartan-6, its RAMB16_S* RAMB16BWER; a Spartan-6 design's on
// a Spartan-3E the other way round. null: none (a memory controller: logic of the design's own).
const RAMB16_S = /^RAMB16_S\d+(_S\d+)?$/;
const EQUIVALENTS = {
  spartan6: { MULT18X18: 'DSP48A1', MULT18X18S: 'DSP48A1', MULT18X18SIO: 'DSP48A1', DCM: 'DCM_SP', RAMB16_S: 'RAMB16BWER' },
  spartan3e: { DSP48A1: 'MULT18X18SIO', RAMB16BWER: 'RAMB16_S36_S36', RAMB8BWER: 'RAMB16_S18_S18', PLL_BASE: 'DCM_SP', PLL_ADV: 'DCM_SP', DCM_CLKGEN: 'DCM_SP',
    BUFIO2: 'BUFG', BUFIO2_2CLK: 'BUFG', BUFH: 'BUFG', BUFHCE: 'BUFGCE', MCB: null },
};
// a resource of one family as the other's (a Spartan-6 block RAM half takes a whole RAMB16 on a Spartan-3E); the
// LUTs and slices of two families are not the same measure (4- and 6-input LUTs): not carried over
const SAME = { ffs: 'ffs', iob: 'iob', bufgmux: 'bufgmux', dcm: 'dcm' };
const RESOURCE_AS = {
  'spartan3e>spartan6': { ...SAME, ramb16: 'ramb16bwer', mult18x18: 'dsp48a1' },
  'spartan6>spartan3e': { ...SAME, ramb16bwer: 'ramb16', ramb8bwer: 'ramb16', dsp48a1: 'mult18x18', pll: 'dcm', bufio2: 'bufgmux', bufh: 'bufgmux' },
};
const resourceAs = (from, to, id) => (from === to ? id : (RESOURCE_AS[`${from}>${to}`] || { ffs: 'ffs', iob: 'iob' })[id] ?? null);

/** The equivalent of a primitive on a family that lacks it (its name; null: none); undefined when the family has it
 *  or neither family described here (core/resources.js) counts it. */
export function primitiveEquivalent(family, name) {
  const n = String(name || '').toUpperCase();
  if (!RESOURCE_FAMILIES.includes(family) || resourceOfPrimitive(family, n) || !RESOURCE_FAMILIES.some(f => resourceOfPrimitive(f, n))) return undefined;
  const eq = EQUIVALENTS[family] || {};
  return (RAMB16_S.test(n) ? eq.RAMB16_S : eq[n]) ?? null;
}

/** The primitive instances of an elaborated design (core/elaborate.js: design.top) of a counted resource (any
 *  family described here): [{ module, primitive }], one per instance, module the one that instantiates it. */
export function primitiveInstances(top) {
  const out = [];
  const walk = s => {
    for (const c of s?.children || []) {
      const n = String(c.module || '').toUpperCase();
      if (RESOURCE_FAMILIES.some(f => resourceOfPrimitive(f, n))) out.push({ module: s.module, primitive: n });
      else walk(c);
    }
  };
  walk(top);
  return out;
}

/** The resources a report gives as used ({ map, synthesis }: the Design Summary's, the Silinx toolchain's or ISE's):
 *  MAP's lines, or else the synthesis's, each by its resource id or its MAP line on the part it was made for
 *  (resources: resourcesOf of that part). { resourceId: n } */
export function usedOfReport(report, resources) {
  const used = {};
  for (const items of [report?.map?.utilization, report?.synthesis?.utilization]) {
    const known = (items || []).map(u => [u.id || resources.find(r => r.report && r.report === u.name)?.id, u.used]).filter(([id, n]) => id && Number.isFinite(n));
    if (!known.length) continue;
    for (const [id, n] of known) used[id] = n;
    break;
  }
  return used;
}

/**
 * A change of the target device checked (#796): the design's primitives the new family lacks and the resources
 * it needs more of than the new part has. from: the old family; to: the new part record (server/devices.js); pkg:
 * its package; familyName: the new family's name ('Spartan-6'); instances: primitiveInstances(); used: the old
 * device's resource use (usedOfReport); ports: the top's port bits (the I/O when no report gives them).
 * { primitives: [{ module, primitive, equivalent }], over: overResources' entries, messages: [text] }.
 */
export function deviceChangeIssues({ from, to, pkg = null, familyName = null, instances = [], used = {}, ports = 0 }) {
  const fam = to.family;
  const primitives = [];
  for (const { module, primitive } of instances) {
    const equivalent = primitiveEquivalent(fam, primitive);
    if (equivalent !== undefined && !primitives.some(p => p.module === module && p.primitive === primitive)) primitives.push({ module, primitive, equivalent });
  }
  // the resources on the new part: the report's (as the new family's), and at least the instances' and the ports'
  const count = (pairs) => {
    const out = {};
    for (const [id, n] of pairs) if (id) out[id] = (out[id] || 0) + n;
    return out;
  };
  const fromReport = count(Object.entries(used).map(([id, n]) => [resourceAs(from, fam, id), n]));
  const fromInstances = count(instances.map(i => [resourceOfPrimitive(fam, i.primitive) || resourceAs(from, fam, resourceOfPrimitive(from, i.primitive)), 1]));
  if (ports) fromInstances.iob = ports;
  const need = { ...fromReport };
  for (const [id, n] of Object.entries(fromInstances)) need[id] = Math.max(need[id] || 0, n);
  const over = overResources(resourcesOf(to, pkg), need);
  const family = familyName || fam;
  const messages = [
    ...primitives.map(p => (p.equivalent ? `Module '${p.module}' uses ${p.primitive}, which the ${family} family does not have: use ${p.equivalent} instead.`
      : `Module '${p.module}' uses ${p.primitive}, which the ${family} family does not have, nor an equivalent.`)),
    ...over.map(o => `${overMessage(o, to.part)}.`),
  ];
  return { primitives, over, messages };
}
