// Design Summary page (ISE "Design Summary/Reports").
import { api } from './api.js';
import { PRODUCT, VERSION_LABEL } from '/core/version.js';
import { resourcesOf } from '/packages/silinx-fpga/src/parts.js';
import { h } from './ui.js';
import { S, app } from './app.js';

const pct = (u, t) => (t ? Math.round((100 * u) / t) : 0);

export function mountSummary(el) {
  const page = h('div', { class: 'page' });
  el.append(page);
  const refresh = async () => {
    const pj = S.project;
    if (!pj) return;
    let rep = null;
    try { rep = await api.reports(pj.name); } catch { /* none */ }
    const part = S.devices?.parts.find(p => p.part === pj.device.part);
    const errs = S.diags.filter(d => d.severity === 'error').length, warns = S.diags.length - errs;
    page.innerHTML = '';
    page.append(h('h2', {}, `${pj.name} Project Status`));
    const row = (a, b, c, d) => h('tr', {}, h('th', {}, a), h('td', {}, b ?? ''), h('th', {}, c ?? ''), h('td', {}, d ?? ''));
    const sum = rep?.summary || {};
    const implState = sum.bitstream ? 'Programming File Generated' : sum.routed ? 'Placed and Routed' : sum.mapped ? 'Mapped' : sum.synthesized ? 'Synthesized' : 'New';
    const board = S.devices?.boards.find(b => b.id === pj.board);
    // made by the Silinx toolchain (no ISE): its reports are in build/open/
    const open = rep?.source === 'open';
    // (its caption the Tasks interface's only, where the tables are cards side by side: their tops in line, #1409)
    page.append(h('table', { class: 'summary-table' }, h('caption', { class: 'summary-status' }, 'Project Status'),
      row('Project File:', `${pj.name}/silinx.json`, 'Parser Errors:', h('span', { class: errs ? 'status-bad' : 'status-good' }, errs ? `${errs} Errors` : 'No Errors')),
      row('Module Name:', pj.top || '(not set)', 'Implementation State:', implState),
      row('Target Device:', `${pj.device.part}${pj.device.speed}-${pj.device.package}`, 'Warnings:', warns ? `${warns} Warnings` : 'No Warnings'),
      row('Board:', board ? board.name : 'None Specified', 'Test Benches:', String((pj.files || []).filter(f => f.role === 'sim').length)),
      row('Product Version:', `${PRODUCT} ${VERSION_LABEL} (${open ? 'Silinx toolchain, no ISE' : 'Xilinx ISE 14.7 flow'})`, 'Constraints:', pj.constraints || '(none)'),
      row('Design Goal:', `Balanced (${pj.impl?.optMode || 'Speed'})`, 'Sources:', `${pj.files.length} HDL files`),
    ));
    // utilization: every resource of the part (packages/silinx-fpga/src/resources.js, #790), used of available (#795): MAP's report's
    // lines (and the part's resources it does not list, ISE's leaves the unused ones out), or before an
    // implementation the synthesis's (the Silinx toolchain's), or the part's counts alone
    const syn = open ? (rep?.synthesis?.utilization || []).filter(u => u.total) : [];
    const caption = rep?.map ? (open ? ' (Silinx toolchain)' : '') : syn.length ? ' (after synthesis)' : ' (not yet implemented)';
    const tbl = h('table', { class: 'summary-table' }, h('caption', {}, `Device Utilization Summary${caption}`),
      h('tr', {}, h('th', {}, 'Logic Utilization'), h('th', {}, 'Used'), h('th', {}, 'Available'), h('th', {}, 'Utilization'), h('th', {}, '')));
    const res = part ? resourcesOf(part, pj.device.package).filter(r => r.report && r.count) : [];
    let lines = (rep?.map?.utilization || []).filter(u => u.total).map(u => [u.name, u.used, u.total, u.percent]);
    if (lines.length) lines.push(...res.filter(r => !lines.some(l => l[0] === r.report)).map(r => [r.report, 0, r.count]));
    else {
      const used = r => syn.find(u => u.id === r.id || u.name === r.report)?.used ?? (syn.length && r.id !== 'slices' ? 0 : '-');
      lines = res.map(r => [r.report, used(r), r.count]);
    }
    for (const [k, used, avail, pc] of lines) {
      const p = typeof used === 'number' ? (pc ?? pct(used, avail)) : null;
      tbl.append(h('tr', {}, h('td', {}, k), h('td', { class: 'num' }, used), h('td', { class: 'num' }, avail ?? ''), h('td', { class: p > 100 ? 'num status-bad' : 'num' }, p === null ? '' : `${p}%`),
        h('td', {}, p === null ? '' : h('span', { class: 'util-bar' }, h('div', { style: { width: `${Math.min(100, p)}%` } })))));
    }
    page.append(tbl);
    // timing
    const tm = rep?.timing;
    if (tm) {
      page.append(h('table', { class: 'summary-table' }, h('caption', {}, open ? 'Timing (post Place & Route, Silinx toolchain estimate)' : 'Timing (post Place & Route)'),
        h('tr', {}, h('th', {}, 'Timing Constraints'), h('td', { class: tm.met === false ? 'status-bad' : 'status-good' }, tm.met === false ? (open ? `Not met (${tm.timingErrors} constraints)` : `Not met (${tm.timingErrors} errors, score ${tm.score})`) : 'All constraints met')),
        tm.minPeriodNs ? h('tr', {}, h('th', {}, 'Minimum period'), h('td', {}, `${tm.minPeriodNs} ns (maximum frequency ${tm.maxFreqMHz} MHz)`)) : null,
        ...(tm.constraints || []).map(c => h('tr', {}, h('th', {}, c.name), h('td', {}, `${c.constraint} — ${c.timingErrors ? `${c.timingErrors} errors` : 'met'}, ${c.minPeriodNs == null ? 'no path between flip-flops to time' : `${c.minPeriodNs} ns`}`)))));
    }
    const bh = rep?.bit?.header;
    if (bh) {
      page.append(h('table', { class: 'summary-table' }, h('caption', {}, 'Programming File'),
        h('tr', {}, h('th', {}, 'Bitstream'), h('td', {}, `build/${pj.top}.bit (${Math.round(rep.bit.size / 1024)} KB)`)),
        h('tr', {}, h('th', {}, 'Part'), h('td', {}, bh.part || '')),
        h('tr', {}, h('th', {}, 'Generated'), h('td', {}, `${bh.date || ''} ${bh.time || ''}`)),
        // (the Tasks interface: the next task, Program, from here: #802; hidden in the others, web/css/tasks.css)
        h('tr', { class: 'task-program' }, h('td', { colspan: 2 }, h('button', { class: 'btn', type: 'button', onclick: () => app.openImpact() }, 'Program the board…')))));
    }
    // reports list
    page.append(h('table', { class: 'summary-table' }, h('caption', {}, 'Detailed Reports'),
      h('tr', {}, h('th', {}, 'Report Name'), h('th', {}, 'Status')),
      ...(open ? [['Synthesis Report (Yosys)', `open/${pj.top}_stat.txt`, rep?.synthesis], ['Placed Design (XDL)', 'open/placed.xdl', rep?.files?.placed], ['Routed Design (XDL)', 'open/routed.xdl', rep?.files?.routed], ['Static Timing Report', 'open/timing.txt', rep?.timing]]
        : [['Synthesis Report', `${pj.top}.syr`, rep?.synthesis], ['Map Report', `${pj.top}_map.mrp`, rep?.map], ['Place and Route Report', `${pj.top}.par`, rep?.par], ['Post-PAR Static Timing Report', `${pj.top}.twr`, rep?.timing], ['Bitgen Report', `${pj.top}.bgn`, rep?.bit]])
        .map(([n, f, r]) => h('tr', {}, h('td', {}, n), h('td', {}, r ? h('a', { onclick: () => app.openFile(`build/${f}`) }, 'Current') : '')))));
    // quick links (ISE sidebar style)
    page.append(h('div', { style: { color: 'var(--grey-3)', marginTop: '8px' } },
      app.openMode?.() ? 'Tip: double-click a process in the Processes panel to run it. Simulation runs entirely inside Silinx; synthesis and implementation use the Silinx toolchain (no ISE): Toolchain Settings (the gear in the toolbar).'
        : 'Tip: double-click a process in the Processes panel to run it. Simulation runs entirely inside Silinx; synthesis/implementation require Xilinx ISE 14.7 (Toolchain Settings (the gear in the toolbar)).'));
  };
  return { refresh, onActivate: refresh };
}
