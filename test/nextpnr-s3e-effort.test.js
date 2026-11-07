// Router 1's effort in the Spartan-3E's nextpnr engine (#2912, nextpnr-himbaechel-spartan3e 1.1.0): router 1 stops past
// 30000 wires visited per arc to route (200 million in all) and router 2 routes the design from there. On 1.0.0 a
// congested design took router 1 tens of minutes (vtr-diffeq1 20 minutes natively, 16 in the corpus's WebAssembly run;
// secworks-aes over 15); the designs it routes within the budget route as before. The vga example through Silinx's flow
// (open-flow-nextpnr.js, as the design corpus's lib.mjs nextpnrPlaceRoute runs it), nextpnr's own log kept: the budget in
// force on the default run, and router 2's routes, past a budget made small (-o max-visits-per-arc=1000), read back as a
// complete routed design with no warning. Router 2 routes with its alternate weights (1.1.1, #3002: an estimate weight of
// 1.0, not 1.25), whose critical paths are shorter: on that run nextpnr's maximum frequency above the default weights'.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exampleProject, silinxFlow } from './examples-lib.mjs';
import { runFlow } from '../packages/silinx-fpga/src/open-flow-core.js';
import { nextpnrNode } from '../packages/silinx-fpga/src/nextpnr-node.js';
import { loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';
import { loadDb } from '../packages/silinx-fpga/src/fpga/bitdb-node.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-effort-'));
// the shipped device descriptions, never ones built in the user's ~/.silinx/devices
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const PART = 'xc3s250ecp132-4';
let vga;
// the vga example on the Basys2-250, synthesized once: its netlist and constraints
const synthesized = async () => {
  if (vga) return vga;
  const { dir, project } = exampleProject('vga', { board: 'basys2', variant: '250' }, tmp);
  const job = await silinxFlow(dir, project, ['synth']);
  assert.equal(job.status, 'ok', job.lines.join('\n'));
  vga = { top: project.top, netlist: fs.readFileSync(path.join(dir, 'build', 'open', `${project.top}.json`), 'utf8'),
    ucf: fs.readFileSync(path.join(dir, project.constraints), 'utf8') };
  return vga;
};

// Translate, Map and Place & Route on the nextpnr engine, nextpnr given the extra arguments: the flow's result, its
// warnings and nextpnr's log
async function placeRoute(extra = []) {
  const { top, netlist, ucf } = await synthesized();
  const engine = nextpnrNode(), log = [], lines = [], store = {};
  const nextpnr = { ...engine, run: (args, files, onLine) => engine.run([...args, ...extra], files, l => { log.push(l); onLine(l); }) };
  const device = loadDeviceCache(PART);
  const io = { log: l => lines.push(l), sources: () => [], ucf, ucfName: 'top.ucf', device: () => device, bitDb: () => loadDb(PART, { graph: device }),
    nextpnr: { spartan3e: nextpnr }, write: (name, data) => { store[name] = data; return name; },
    read: name => (name === `open/${top}.json` ? netlist : store[name] ?? null), save: () => {} };
  const r = await runFlow({ top, part: PART, device: 'xc3s250e', pkg: 'cp132', family: 'spartan3e', steps: ['translate', 'map', 'par'], seed: 1,
    effort: 1, synthEffort: 'normal', synthGoal: 'fast', startupClk: 'JtagClk', engine: 'nextpnr' }, io);
  return { r, lines, log, warnings: lines.filter(l => /^WARNING/.test(l)) };
}

test('#2912 router 1 routes vga within its effort, the budget in force: 30000 wires per arc', { timeout: 600000 }, async () => {
  const { r, lines, log, warnings } = await placeRoute();
  assert.ok(r.ok, r.error);
  const visited = log.map(l => /Router 1 visited (\d+) wires, (\d+) per arc \(at most (\d+)\)/.exec(l)).find(Boolean);
  assert.ok(visited, 'nextpnr\'s log has router 1\'s visits and its budget');
  // (the budget: 30000 per arc to route, of the whole design: 1164 arcs on 1.1.0)
  const [, total, perArc, budget] = visited.map(Number);
  assert.equal(budget % 30000, 0, visited[0]);
  assert.ok(budget / 30000 > 1000, visited[0]);
  assert.ok(total <= budget && perArc < 30000, visited[0]);
  assert.ok(!log.some(l => /Routing with router 2/.test(l)), 'router 1 finished it');
  assert.ok(lines.includes('All signals are completely routed.'));
  assert.deepEqual(warnings, []);
});

test('#2912 #3002 past router 1\'s effort router 2 routes vga, with its alternate weights: a complete routed design, no warning', { timeout: 600000 }, async () => {
  const { r, lines, log, warnings } = await placeRoute(['-o', 'max-visits-per-arc=1000']);
  assert.ok(r.ok, r.error);
  assert.ok(log.some(l => /Router 1 stopped after/.test(l)), 'router 1 stopped at its budget');
  const route = log.findIndex(l => /Routing with router 2/.test(l));
  assert.ok(route >= 0, 'router 2 took over');
  // (nextpnr's last timing report, after router 2: 87.7 MHz with the default weights, 103.98 with the alternate ones)
  const fmax = log.slice(route).map(l => /Max frequency for clock .*: ([\d.]+) MHz/.exec(l)).filter(Boolean).map(m => Number(m[1])).pop();
  assert.ok(fmax > 95, `router 2's maximum frequency ${fmax} MHz`);
  assert.ok(lines.includes('All signals are completely routed.'));
  assert.deepEqual(warnings, []);
});
