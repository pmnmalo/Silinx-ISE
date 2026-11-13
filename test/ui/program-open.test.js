// UI: Configure Target Device of an ECP5 and of a Gowin project (#2298): no JTAG chain, the page of the open families
// (web/js/program-open.js), its .bit or .fs loaded into the FPGA's SRAM by the server's openFPGALoader (a fake one, set in the
// test server's config: a real board is never touched), its file read and checked; with no file, the design implemented
// first (No: nothing runs); a bitstream for another device refused, in the console; in Portuguese. The iCE40's flash:
// test/ui/ice40-device.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { ecp5Bit, gowinFs } from '../fixtures/open-bitstreams.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINKY = 'module blinky(input clk, output reg [1:0] led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23:22]; end\nendmodule\n';
const CASES = {
  ecp5: { board: 'ulx3s', boardName: 'Radiona ULX3S', device: { family: 'ecp5', part: 'lfe5u-85f', package: 'cabga381', speed: '-6' }, ext: '.bit', usb: 'FT231X', fpgaBoard: 'ulx3s',
    constraints: ['constraints/top.lpf', 'LOCATE COMP "clk" SITE "G2";\nLOCATE COMP "led[0]" SITE "B2";\nLOCATE COMP "led[1]" SITE "C2";\nFREQUENCY PORT "clk" 25 MHZ;\n'],
    file: () => ecp5Bit({ size: 8192 }), other: () => ecp5Bit({ part: 'LFE5U-25F-6CABGA381', idcode: 0x41111043 }),
    refused: "bitstream was built for 'LFE5U-25F-6CABGA381' but the target device is 'LFE5U-85F': not programmed", fam: 'ECP5', ptFam: 'ECP5' },
  gowin: { board: 'tangnano9k', boardName: 'Sipeed Tang Nano 9K', device: { family: 'gowin', part: 'gw1nr-9c', package: 'qn88', speed: '-6' }, ext: '.fs', usb: 'BL702', fpgaBoard: 'tangnano9k',
    constraints: ['constraints/top.cst', 'IO_LOC "clk" 52;\nIO_LOC "led[0]" 10;\nIO_LOC "led[1]" 11;\n'],
    file: () => gowinFs(), other: () => gowinFs({ idcode: 0x0900281b }),
    refused: "bitstream is for the IDCODE 0x0900281b but the target device 'GW1NR-9C' is 0x1100481b: not programmed", fam: 'Gowin GW1N', ptFam: 'Gowin GW1N' },
};

for (const [family, c] of Object.entries(CASES)) {
  uiTest(`#2298 Configure Target Device on the ${c.fam}: Program FPGA loads its ${c.ext} with openFPGALoader -b ${c.fpgaBoard} -m; refused for another device; Portuguese`, E, async (page) => {
    const conf = path.join(env.tmp, 'config', 'config.json'), saved = await fs.readFile(conf, 'utf8');
    const fake = path.join(env.tmp, `fake-openFPGALoader-${family}`), called = path.join(env.tmp, `openFPGALoader-${family}.args`);
    await fs.writeFile(fake, `#!/bin/sh\necho "$@" >> '${called}'\necho "Done"\n`, { mode: 0o755 });
    await fs.writeFile(conf, JSON.stringify({ ...JSON.parse(saved), paths: { openFPGALoader: fake } }));
    const name = `Prog_${family}`, file = path.join(env.server.workspace, name, 'build', `blinky${c.ext}`);
    try {
      await makeProject(env, { name, board: c.board, device: c.device, files: { 'src/blinky.v': BLINKY, [c.constraints[0]]: c.constraints[1] }, top: 'blinky', constraints: c.constraints[0] });
      await page.openProject(name);
      await page.setView('impl');
      await page.treeRow('#hier', 'blinky');
      await page.treeRow('#procs', 'Configure Target Device', { dbl: true, exact: true });
      await page.waitFor((ext) => document.querySelector('.doc:not([hidden]) .imp-file')?.textContent === `No ${ext} yet — run "Generate Programming File" first.`, [c.ext], { what: 'the program page' });
      const shown = () => page.eval(() => [...document.querySelector('.open-program').closest('.page').querySelectorAll('h2, .imp-settings > *, .imp-file, .open-program, .open-program + span, .note-box')].map((e) => e.textContent));
      const note = `The on-board ${c.usb} (JTAG): the ${c.ext} loaded into the FPGA's SRAM, until the board is powered off.\nNot yet tested on a real board.`;
      assert.deepEqual(await shown(), [`Program the ${c.fam} — SRAM`, 'Board:', c.boardName, 'Programmer:', `openFPGALoader, through the board's USB (${c.usb})`,
        `Configuration file (${c.ext}):`, `build/blinky${c.ext}`, `No ${c.ext} yet — run "Generate Programming File" first.`, 'Program FPGA',
        `Loads the ${c.ext} into the FPGA's SRAM: the design runs until the board is powered off.`, note]);
      // its tab: Program FPGA, not iMPACT
      assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.tab.active, .doc-tab.active')].map((t) => t.textContent.replace('✕', '').trim()).filter((t) => /Program FPGA|iMPACT/.test(t))), ['Program FPGA']);
      // no file: implement it first? No: nothing runs
      await page.click('.doc:not([hidden]) .open-program');
      await page.waitDialog('Program FPGA');
      assert.match(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().textContent), new RegExp(`There is no build/blinky\\${c.ext} yet\\. Implement the design and generate it now\\?`));
      await page.dialogButton('No');
      await fs.access(called).then(() => assert.fail('openFPGALoader ran'), () => {});
      // its file there: loaded, no question (the SRAM, as iMPACT's Program FPGA), no warning
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, c.file());
      await page.click('.doc:not([hidden]) .open-program');
      await page.waitConsole(/FPGA programmed: the design runs until the board is powered off\./, { timeout: 30000 }).catch(async (e) => { throw new Error(`${e.message}\n${(await page.consoleText()).slice(-2500)}`); });
      let log = await page.consoleText();
      assert.deepEqual(log.split('\n').filter((l) => /WARNING|ERROR/.test(l)), []);
      assert.match(log, new RegExp(`Programming \\(SRAM, volatile\\) with openFPGALoader board=${c.fpgaBoard}`));
      assert.equal(await fs.readFile(called, 'utf8'), `-b ${c.fpgaBoard} -m ${file}\n`);
      assert.equal(await page.eval(() => document.querySelector('.open-program').closest('.page').querySelector('.imp-file').textContent), `Configuration file: build/blinky${c.ext} (${c.file().length} bytes)`);
      // a bitstream for another device: refused, in the console; openFPGALoader not run again
      await fs.writeFile(file, c.other());
      await page.click('.doc:not([hidden]) .open-program');
      await page.waitConsole(/Programming the FPGA failed:/, { timeout: 30000 });
      log = await page.consoleText();
      assert.ok(log.includes(`Programming the FPGA failed: ${c.refused}`), log.slice(-1500));
      assert.equal((await fs.readFile(called, 'utf8')).split('\n').length, 2);
      // in Portuguese: the page translated
      await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
      try {
        assert.deepEqual(await shown(), [`Programar o ${c.ptFam} — SRAM`, 'Placa:', c.boardName, 'Programador:', `openFPGALoader, pela USB da placa (${c.usb})`,
          `Ficheiro de configuração (${c.ext}):`, `build/blinky${c.ext}`, `Ficheiro de configuração: build/blinky${c.ext} (${c.other().length} bytes)`, 'Programar FPGA',
          `Carrega o ${c.ext} na SRAM da FPGA: o projeto corre até a placa ser desligada.`,
          `O ${c.usb} da placa (JTAG): o ${c.ext} carregado na SRAM da FPGA, até a placa ser desligada.\nAinda não testado numa placa real.`]);
      } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
    } finally { await fs.writeFile(conf, saved); }
  });
}
