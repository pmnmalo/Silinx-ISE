// Configure Target Device of an open family's project (#2298): no JTAG chain and no PROM, as iMPACT's; the board programmed
// with the file its flow makes, by the target of its tool's descriptor (web/js/tool-descriptors.js program): an iCE40's .bin
// written into the board's SPI flash, which the FPGA then loads (and at every power-up); an ECP5's .bit, a Gowin's .fs loaded
// into the FPGA's SRAM (until the board is powered off). By openFPGALoader in the local server; through the board's USB
// over WebUSB in the browser edition, where the board's tool says so (webusb: core/usb-program.js).
import { api, followJob } from './api.js';
import { h, toast, alertDlg, confirmDlg } from './ui.js';
import { S, app } from './app.js';
import { countEvent } from './analytics.js';
import { runImpl } from './implement.js';
import { projectTool } from './processes.js';
import { deviceFamily, familyName } from '/packages/silinx-fpga/src/parts.js';

export function mountOpenProgram(page) {
  const pj = S.project;
  const board = S.devices?.boards.find(b => b.id === pj?.board) || null;
  const prog = projectTool().program, flash = prog.target === 'spi-flash';
  const ext = prog.file.replace('{top}', ''), file = pj?.top ? `build/${prog.file.replace('{top}', pj.top)}` : '';
  const info = h('div', { class: 'imp-file', style: { color: 'var(--grey-2)', margin: '6px 0' } });
  const tool = board?.programmer?.tools?.openFPGALoader, usb = tool?.usb || 'USB';
  // (the browser edition programs only the boards whose USB it drives)
  const none = api.standalone && !tool?.webusb;
  let busy = false;

  const loadInfo = async () => {
    if (!pj?.top) { info.textContent = 'No top module: set one in the Design pane first.'; return null; }
    const b = await api.bitinfo(pj.name).catch(() => null);
    info.textContent = b?.available ? `Configuration file: ${file} (${b.size} bytes)` : `No ${ext} yet — run "Generate Programming File" first.`;
    return b;
  };

  const program = async () => {
    if (busy) { toast('Another operation is running', 'error'); return null; }
    if (none) { app.log('WARNING: This board is not programmed from the browser yet: the local server programs it (silinx serve), with openFPGALoader.', 'warn'); return null; }
    // (no file: the design implemented first, as iMPACT's Program FPGA, #1024)
    if (!(await loadInfo())?.available) {
      if (!pj?.top || !await confirmDlg(prog.title, `There is no ${file} yet. Implement the design and generate it now?`)) return null;
      if (!await runImpl(pj.top, ['synth', 'translate', 'par', 'bitgen'])) return null;
      await loadInfo();
    }
    // (the flash, non-volatile: asked first; the SRAM, as iMPACT's Program FPGA, not)
    if (flash && !await confirmDlg(prog.title, `Write ${file} into the board's SPI flash? The FPGA then loads it, and again at every power-up.`)) return null;
    busy = true;
    app.log(flash ? '\nProgramming the SPI flash...' : '\nProgramming the FPGA (SRAM)...', 'hdr');
    try {
      const { job } = await api.program({ project: pj.name, board: board?.id, bitfile: file });
      const r = await followJob(job, app.logLine);
      const done = flash ? 'Flash programmed: the FPGA loads the design.' : 'FPGA programmed: the design runs until the board is powered off.';
      if (r.status === 'ok') { app.log(done, 'ok'); toast(done, 'ok'); countEvent('program'); }
      else { app.log(`${flash ? 'Programming the SPI flash' : 'Programming the FPGA'} failed: ${r.error || 'see log'}`, 'err'); toast('Failed — see console', 'error'); }
      return r;
    } catch (e) { alertDlg(prog.title, e.message, 'error'); return null; }
    finally { busy = false; }
  };

  const fam = familyName(deviceFamily(pj?.device));
  page.append(
    h('h2', {}, `Program the ${fam} — ${flash ? 'SPI flash' : 'SRAM'}`),
    h('div', { class: 'form-grid imp-settings', style: { maxWidth: '760px' } },
      h('label', {}, 'Board:'), h('span', {}, board?.name || '(no board)'),
      h('label', {}, 'Programmer:'), h('span', {}, none ? 'not from the browser yet: the local server\'s openFPGALoader (silinx serve)'
        : api.standalone ? `the board's USB (${usb}), from the browser (WebUSB)` : `openFPGALoader, through the board's USB (${usb})`),
      h('label', {}, `Configuration file (${ext}):`), h('span', {}, file || '(no top module)')),
    info,
    h('div', { style: { display: 'flex', gap: '8px' } },
      h('button', { class: 'btn primary open-program', onclick: program, disabled: none }, prog.title),
      h('span', { style: { color: 'var(--grey-4)', alignSelf: 'center' } }, flash ? `Writes the ${ext} into the board's SPI flash: the FPGA loads it, and again at every power-up.`
        : `Loads the ${ext} into the FPGA's SRAM: the design runs until the board is powered off.`)),
    h('div', { class: 'note-box' }, tool?.note || 'No board selected: choose one in Design Properties.', ...(tool?.verified === false ? ['\n', 'Not yet tested on a real board.'] : [])));
  loadInfo();
  return { onActivate: loadInfo, program };
}
