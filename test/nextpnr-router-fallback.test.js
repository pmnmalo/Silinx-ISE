// nextpnr's router in the browser's flow worker (web/js/nextpnr-router-fallback.js, #3143): router2 as the local server's;
// a run that stops without an ERROR: line of nextpnr's (out of the browser's memory) made again with router1, a warning
// saying so among the run's lines (#3825: the back end says it with the run's own), the first run's lines not given;
// nextpnr's own error, and another router asked, as they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routerFallback } from '../web/js/nextpnr-router-fallback.js';

const ARGS = ['--device', 'xc7a35tcpg236-1', '--router', 'router2', '--seed', '1'];
// a fake micro-architecture: each run's arguments, its lines, and what it does (behave(args) -> files, or throws)
function fake(behave, lines = () => ['Info: placing', 'Info: routing']) {
  const runs = [];
  return { runs, np: { chipdb: async () => new Uint8Array(1), run: async (args, files, onLine) => { runs.push(args); for (const l of lines(args)) onLine(l); return behave(args); } } };
}

test('router2 as the local server\'s: one run, its lines, its files; the chip database the micro-architecture\'s', async () => {
  const seen = [];
  const { np, runs } = fake(() => ({ 'routed.fasm': 'x' }));
  const f = routerFallback(np);
  assert.equal(f.router, 'router2');
  assert.deepEqual(await f.run(ARGS, {}, (l) => seen.push(l)), { 'routed.fasm': 'x' });
  assert.deepEqual([runs, seen], [[ARGS], ['Info: placing', 'Info: routing']]);
  assert.deepEqual(await f.chipdb('xc7a35tcpg236-1'), new Uint8Array(1));
});

test('router2 stopping without an error of nextpnr\'s: router1, a warning among the run\'s lines, only the second run\'s lines', async () => {
  const seen = [];
  const { np, runs } = fake((args) => { if (args.includes('router2')) throw new RangeError('WebAssembly.Memory.grow(): Maximum memory size exceeded'); return { 'routed.fasm': 'y' }; },
    (args) => [`Info: ${args[3]}`]);
  const f = routerFallback(np);
  assert.deepEqual(await f.run(ARGS, {}, (l) => seen.push(l)), { 'routed.fasm': 'y' });
  assert.deepEqual(runs, [ARGS, ['--device', 'xc7a35tcpg236-1', '--router', 'router1', '--seed', '1']]);
  assert.deepEqual(seen, ['Warning: nextpnr\'s router2 stopped without an error (WebAssembly.Memory.grow(): Maximum memory size exceeded): out of this browser\'s memory, likely; routed again with router1 (less memory, slower; its routing, and so the .bit, not the local server\'s).',
    'Info: router1']);
});

test('nextpnr\'s own error (an ERROR: line): not run again, its lines given; router1 asked, or no router: as it is', async () => {
  const seen = [];
  const { np, runs } = fake(() => { throw new Error('nextpnr exited with code 255'); }, () => ['ERROR: FIXME: unconstrained IO not supported (pad sw)']);
  const f = routerFallback(np);
  await assert.rejects(f.run(ARGS, {}, (l) => seen.push(l)), /exited with code 255/);
  assert.deepEqual([runs.length, seen], [1, ['ERROR: FIXME: unconstrained IO not supported (pad sw)']]);
  for (const args of [['--router', 'router1'], ['--device', 'x']]) {
    const g = fake(() => { throw new Error('boom'); }, () => ['Info: x']), lines = [];
    await assert.rejects(routerFallback(g.np).run(args, {}, (l) => lines.push(l)), /boom/);
    assert.deepEqual([g.runs, lines], [[args], ['Info: x']]);
  }
});
