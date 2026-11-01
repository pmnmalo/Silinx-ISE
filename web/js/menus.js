// The menus and the toolbar (#405: out of app.js): the menu bar's menus and their commands, the toolbar, the command
// palette, printing the document in front, and exporting or importing a project as a zip file.
import { api } from './api.js';
import { icons, icon } from './icons.js';
import { h, alertDlg, menuBar, toast, downloadText, runAction } from './ui.js';
import * as wiz from './wizards.js';
import { setLanguage, getLanguage, LOCALES } from './i18n.js';
import { lintEnabled, setLintEnabled } from './diaghelp.js';
import { getInterface, setInterface, getTheme, setTheme, menuCommands } from './modern.js';
import { openPalette } from './palette.js';
import { openFindInProject } from './find-project.js';
import { developmentMenu } from './devmenu.js';
import { S, activateDoc, app, canCopyAny, canDeleteAny, canPasteAny, closeDoc, copyAny, cutAny, deleteAny, docEditor, history, openFile,
  openFpgaView, openImpact, openPinPlanner, openSummary, pasteAny, projectRedo, projectUndo, redoAny, redoesProject, setView, showLeftPage,
  undoAny, undoesProject } from './app.js';
import { log } from './console.js';
import { openProject, closeProject, recent, clearRecent, storageMenuItems } from './project.js';
import { runImpl, stopProcesses } from './implement.js';
import { setViewAsTop, topOfView, viewSel } from './drawings.js';
import { checkSyntax, runProcess, saveAll, topConfirmed } from './processes.js';
import { setTop, unsetTop } from './design.js';
import { openEmulator, openSchematic, runSimulation } from './viewers.js';
import { printActive, printable } from './print-doc.js';
import { generatedOpener, showGeneratedBeside, splitState, toggleSplit } from './split-view.js';
// (Print: the document in front, whichever it is, #1509)
export { printActive, printable };

const $ = id => document.getElementById(id);

// the menus' entries the header's Settings shares (#1314): the language, the interface, the theme (the classic ISE look is
// light only), the update check at start-up (#488: off, the app asks GitHub nothing until Check for Updates… is used)
const languageMenu = () => ({ label: 'Language', submenu: Object.entries(LOCALES).map(([id, l]) => ({ label: l.name, checked: getLanguage() === id, action: () => setLanguage(id) })) });
const interfaceMenu = () => ({ label: 'Interface', submenu: [
  { label: 'Modern', checked: getInterface() === 'silinx', action: () => setInterface('silinx') },
  { label: 'Classic', checked: getInterface() === 'ise', action: () => setInterface('ise') },
] });
const themeMenu = () => (getInterface() !== 'ise' ? { label: 'Theme', submenu: [
  { label: 'System', checked: getTheme() === 'system', action: () => setTheme('system') },
  { label: 'Light', checked: getTheme() === 'light', action: () => setTheme('light') },
  { label: 'Dark', checked: getTheme() === 'dark', action: () => setTheme('dark') },
] } : null);
const updateAtStartItem = () => ({ label: 'Check for Updates at Start-up', checked: wiz.updateCheckEnabled(), action: () => { wiz.setUpdateCheckEnabled(!wiz.updateCheckEnabled()); toast(wiz.updateCheckEnabled() ? 'Check for updates at start-up on: the latest release is asked of GitHub when the app starts' : 'Check for updates at start-up off: Help > Check for Updates… checks by hand'); } });
/** The header's Settings menu (the modern interface, #1314). */
export const settingsItems = () => [
  { label: 'About Silinx ISE', icon: icon('help'), action: () => wiz.aboutDialog() },
  '-',
  interfaceMenu(), languageMenu(), themeMenu(),
  '-',
  { label: 'Toolchain Settings (ISE / Programmers)…', icon: icon('gear'), action: () => wiz.toolchainDialog() },
  '-',
  { label: 'Check for Updates…', action: () => wiz.checkUpdatesDialog() },
  updateAtStartItem(),
  '-',
  { label: 'Keyboard Shortcuts', action: () => wiz.shortcutsDialog() },
  { label: 'Tell Us Who You Are…', action: () => wiz.whoAreYou() },
  // a development build's Development menu (#707), the menu bar gone (#1321)
  ...((dev) => (dev ? ['-', { label: dev.label, submenu: dev.items() }] : []))(developmentMenu()),
].filter(Boolean);

export function setupMenus() {
  const hasPj = () => !S.project;
  menuBar($('menubar'), S.menus = [
    { label: 'File', items: () => [
      { label: 'New Project…', icon: icon('newProject'), action: () => wiz.newProjectWizard() },
      { label: 'Open Project…', icon: icon('open'), action: () => wiz.openProjectDialog() },
      '-',
      { label: 'Import Silinx ISE Project (.zip)…', action: () => wiz.importSilinxDialog() },
      { label: 'Export Silinx ISE Project (.zip)…', action: () => exportProjectZip('silinx'), disabled: hasPj },
      '-',
      { label: 'Import Xilinx ISE Project (.zip)…', action: () => wiz.importXiseDialog() },
      { label: 'Export Xilinx ISE Project (.zip)…', action: () => exportProjectZip('xilinx'), disabled: hasPj },
      '-',
      api.standalone ? { label: 'Download Project Bundle…', action: async () => downloadText(`${S.project.name}.silinx.json`, await api.exportBundle(S.project.name), 'application/json'), disabled: hasPj } : null,
      api.standalone ? { label: 'Open Project Bundle…', action: () => openBundle() } : null,
      api.standalone ? '-' : null,
      ...(api.standalone ? storageMenuItems() : []),
      { label: 'Close Project', action: () => closeProject(), disabled: hasPj },
      '-',
      { label: 'Print…', action: () => printActive(), shortcut: 'Ctrl+P', disabled: () => !printable() },
      '-',
      { label: 'Recent Projects', submenu: [
        ...recent().map(r => ({ label: r, action: () => openProject(r) })),
        recent().length ? '-' : null,
        { label: 'Clear Recent Projects', action: () => clearRecent(), disabled: !recent().length },
      ].filter(Boolean) },
    ].filter(Boolean) },
    { label: 'Edit', items: () => [
      // one Undo: the last removal from the project when that was the last action, else the editor's undo
      undoesProject()
        ? { label: `Undo ${history.undoLabel()}`, icon: icon('undo'), action: () => projectUndo(), shortcut: 'Ctrl+Z' }
        : { label: 'Undo', icon: icon('undo'), action: () => undoAny(), shortcut: 'Ctrl+Z', disabled: () => !docEditor(S.active) },
      redoesProject()
        ? { label: `Redo ${history.redoLabel()}`, icon: icon('redo'), action: () => projectRedo(), shortcut: 'Ctrl+Y' }
        : { label: 'Redo', icon: icon('redo'), action: () => redoAny(), shortcut: 'Ctrl+Y', disabled: () => !docEditor(S.active) },
      '-',
      // the active editor's selection (#677): text, schematic, the other drawings
      { label: 'Cut', icon: icon('cut'), action: () => cutAny(), shortcut: 'Ctrl+X', disabled: () => !canCopyAny() || !canDeleteAny() },
      { label: 'Copy', icon: icon('copy'), action: () => copyAny(), shortcut: 'Ctrl+C', disabled: () => !canCopyAny() },
      { label: 'Paste', icon: icon('paste'), action: () => pasteAny(), shortcut: 'Ctrl+V', disabled: () => !canPasteAny() },
      { label: 'Delete', icon: icon('remove'), action: () => deleteAny(), shortcut: 'Del', disabled: () => !canDeleteAny() },
      '-',
      { label: 'Find…', icon: icon('find'), action: () => S.active?.editor?.exec('findPersistent'), shortcut: 'Ctrl+F', disabled: () => !S.active?.editor },
      { label: 'Replace…', action: () => S.active?.editor?.exec('replace'), disabled: () => !S.active?.editor },
      { label: 'Find in Project…', icon: icon('find'), action: () => openFindInProject(), shortcut: 'Ctrl+Shift+F', disabled: () => !S.project },   // (#1430)
      { label: 'Go to Line…', action: () => S.active?.editor?.exec('jumpToLine'), shortcut: 'Ctrl+G', disabled: () => !S.active?.editor },
      '-',
      { label: 'Design Checks (Lint Warnings)', checked: lintEnabled(), action: () => { setLintEnabled(!lintEnabled()); toast(lintEnabled() ? 'Design checks on: Check Syntax and the editor show the lint warnings' : 'Design checks off: only errors are shown'); for (const d of S.docs) d.liveCheck?.(); } },
    ] },
    { label: 'View', items: () => [
      { label: 'Implementation', checked: S.view === 'impl', action: () => setView('impl') },
      { label: 'Simulation', checked: S.view === 'sim', action: () => setView('sim') },
      '-',
      { label: 'Design Summary', icon: icon('summary'), action: () => openSummary(), disabled: hasPj },
      '-',
      // (two documents side by side, each side with its tabs, #1619, #1652)
      { label: 'Split Editor', checked: splitState().on, action: () => toggleSplit() },
      { label: 'Show Generated HDL Beside', action: () => showGeneratedBeside(), disabled: () => !generatedOpener(S.active) },
      '-',
      languageMenu(), interfaceMenu(), themeMenu(),
      '-',
      { label: 'Command Palette…', action: () => showPalette(), shortcut: 'Ctrl+K' },
    ].filter(Boolean) },
    { label: 'Project', items: () => [
      { label: 'New Source…', action: () => wiz.newSourceWizard(), disabled: hasPj },
      { label: `${wiz.addSourceTitle()}…`, action: () => wiz.addSourceDialog(), disabled: hasPj },   // (Import Source… in the modern interface, #1501)
      '-',
      // the implementation top (the Simulation view has none: Simulate runs the selected module)
      // (the selected module the top: Unset as Top Module, #1220)
      S.view === 'sim' ? null : (S.project?.top && (S.sel?.module || (viewSel() && topOfView(viewSel()))) === S.project.top
        ? { label: 'Unset as Top Module', action: () => unsetTop() }
        : { label: 'Set as Top Module', action: () => (S.sel?.module ? setTop(S.sel.module, false) : viewSel() && setViewAsTop(viewSel())), disabled: () => !S.sel?.module && !viewSel() }),
      { label: 'Design Properties…', action: () => wiz.projectProperties(), disabled: hasPj },
    ] },
    { label: 'Process', items: () => [
      { label: 'Implement Top Module', icon: icon('run'), action: () => S.project?.top && runImpl(S.project.top, ['synth', 'translate', 'map', 'par', 'bitgen']), disabled: () => !S.project?.top || S.busy },
      { label: 'Stop', icon: icon('stop'), action: () => stopProcesses(), disabled: () => !S.currentJob },
      { label: 'Run', action: () => S.selProc && runProcess(S.selProc), disabled: () => !S.selProc?.run },
      { label: 'Check Syntax', action: () => S.sel?.module && checkSyntax(S.sel.module, S.view === 'sim'), disabled: () => !S.sel?.module },
      { label: 'Simulate Behavioral Model', icon: icon('wave'), action: () => S.sel?.module && runSimulation(S.sel.module), disabled: () => !S.sel?.module },
    ] },
    { label: 'Tools', items: () => [
      { label: 'ASM State Machine Editor…', icon: icon('asm'), action: () => wiz.newSourceWizard({ type: 'asm' }), disabled: hasPj },
      { label: 'Boolean Algebra / Karnaugh Map…', icon: icon('algebra'), action: () => wiz.newSourceWizard({ type: 'tt' }), disabled: hasPj },
      { label: 'FSM State Diagram Editor…', icon: icon('fsm'), action: () => wiz.newSourceWizard({ type: 'fsm' }), disabled: hasPj },
      { label: 'Petri Net Editor…', icon: icon('petri'), action: () => wiz.newSourceWizard({ type: 'petri' }), disabled: hasPj },
      { label: 'I/O Pin Planning', icon: icon('pins'), action: () => openPinPlanner(S.sel?.module), disabled: hasPj },
      { label: 'iMPACT (Configure Target Device)', icon: icon('impact'), action: () => openImpact() },
      { label: 'Board Emulator', icon: icon('board'), action: () => openEmulator(S.project.top), disabled: hasPj },
      { label: 'RTL Schematic', icon: icon('schematic'), action: () => S.sel?.module && openSchematic(S.sel.module), disabled: () => !S.sel?.module },
      { label: 'Implemented Design (FPGA View)', icon: icon('chip'), action: () => openFpgaView(), disabled: () => !S.project?.top },
      '-',
      { label: 'Toolchain Settings (ISE / Programmers)…', icon: icon('gear'), action: () => wiz.toolchainDialog() },
    ] },
    { label: 'Window', items: () => [
      ...S.docs.map(d => ({ label: d.title, checked: d === S.active, action: () => activateDoc(d) })),
      S.docs.length ? '-' : null,
      { label: 'Close All Documents', action: () => [...S.docs].forEach(closeDoc), disabled: () => !S.docs.length },
    ].filter(Boolean) },
    { label: 'Help', items: () => [
      { label: 'About Silinx ISE', icon: icon('help'), action: () => wiz.aboutDialog() },
      { label: 'Keyboard Shortcuts', action: () => wiz.shortcutsDialog() },
      '-',
      { label: 'Check for Updates…', action: () => wiz.checkUpdatesDialog() },
      // the start-up check (#488): off, the app asks GitHub nothing until Check for Updates… is used
      updateAtStartItem(),
      '-',
      { label: 'Tell Us Who You Are…', action: () => wiz.whoAreYou() },
    ] },
    // a development build's changes since the last release (#707)
    developmentMenu(),
  ].filter(Boolean));
}

export function setupToolbar() {
  const tb = $('toolbar');
  const btn = (ico, title, fn, enabled = () => true) => {
    const b = h('button', { class: 'tb-btn', title, 'data-cmd': ico, html: icons[ico], onclick: () => enabled() && runAction(title, fn) });
    // (Cut / Copy / Paste pressed leave the focus where it is: in the editor or the text field whose selection they take)
    if (['cut', 'copy', 'paste'].includes(ico)) b.addEventListener('mousedown', e => e.preventDefault());
    b.dataset.enabled = '1';
    b._enabled = enabled;
    return b;
  };
  tb.append(
    btn('newProject', 'New Project', () => wiz.newProjectWizard()),
    btn('open', 'Open Project', () => wiz.openProjectDialog()),
    btn('closeProject', 'Close Project', () => closeProject(), () => !!S.project),   // as File ▸ Close Project (#2027)
    btn('print', 'Print', () => printActive(), printable),   // as File ▸ Print… (#1251)
    h('div', { class: 'tb-sep' }),
    btn('undo', 'Undo', () => undoAny(), () => undoesProject() || !!docEditor(S.active)),   // as Edit ▸ Undo (enabled as it is, #1192)
    btn('redo', 'Redo', () => redoAny(), () => redoesProject() || !!docEditor(S.active)),   // as Edit ▸ Redo
    h('div', { class: 'tb-sep' }),
    // as Edit ▸ Cut / Copy / Paste (#677), enabled as they are
    btn('cut', 'Cut', () => cutAny(), () => canCopyAny() && canDeleteAny()),
    btn('copy', 'Copy', () => copyAny(), canCopyAny),
    btn('paste', 'Paste', () => pasteAny(), canPasteAny),
    btn('find', 'Find in Project', () => openFindInProject(), () => !!S.project),   // (every source of the project, #1430; an editor's own Find in its bar)
    h('div', { class: 'tb-sep' }),
    btn('asm', 'New ASM State Diagram', () => S.project && wiz.newSourceWizard({ type: 'asm' })),
    h('div', { class: 'tb-sep' }),
    btn('run', 'Implement Top Module', () => S.project?.top && !S.busy && runImpl(S.project.top, ['synth', 'translate', 'map', 'par', 'bitgen'])),
    btn('stop', 'Stop the running process', () => stopProcesses()),
    btn('wave', 'Simulate Behavioral Model', () => S.sel?.module && runSimulation(S.sel.module)),
    btn('impact', 'Configure Target Device (iMPACT)', () => openImpact()),
    h('div', { class: 'tb-sep' }),
    btn('gear', 'Toolchain Settings', () => wiz.toolchainDialog()),
    btn('help', 'About', () => wiz.aboutDialog()),
  );
  // the modern interface: the main steps of the design flow as labelled buttons
  const step = (ico, label, title, fn, enabled) => {
    const b = h('button', { class: 'm-step', title, 'data-step': label.toLowerCase(), onclick: () => enabled() && fn() }, h('span', { class: 'ico-inline', html: icons[ico] }), h('span', {}, label));
    b._enabled = enabled;
    return b;
  };
  const mod = () => S.sel?.module || (S.view === 'sim' ? null : S.project?.top);
  // only Implement waits for a running implementation (one ISE build at a time); checking,
  // simulating, emulating and programming run in the browser or independently of it
  tb.append(h('div', { class: 'm-steps', role: 'group', 'aria-label': 'Design flow' },
    step('mCheck', 'Check', 'Check Syntax of the selected module', () => checkSyntax(mod(), S.view === 'sim'), () => !!S.project && !!mod()),
    step('mWave', 'Simulate', 'Simulate Behavioral Model of the selected module', () => runSimulation(mod()), () => !!S.project && !!mod()),
    step('mBolt', 'Implement', 'Implement Top Module', async () => await topConfirmed('Implement', 'implements') && runImpl(S.project.top, ['synth', 'translate', 'map', 'par', 'bitgen']), () => !!S.project?.top && !S.busy),
    step('mBoard', 'Emulate', 'Board Emulator', async () => await topConfirmed('Emulate', 'emulates') && openEmulator(S.project.top), () => !!S.project?.top),
    step('mUpload', 'Program', 'Configure Target Device (iMPACT)', () => openImpact(), () => true),
  ));
  refreshSteps();
}

// enable / disable the labelled buttons of the modern toolbar (cheap: run on clicks and changes)
export function refreshSteps() {
  for (const b of document.querySelectorAll('#toolbar .m-step')) b.disabled = !b._enabled();
  for (const b of document.querySelectorAll('#toolbar .tb-btn:is([data-cmd=cut], [data-cmd=copy], [data-cmd=paste], [data-cmd=undo], [data-cmd=redo], [data-cmd=print], [data-cmd=closeProject])')) b.disabled = !b._enabled();
}

// Command palette: every enabled menu command and every project file
export function showPalette() {
  const files = S.project ? [...new Set(S.project.files.map(f => f.path))].sort().map(path => ({ path, open: () => openFile(path) })) : [];
  return openPalette({ commands: menuCommands(S.menus), files });
}

export function downloadUrl(url, filename) {
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
}

// kind 'xilinx': a Xilinx ISE 14.7 project (.xise + sources, opens in ISE);
// kind 'silinx': the whole Silinx project (silinx.json + every file, ASM charts and schematics included)
export async function exportProjectZip(kind = 'xilinx') {
  await saveAll();
  const title = kind === 'silinx' ? 'Export Silinx ISE Project' : 'Export Xilinx ISE Project';
  try {
    const { blob, filename, warnings = [] } = await api.exportZip(S.project.name, kind);
    const url = URL.createObjectURL(blob);
    downloadUrl(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    log(kind === 'silinx'
      ? `Exported ${filename}: the whole Silinx project (silinx.json + all project files, ${Math.round(blob.size / 1024)} KB).`
      : `Exported ${filename}: Xilinx ISE project ${S.project.name}.xise + its sources (${Math.round(blob.size / 1024)} KB).`, 'ok');
    for (const w of warnings) log(`WARNING: ${w}`, 'warn');
  } catch (e) { alertDlg(title, e.message, 'error'); }
}

function openBundle() {
  const inp = h('input', { type: 'file', accept: '.json' });
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const name = await api.importBundle(await f.text()); await openProject(name); showLeftPage('design');
      for (const w of api.lastImportWarnings || []) log(`WARNING: ${w}`, 'warn');
    }
    catch (e) { alertDlg('Open Project Bundle', e.message, 'error'); }
  });
  inp.click();
}
