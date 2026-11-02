// The micro80 example (examples/micro80, #2544): the light8080 processor running a program from block RAM. The program's
// bytes run here on an interpreter of the instructions it uses, on every position of the switches, against the product
// computed apart; the testbench runs them on the processor itself. The flows common to every example:
// test/examples.test.js, test/ise/examples.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { example, runTestbench } from './examples-lib.mjs';

const ex = example('micro80');
const PROGRAM = 'src/program.vhd';
const programText = ex.design.find(s => s.path === PROGRAM).text;
const bytes = () => [...programText.matchAll(/X"([0-9A-F]{2})"/g)].slice(0, -1).map(m => parseInt(m[1], 16));   // but the others' X"00"

// the Intel 8080's instructions of the program (the 8080 Programmer's Manual); any other is an error. Runs until the
// program has gone once round its loop and read the tick's flag: { out: the ports written, steps }
function run(rom, input) {
  const mem = new Uint8Array(1024);
  mem.set(rom);
  const r = { A: 0, B: 0, C: 0, D: 0, E: 0 }, out = {};
  let pc = 0, sp = 0, cy = 0, z = 0, steps = 0;
  const next = () => mem[pc++];
  const word = () => { const l = next(); return l | (next() << 8); };
  const flags = v => { z = (v & 0xff) === 0 ? 1 : 0; };
  const add = (x, y) => { const v = x + y; cy = v > 0xff ? 1 : 0; flags(v); return v & 0xff; };
  const sub = (x, y) => { const v = x - y; cy = v < 0 ? 1 : 0; flags(v); return v & 0xff; };
  const push = v => { mem[--sp] = v >> 8; mem[--sp] = v & 0xff; };
  const pop = () => { const l = mem[sp++]; return l | (mem[sp++] << 8); };
  const reg = { 0: 'B', 1: 'C', 2: 'D', 3: 'E', 7: 'A' };
  for (;;) {
    assert.ok(++steps < 2000, 'the program does not finish its loop');
    const at = pc, op = next();
    if ((op & 0xc0) === 0x40) { r[reg[(op >> 3) & 7]] = r[reg[op & 7]]; continue; }           // MOV
    switch (op) {
      case 0x31: sp = word(); break;
      case 0xaf: r.A = 0; cy = 0; z = 1; break;                                               // XRA A
      case 0x32: mem[word()] = r.A; break;
      case 0x3a: r.A = mem[word()]; break;
      case 0xdb: { const p = next(); if (p === 1) return { out, steps }; r.A = input; break; } // IN
      case 0xd3: out[next()] = r.A; break;
      case 0xe6: r.A &= next(); cy = 0; flags(r.A); break;                                    // ANI
      case 0x0f: cy = r.A & 1; r.A = (r.A >> 1) | (cy << 7); break;                           // RRC
      case 0xcd: { const a = word(); push(pc); pc = a; break; }
      case 0xc9: pc = pop(); break;
      case 0xc3: pc = word(); break;
      case 0xda: { const a = word(); if (cy) pc = a; break; }
      case 0xd2: { const a = word(); if (!cy) pc = a; break; }
      case 0xc2: { const a = word(); if (!z) pc = a; break; }
      case 0x1e: r.E = next(); break;
      case 0x16: r.D = next(); break;
      case 0x80: r.A = add(r.A, r.B); break;
      case 0x87: r.A = add(r.A, r.A); break;
      case 0xc6: r.A = add(r.A, next()); break;
      case 0xd6: r.A = sub(r.A, next()); break;
      case 0xfe: sub(r.A, next()); break;                                                     // CPI
      case 0x14: r.D = (r.D + 1) & 0xff; flags(r.D); break;                                   // INR D, the carry kept
      case 0x15: r.D = (r.D - 1) & 0xff; flags(r.D); break;                                   // DCR D, the carry kept
      case 0xf5: push((r.A << 8) | cy | (z << 6)); break;                                     // PUSH PSW
      case 0xf1: { const v = pop(); r.A = v >> 8; cy = v & 1; z = (v >> 6) & 1; break; }      // POP PSW
      case 0xb3: r.A |= r.E; cy = 0; flags(r.A); break;                                       // ORA E
      default: assert.fail(`an instruction not expected: ${op.toString(16)} at ${at.toString(16)}`);
    }
  }
}

test('#2544 micro80: every position of the switches writes the product, in decimal, to the display', () => {
  const rom = bytes();
  assert.ok(rom.length > 100 && rom.length < 1024);
  for (let n = 0; n < 256; n++) {
    const product = (n >> 4) * (n & 15);
    const { out } = run(rom, n);
    assert.equal(out[0], 0xf0 | Math.floor(product / 100), `n = ${n}: the left two digits`);
    assert.equal(out[1], (Math.floor(product / 10) % 10) << 4 | (product % 10), `n = ${n}: the right two digits`);
  }
});

test('#2544 micro80: the program\'s listing has each instruction at the address it says', () => {
  let at = 0;
  for (const line of programText.split('\n')) {
    const m = /^\s*((?:X"[0-9A-F]{2}",\s*)+)--\s*([0-9A-F]{4})\s/.exec(line);
    if (!m) continue;
    assert.equal(parseInt(m[2], 16), at, line);
    at += m[1].match(/X"/g).length;
  }
  assert.equal(at, bytes().length);
});

test('#2544 micro80: the testbench passes with no warning, and fails on a program that adds wrong', async () => {
  const good = await runTestbench('micro80');
  assert.equal(good.passed, true);
  assert.deepEqual(good.log, ['Simulation finished OK']);
  const bad = await runTestbench('micro80', { edit: { [PROGRAM]: programText.replace('X"80",  ', 'X"81",  ') } });   // ADD C
  assert.equal(bad.passed, false);
});
