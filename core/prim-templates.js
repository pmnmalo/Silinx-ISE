// Silinx - the Language Templates' *Device Primitives* (#792, part of #787): an instantiation template of each
// primitive of the project's family, VHDL and Verilog, from the list the schematic library offers (core/primitives.js:
// its pins as UNISIM's, its attributes at their defaults with their ranges), with what the primitive is and how many
// the device has (core/resources.js).
//
// A template's placeholders, ${1:text} … ${n:text}, are on what the user changes: the instance's name, the signals
// of the pins it needs and of its outputs, the main attributes (a DCM's or a PLL's frequencies); an input it works
// without tied to its inactive value (as the schematic does); $0 the cursor's place after it.
//
// Isomorphic ES module (browser + Node), no DOM.
//
// API:
//   primitiveTemplates(family, lang, part?)  [{ type, name, text }]: the family's templates (part: its count in the comment)
//   primitiveTemplate(type, lang, part?)     one primitive's
//   templateSignal(pin)                      the signal a template connects to a pin ('do' is SystemVerilog's)
//   fillTemplate(text)                       the template with its placeholders' texts, as inserted

import { DEVICE_PRIMITIVES, devicePrimitives, primitiveOf, primitiveDefaults, genericValue, primitiveResource } from './primitives.js';
import { resourcesOf } from './resources.js';

// the attributes a template has on placeholders: the ones a design sets (the others at their defaults)
const KEY_ATTRS = {
  dcm_sp: ['CLKFX_MULTIPLY', 'CLKFX_DIVIDE', 'CLKDV_DIVIDE', 'CLKIN_PERIOD'],
  pll_base: ['CLKFBOUT_MULT', 'DIVCLK_DIVIDE', 'CLKIN_PERIOD', 'CLKOUT0_DIVIDE', 'CLKOUT1_DIVIDE'],
  mult18x18sio: ['AREG', 'BREG', 'PREG'],
  ramb16_s: ['WRITE_MODE'], ramb16_s_s: ['WRITE_MODE_A', 'WRITE_MODE_B'],
  ramb8bwer: ['DATA_WIDTH_A', 'DATA_WIDTH_B'], ramb16bwer: ['DATA_WIDTH_A', 'DATA_WIDTH_B'],
  bufio2: ['DIVIDE', 'DIVIDE_BYPASS'],
};
// a block RAM's contents: its first INIT_xx in the template, the others said in its comment
const INIT_NOTE = 'INIT_00 … INIT_3F: 256 bits each, the memory from address 0 (INITP_xx the parity bits)';

/** The signal a template connects to a pin: its name in lower case (DO / DI: dout / din, `do` being SystemVerilog's). */
export function templateSignal(pin) {
  const m = /^D([IO])(P?)([AB]?)$/.exec(pin.name);
  return m ? `${m[1] === 'I' ? 'din' : 'dout'}${m[2].toLowerCase()}${m[3].toLowerCase()}` : pin.name.toLowerCase();
}

/** The template with its placeholders replaced by their texts ($0 removed), as the editor inserts it. */
export function fillTemplate(text) {
  return String(text).replace(/\$\{\d+:([^}]*)\}/g, '$1').replace('$0', '');
}

const range = g => (g.options ? g.options.join(', ') : g.kind === 'bool' ? 'TRUE, FALSE' : g.kind === 'hex' ? `${g.bits} bits` : `${g.min} … ${g.max}`);

/** One primitive's instantiation template ({ type, name, text }) in `lang`; part: a part record, for its count. */
export function primitiveTemplate(type, lang, part = null) {
  const P = DEVICE_PRIMITIVES[type];
  if (!P) return null;
  const vl = lang === 'verilog', c = vl ? '//' : '--';
  const params = primitiveDefaults(type), r = primitiveOf(type, params);
  let field = 1;
  const ph = text => `\${${++field}:${text}}`;
  const head = [`${c} ${r.name}: ${P.description}`];
  const id = part ? primitiveResource(type, part.family, params) : null;
  const res = id && resourcesOf(part).find(x => x.id === id);
  if (res) head.push(`${c} ${res.label.en}: ${res.count ?? 'not known'} on this device (${String(part.part).toUpperCase()})`);
  if (!vl) head.push(`${c} (library UNISIM; use UNISIM.VCOMPONENTS.ALL; in the context clause)`);
  // the attributes: their values, a placeholder on the main ones, their ranges in a comment
  const keys = KEY_ATTRS[type] || [];
  const gens = r.generics.map(g => {
    const v = genericValue(g, params[g.name], lang);
    return [g.name, keys.includes(g.name) ? ph(v) : v, range(g)];
  });
  for (const [k, v] of r.fixed || []) gens.push([k, `"${v}"`, 'fixed']);
  if (r.contents) gens.push(['INIT_00', vl ? `256'h${'0'.repeat(64)}` : `X"${'0'.repeat(64)}"`, INIT_NOTE]);
  // the pins: a signal (a placeholder) on the needed inputs and on the outputs, the others tied
  const conns = r.pins.map(q => {
    let a;
    if (q.dir === 'out' || q.need) a = ph(templateSignal(q));
    else a = vl ? (q.tie === '1' && q.width > 1 ? `{${q.width}{1'b1}}` : `${q.width}'b${q.tie}`) : q.width > 1 || q.vec ? `"${q.tie.repeat(q.width)}"` : `'${q.tie}'`;
    return [q.name, a, q.func.en];
  });
  const inst = `\${1:u_${type}}`;
  const pad = (s, n) => s.padEnd(n);
  const wg = Math.max(0, ...gens.map(([k]) => k.length)), wp = Math.max(0, ...conns.map(([k]) => k.length));
  const lines = [...head];
  if (vl) {
    if (gens.length) {
      lines.push(`${r.name} #(`);
      gens.forEach(([k, v, n], i) => lines.push(`  .${pad(k, wg)}(${v})${i < gens.length - 1 ? ',' : ' '} // ${n}`));
      lines.push(`) ${inst} (`);
    } else lines.push(`${r.name} ${inst} (`);
    conns.forEach(([k, a, n], i) => lines.push(`  .${pad(k, wp)}(${a})${i < conns.length - 1 ? ',' : ' '} // ${n}`));
    lines.push(');$0');
  } else {
    lines.push(`${inst} : ${r.name}`);
    if (gens.length) {
      lines.push('  generic map (');
      gens.forEach(([k, v, n], i) => lines.push(`    ${pad(k, wg)} => ${v}${i < gens.length - 1 ? ',' : ' '} -- ${n}`));
      lines.push('  )');
    }
    lines.push('  port map (');
    conns.forEach(([k, a, n], i) => lines.push(`    ${pad(k, wp)} => ${a}${i < conns.length - 1 ? ',' : ' '} -- ${n}`));
    lines.push('  );$0');
  }
  return { type, name: r.name, text: `${lines.join('\n')}\n` };
}

/** The templates of a family's primitives ('spartan3e', 'spartan6'; none for another), in the library's order. */
export function primitiveTemplates(family, lang, part = null) {
  return devicePrimitives(family).map(P => primitiveTemplate(P.type, lang, part));
}
