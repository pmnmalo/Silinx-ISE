// Configure Target Device of an iCE40 project (#2298): no JTAG chain and no PROM, as iMPACT's; its .bin written into the
// board's SPI flash, which the FPGA then loads (and at every power-up): by openFPGALoader in the local server.
import { api, followJob } from './api.js';
import { h, toast, alertDlg, confirmDlg } from './ui.js';
import { S, app } from './app.js';
import { countEvent } from './analytics.js';
import { runImpl } from './implement.js';

export function mountIce40Program(page) {
  const pj = S.project;
  const board = S.devices?.boards.find(b => b.id === pj?.board) || null;
  const file = pj?.top ? `build/${pj.top}.bin` : '';
  const info = h('div', { class: 'imp-file', style: { color: 'var(--grey-2)', margin: '6px 0' } });
  const tool = board?.programmer?.tools?.openFPGALoader;
  let busy = false;

  const loadInfo = async () => {
    if (!pj?.top) { info.textContent = 'No top module: set one in the Design pane first.'; return null; }
    const b = await api.bitinfo(pj.name).catch(() => null);
    info.textContent = b?.available ? `Configuration file: ${file} (${b.size} bytes)` : 'No .bin yet — run "Generate Programming File" first.';
    return b;
  };

  const program = async () => {
    if (busy) { toast('Another operation is running', 'error'); return null; }
    if (api.standalone) { alertDlg('Program Flash', 'The browser edition does not program an iCE40 yet: program it from the Silinx application (openFPGALoader).', 'error'); return null; }
    // (no .bin: the design implemented first, as iMPACT's Program FPGA, #1024)
    if (!(await loadInfo())?.available) {
      if (!pj?.top || !await confirmDlg('Program Flash', `There is no ${file} yet. Implement the design and generate it now?`)) return null;
      if (!await runImpl(pj.top, ['synth', 'translate', 'par', 'bitgen'])) return null;
      await loadInfo();
    }
    if (!await confirmDlg('Program Flash', `Write ${file} into the board's SPI flash? The FPGA then loads it, and again at every power-up.`)) return null;
    busy = true;
    app.log('\nProgramming the SPI flash...', 'hdr');
    try {
      const { job } = await api.program({ project: pj.name, board: board?.id });
      const r = await followJob(job, app.logLine);
      if (r.status === 'ok') { app.log('Flash programmed: the FPGA loads the design.', 'ok'); toast('Flash programmed: the FPGA loads the design.', 'ok'); countEvent('program'); }
      else { app.log(`Programming the SPI flash failed: ${r.error || 'see log'}`, 'err'); toast('Failed — see console', 'error'); }
      return r;
    } catch (e) { alertDlg('Program Flash', e.message, 'error'); return null; }
    finally { busy = false; }
  };

  page.append(
    h('h2', {}, 'Program the iCE40 — SPI flash'),
    h('div', { class: 'form-grid imp-settings', style: { maxWidth: '760px' } },
      h('label', {}, 'Board:'), h('span', {}, board?.name || '(no board)'),
      h('label', {}, 'Programmer:'), h('span', {}, api.standalone ? 'the board\'s USB (FT2232H), from the browser (WebUSB)' : 'openFPGALoader, through the board\'s USB (FT2232H)'),
      h('label', {}, 'Configuration file (.bin):'), h('span', {}, file || '(no top module)')),
    info,
    h('div', { style: { display: 'flex', gap: '8px' } },
      h('button', { class: 'btn primary ice40-program', onclick: program }, 'Program Flash'),
      h('span', { style: { color: 'var(--grey-4)', alignSelf: 'center' } }, 'Writes the .bin into the board\'s SPI flash: the FPGA loads it, and again at every power-up.')),
    h('div', { class: 'note-box' }, tool?.note || 'No board selected: choose one in Design Properties.', ...(tool?.verified === false ? ['\n', 'Not yet tested on a real board.'] : [])));
  loadInfo();
  return { onActivate: loadInfo, program };
}
