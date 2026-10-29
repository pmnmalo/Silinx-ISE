// The top-level port bits of a design that have no pin location (LOC) in its constraints, by their
// UCF names (as XST names them): the server (server/ise.js generateBuild) and the browser edition's
// Silinx toolchain (web/js/open-flow-browser.js) check them before an implementation.
import { compile, elaborate } from './compile.js';
import { parseUcf, bitName } from '../packages/silinx-fpga/src/parts.js';
import { clocksOf, latchGates } from './schematic.js';
import { primitiveSources } from './unisim.js';

/**
 * Create build/ for a project. Returns { buildDir, top, device, files, sources, hasUcf, warnings }.
 */
/** Top-level port bits ({ net, dir }) that have no LOC in the given UCF text. */
export async function unconstrainedPorts(sources, top, ucfText) {
  let design;
  // with Silinx's UNISIM models when the design instantiates primitives (LD*, BUFG ...)
  try { design = elaborate(compile([...primitiveSources(sources), ...sources]), top); } catch { return []; }
  if (!design?.top) return [];
  let asg = {};
  // (given the top's ports, a name such as x[1] is a bus bit only when x is a bus: #63, #84)
  const ucfPorts = design.top.ports.map(p => { const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar); return { name: p.name, msb: bus ? t.left : null, lsb: bus ? t.right : null }; });
  try { asg = parseUcf(ucfText || '', { ports: ucfPorts }).assignments || {}; } catch { /* unparsable: treat as empty */ }
  const has = net => Object.entries(asg).some(([k, a]) => a.loc && k.toLowerCase() === net.toLowerCase());
  // ports used as clocks anywhere in the hierarchy must go to global-clock (GCLK) pins
  const clocks = new Set();
  const visit = inst => { for (const pr of inst.procs || []) for (const c of clocksOf(pr).clocks) clocks.add(c); (inst.children || []).forEach(visit); };
  visit(design.top);
  // latch gates too: XST puts them on a global buffer, so they need a GCLK pin as well
  for (const g of latchGates(design)) clocks.add(g);
  const out = [];
  for (const p of design.top.ports) {
    const t = p.sig.t;
    // a 1-bit vector (std_logic_vector(0 downto 0), [0:0]) is a bus in the UCF: x<0>; an escaped
    // name (\opcode[0] ) is XST's: _opcode[0]_ (bitName)
    if (t.w === 1 && (t.scalar || t.kind !== 'logic')) { const n = bitName(p.name); if (!has(n)) out.push({ net: n, dir: p.dir, clock: p.dir === 'in' && clocks.has(p.sig) }); continue; }
    const lo = Math.min(t.left, t.right), hi = Math.max(t.left, t.right);
    for (let i = lo; i <= hi; i++) { const n = bitName(p.name, i); if (!has(n)) out.push({ net: n, dir: p.dir }); }
  }
  return out;
}
