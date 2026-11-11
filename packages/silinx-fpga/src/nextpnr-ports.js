// Silinx toolchain - the top's ports as nextpnr names them, for the back ends whose constraints nextpnr reads (the iCE40's
// PCF, #2295; the 7-series' XDC, #3146).

/** A port's bits as nextpnr names them: q[0], q[1]… (a bus), clk (a bit); a vector of one bit too: btn, not btn[0] (#2518). */
export function portBits(netlistText, top) {
  const mods = JSON.parse(netlistText).modules || {};
  const mod = mods[top] || Object.values(mods).find(m => m.attributes?.top) || {};
  return Object.entries(mod.ports || {}).flatMap(([name, p]) => (p.bits.length > 1 ? p.bits.map((_, i) => `${name}[${(p.offset || 0) + i}]`)
    : [{ name, bit: `${name}[${p.offset || 0}]` }])).map(b => (typeof b === 'string' ? { name: b } : b));
}

/** (#2518) The constraints' names as nextpnr's: a one-bit port's btn[0] (a board's constraints name every bus's bits so) as btn. */
export function nextpnrNames(model, bits) {
  const rename = new Map(bits.filter(b => b.bit && !model.assignments?.[b.name] && model.assignments?.[b.bit]).map(b => [b.bit, b.name]));
  if (!rename.size) return model;
  const to = n => rename.get(n) || n;
  return { ...model, assignments: Object.fromEntries(Object.entries(model.assignments).map(([n, a]) => [to(n), a])), clocks: (model.clocks || []).map(c => ({ ...c, net: to(c.net) })) };
}
