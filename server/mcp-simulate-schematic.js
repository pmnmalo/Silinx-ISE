// simulate_drawing of a schematic (server/mcp-simulate-drawing.js, #2674, #3827): the schematic simulated live as its
// editor's Try it does (core/schlive.js buildLiveSim, with the project's modules and the HDL of its view): per cycle its
// inputs set, then one cycle of its clock inputs; the outputs and every module instance's pins read (an arrayed
// instance's, reg(3:0), its copies' values side by side). A schematic that cannot be simulated says why, as Try it does.
import { toolError, readProject, viewSourcesOf } from './mcp-util.js';

/** { lines, rows } of a schematic `rel` of the project `name` stepped through `vectors` (inputsOf's, by marker name). */
export async function simulateSchematicFile(name, rel, cycles, base, inputsOf) {
  const [{ openSchematic }, { buildLiveSim }, V] = await Promise.all([import('./mcp-schematic.js'), import('../core/schlive.js'), import('../core/values.js')]);
  const { doc, modules } = await openSchematic(name, rel);
  const project = await readProject(name);
  const r = buildLiveSim(doc, { modules, sources: await viewSourcesOf(name, project, false) });
  if (!r.ok) throw toolError(['The schematic cannot be simulated:', ...r.errors.map((e) => `ERROR: ${e}`)].join('\n'));
  const live = r.live;
  const clocks = live.inputs.filter((i) => i.clock), data = live.inputs.filter((i) => !i.clock);
  const vectors = inputsOf(cycles, data);
  const outs = doc.ports.filter((p) => p.dir !== 'in');
  const insts = doc.symbols.filter((s) => s.type === 'module');
  const bin = (v) => (v == null ? null : V.toBin(v));
  const lines = [`${base}: ${vectors.length} clock cycle(s)${clocks.length ? ` of ${clocks.map((c) => c.name).join(', ')}` : ' (no clock input: the inputs set, the circuit settled)'}:`];
  const rows = vectors.map((v, k) => {
    for (const i of data) live.set(i.id, v[i.name]);
    if (clocks.length) live.cycles(clocks.map((c) => c.id), 1);
    const outputs = Object.fromEntries(outs.map((p) => [p.name, bin(live.portValue(p.id))]));
    const instances = Object.fromEntries(insts.map((s) => [s.name, Object.fromEntries(live.instancePorts(s.id).map((q) => [q.name, bin(q.value)]))]));
    const pairs = (o) => Object.entries(o).map(([n, x]) => `${n}=${x ?? '?'}`).join(' ') || 'none';
    lines.push(`cycle ${k}: inputs ${data.map((i) => `${i.name}=${bin(V.mk(i.width, v[i.name]))}`).join(' ') || 'none'}; outputs ${pairs(outputs)}`
      + Object.entries(instances).map(([n, ps]) => `; ${n}: ${pairs(ps)}`).join(''));
    return { cycle: k, inputs: Object.fromEntries(data.map((i) => [i.name, Number(v[i.name])])), outputs, instances };
  });
  return { lines, rows, warnings: r.warnings || [] };
}
