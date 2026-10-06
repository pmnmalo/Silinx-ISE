// iMPACT-like device configuration: JTAG chain view, scan, program the FPGA (SRAM, volatile)
// or the board's Platform Flash PROM (non-volatile: the design loads at power-up).
import { api, followJob } from './api.js';
import { h, toast, alertDlg, confirmDlg } from './ui.js';
import { S, app } from './app.js';

const roleOf = name => (/^xcf/i.test(name) ? 'prom' : /^(xc)?(3s|6s|4v|5v|6v|7[akvz])/i.test(name) ? 'fpga' : /^(xc)?(2c|95)/i.test(name) ? 'cpld' : 'other');

export function mountImpact(el) {
  const page = h('div', { class: 'page' });
  el.append(page);
  const pj = S.project;
  const db = S.devices;
  let board = db?.boards.find(b => b.id === pj?.board) || null;
  let chain = board?.jtagChain || [{ name: pj?.device.part || 'xc3s250e', role: 'fpga' }];
  let selPos = Math.max(0, chain.findIndex(d => d.role === 'fpga'));
  let busy = false;
  const sel = () => chain[selPos] || chain[0];

  const boardSel = h('select', {}, h('option', { value: '' }, '(no board / generic JTAG)'), ...(db?.boards || []).map(b => h('option', { value: b.id, selected: b.id === board?.id }, b.name)));
  const toolSel = h('select', {}, ...['', 'impact', 'djtgcfg', 'adepttool', 'xc3sprog', 'openFPGALoader'].map(t => h('option', { value: t }, t || 'Board default / auto')));
  const cable = h('input', { type: 'text', placeholder: 'board default', style: { width: '160px' } });
  const fpgaFile = pj?.top ? `build/${pj.top}.bit` : '';
  const promFile = pj?.top ? `build/${pj.top}_prom.bit` : '';
  const bitfile = h('input', { type: 'text', style: { width: '360px' }, value: fpgaFile });
  const chainHost = h('div', { class: 'impact-chain' });
  const info = h('div', { style: { color: '#444', margin: '6px 0' } });
  const verify = h('input', { type: 'checkbox', checked: true });
  const reload = h('input', { type: 'checkbox' });
  const promBox = h('div', { class: 'prom-box' });
  const fpgaBox = h('div', {});
  const help = h('div', { style: { background: '#fffbe6', border: '1px solid #e6d690', padding: '8px', margin: '8px 0', whiteSpace: 'pre-wrap' } });

  const renderChain = () => {
    chainHost.innerHTML = '';
    chain.forEach((d, i) => {
      if (i) chainHost.append(h('div', { class: 'impact-link' }));
      const file = d.role === 'fpga' ? fpgaFile : d.role === 'prom' ? promFile : '';
      const dev = h('div', { class: `impact-dev${i === selPos ? ' sel' : ''}`, title: d.role === 'prom' ? 'Platform Flash PROM: holds the design across power cycles' : d.role === 'fpga' ? 'FPGA (configuration is lost at power-off)' : '' },
        h('div', { class: 'chipbox' }, d.name.toUpperCase()),
        h('div', {}, file && i === selPos ? h('b', {}, bitfile.value.split('/').pop() || '(no file)') : file ? h('span', {}, file.split('/').pop()) : h('span', { class: 'bypass' }, 'bypass')),
        h('div', { style: { color: '#888', fontSize: '11px' } }, `${d.role === 'prom' ? 'PROM' : d.role === 'fpga' ? 'FPGA' : d.role} · position ${i + 1}`));
      dev.addEventListener('click', () => selectDevice(i));
      chainHost.append(dev);
    });
  };

  const selectDevice = i => {
    selPos = i;
    const d = sel();
    bitfile.value = d.role === 'prom' ? promFile : fpgaFile;
    promBox.hidden = d.role !== 'prom';
    fpgaBox.hidden = d.role === 'prom';
    renderChain(); loadBitInfo();
  };

  boardSel.addEventListener('change', () => {
    board = db.boards.find(b => b.id === boardSel.value) || null;
    chain = board?.jtagChain || [{ name: pj?.device.part || 'fpga', role: 'fpga' }];
    selectDevice(Math.max(0, chain.findIndex(d => d.role === 'fpga')));
    renderHelp();
  });
  bitfile.addEventListener('change', () => { renderChain(); loadBitInfo(); });

  const renderHelp = () => {
    const p = board?.programmer;
    help.textContent = board
      ? `Board default programmer: ${p?.preferred} (falls back to an installed tool that uses the on-board USB).\n${Object.entries(p?.tools || {}).map(([k, v]) => `• ${k}: ${v.cable ? `cable ${v.cable}` : 'on-board USB'}${v.note ? ` — ${v.note}` : ''}${v.verified === false ? ' (unverified)' : ''}`).join('\n')}`
      : 'No board selected: choose the programming tool and cable explicitly.';
  };

  // Run a server job and stream its log to the console.
  const runJob = async (title, start, okMsg) => {
    if (busy) { toast('Another operation is running', 'error'); return null; }
    busy = true;
    app.log(`\n${title}...`, 'hdr');
    try {
      const { job } = await start();
      const r = await followJob(job, app.logLine);
      if (r.status === 'ok') { app.log(okMsg, 'ok'); toast(okMsg, 'ok'); }
      else { app.log(`${title} failed: ${r.error || 'see log'}`, 'err'); toast('Failed — see console', 'error'); }
      return r;
    } catch (e) { alertDlg('iMPACT', e.message, 'error'); return null; }
    finally { busy = false; }
  };

  const scan = async () => {
    const r = await runJob('Scanning JTAG chain', () => api.scan({ tool: toolSel.value || undefined, cable: cable.value.trim() || undefined, board: board?.id }), 'Scan finished.');
    if (r?.status === 'ok' && r.result?.devices?.length) {
      chain = r.result.devices.map(d => ({ name: d.name || d.idcode, role: roleOf(d.name || '') }));
      selectDevice(Math.max(0, chain.findIndex(d => d.role === 'fpga')));
    }
  };

  const programFpga = () => runJob('Programming FPGA (SRAM)', () => api.program({
    project: pj?.name, tool: toolSel.value || undefined, cable: cable.value.trim() || undefined, board: board?.id, position: selPos + 1, bitfile: bitfile.value.trim(),
  }), "'1': Programmed successfully.");

  const prom = async op => {
    const name = sel().name.toUpperCase();
    if (op === 'program' && !await confirmDlg('Program PROM', `Erase the ${name} and write ${bitfile.value.trim()}?\n\nThe design will then load automatically at power-up when the board's mode jumper is set to ROM (Basys2: JP3).\nTip: use "Back up PROM" first if it holds something you want to keep.`)) return;
    if (op === 'erase' && !await confirmDlg('Erase PROM', `Erase the whole ${name}? The board will no longer boot a design from flash.`)) return;
    const titles = { program: `Programming ${name}`, verify: `Verifying ${name}`, erase: `Erasing ${name}`, read: `Backing up ${name}`, reconfigure: 'Reloading the FPGA from the PROM' };
    const oks = { program: `'${selPos + 1}': ${name} programmed${verify.checked ? ' and verified' : ''}${reload.checked ? '; FPGA loaded from the PROM (DONE)' : ''}.`, verify: `${name} verified: contents match.`, erase: `${name} erased.`, read: 'PROM backup saved in build/prom-backup/.', reconfigure: 'FPGA loaded from the PROM (DONE).' };
    const r = await runJob(titles[op], () => api.prom({ project: pj?.name, board: board?.id, op, bitfile: bitfile.value.trim(), verify: verify.checked, reconfigure: reload.checked }), oks[op]);
    if (r?.status === 'ok' && op === 'read') app.reloadProject(false);
  };

  const loadBitInfo = async () => {
    if (!pj) return;
    const f = bitfile.value.trim();
    if (f !== fpgaFile) { info.textContent = `Configuration file: ${f}`; return; }
    try {
      const b = await api.bitinfo(pj.name);
      info.textContent = b.available ? `Bitstream: design ${b.designName || ''}, part ${b.part || ''}, built ${b.date || ''} ${b.time || ''}${b.warning ? `  ⚠ ${b.warning}` : ''}` : 'No bitstream yet — run "Generate Programming File" first (or enter the path of an existing .bit file).';
    } catch { /* ignore */ }
  };

  fpgaBox.append(h('div', { style: { display: 'flex', gap: '8px' } },
    h('button', { class: 'btn primary', onclick: programFpga }, 'Program FPGA'),
    h('span', { style: { color: '#666', alignSelf: 'center' } }, 'Loads the FPGA directly (volatile: lost at power-off). Select the PROM in the chain to store the design in flash.')));
  promBox.append(
    h('div', { style: { display: 'flex', gap: '16px', margin: '4px 0 8px' } },
      h('label', { style: { margin: 0 } }, verify, ' Verify after programming'),
      h('label', { style: { margin: 0 } }, reload, ' Reload the FPGA from the PROM afterwards (mode jumper on ROM)')),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button', { class: 'btn primary', onclick: () => prom('program') }, 'Program PROM'),
      h('button', { class: 'btn', onclick: () => prom('verify') }, 'Verify'),
      h('button', { class: 'btn', onclick: () => prom('erase') }, 'Erase'),
      h('button', { class: 'btn', onclick: () => prom('read') }, 'Back up PROM'),
      h('button', { class: 'btn', onclick: () => prom('reconfigure') }, 'Reload FPGA from PROM')),
    h('div', { style: { color: '#666', marginTop: '6px' } },
      'The PROM image is build/<top>_prom.bit (generated with StartUpClk:CCLK by "Generate Programming File"). ',
      'To boot from flash at power-up, set the mode jumper to ROM (Basys2: JP3). Uses adepttool + scripts/xcf_prog.py over the on-board USB.'));

  page.append(
    h('h2', {}, 'iMPACT — Boundary Scan'),
    h('div', { class: 'form-grid', style: { maxWidth: '760px' } },
      h('label', {}, 'Board:'), boardSel,
      h('label', {}, 'Programming tool:'), toolSel,
      h('label', {}, 'Cable:'), cable,
      h('label', {}, 'Configuration file (.bit):'), bitfile),
    info, chainHost,
    h('div', { style: { margin: '6px 0' } }, h('button', { class: 'btn', onclick: scan }, 'Initialize Chain (Scan)')),
    fpgaBox, promBox,
    help);
  renderHelp();
  selectDevice(selPos);
  return { onActivate: loadBitInfo };
}
