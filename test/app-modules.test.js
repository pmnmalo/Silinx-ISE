// web/js/app.js split by concern (#405): each part moved out lives in its own module only, and
// what app.js imports from it is what the module exports (read as text: the modules need a page).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = f => fs.readFileSync(new URL(`../web/js/${f}`, import.meta.url), 'utf8');
const app = read('app.js');
// (a name a module re-exports, `export { … }`, from a module split out of it later, counts too)
const exportsOf = code => new Set([...code.matchAll(/^export (?:async )?(?:function|const|let) (\w+)/gm)].map(m => m[1])
  .concat([...code.matchAll(/^export \{([^}]*)\}/gm)].flatMap(m => m[1].split(',').map(s => s.trim()).filter(Boolean))));
const importedFrom = (code, mod) => {
  const m = new RegExp(`^import \\{([^}]*)\\} from '\\./${mod.replace('.', '\\.')}';`, 'm').exec(code);
  return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : null;
};
const definedIn = (code, name) => new RegExp(`^(?:export )?(?:async )?function ${name}\\(|^(?:export )?(?:let|const) ${name}\\b`, 'm').test(code);

// the modules split out of a part later (#405): a part's functions are defined in it or in them
const SPLIT = { 'drawings.js': ['drawings-tt.js'] };
const readPart = mod => [mod, ...(SPLIT[mod] || [])].map(read).join('\n');

// the modules taken out of app.js and the functions each one owns
const PARTS = {
  'console.js': ['log', 'logLine', 'showConsolePage', 'setDiagnostics', 'renderDiagnostics', 'clearConsole',
    'consoleMessage', 'renderDiagnosticsSoon', 'diagFixes', 'applyDiagFix', 'lastConsoleDiag'],
  'project.js': ['resetProjectState', 'blockedByRun', 'lifecycle', 'inOrder', 'openProject', 'closeProject', 'openProjectNow',
    'closeProjectNow', 'reloadProject', 'reloadProjectNow', 'updateTitle', 'rememberRecent', 'recent', 'clearRecent',
    'renderStartPage', 'storageBox', 'storageMenuItems', 'storageLine', 'updateStorageStatus', 'switchStorage',
    'openWorkspaceFolder', 'reopenWorkspaceFolder', 'useBrowserStorage', 'copyBrowserProjects'],
  'implement.js': ['STEP_PROC', 'STEP_TOOL', 'RANK', 'worst', 'applyReportWarnings', 'stepTracker', 'ucfDiagnostics', 'checkUcfFile',
    'checkConstraints', 'regenerateUcf', 'runImpl', 'runImplInner', 'SYNTH_OPEN', 'synthOpenRunning', 'synthOpen', 'FLOW_UP_TO',
    'generateSimModel', 'postParTiming', 'textPowerReport', 'backAnnotatePins', 'readBuildFile', 'showTextDoc', 'stopProcesses'],
  'drawings.js': ['openAsm', 'staleHdl', 'freshHdl', 'syncHdlFromAsm', 'asmFromHdlFile',
    'convertToAsm', 'asmContextMenu', 'ttDesignSources', 'openTt', 'ttModel', 'refreshTtLink', 'syncHdlFromTt',
    'ttFromHdl', 'pickModule', 'moduleTable', 'loadTtFromModule', 'ttSchematicDoc', 'openTtSchematic', 'ttSchT', 'refreshTtSchematic', 'ttContextMenu',
    'openFsm', 'fsmModel', 'refreshFsmLink', 'fsmDir', 'freeName', 'syncHdlFromFsm',
    'fsmFromHdlFile', 'convertToFsm', 'fsmToAsmChart', 'asmToFsmDiagram', 'fsmTruthTables', 'openPetri',
    'syncHdlFromPetri', 'petriContextMenu', 'fsmContextMenu', 'schModules', 'openSch', 'isAsm', 'isTt', 'isFsm',
    'isPn', 'viewNoun', 'viewTitle', 'viewIcon', 'viewKind', 'viewContextMenu', 'openView', 'viewBadge',
    'syncedViewMenu', 'drawnHdlLanguage', 'adoptDrawnHdl', 'writeDrawnHdl', 'linkOpenEditor', 'clashTip',
    'drawnHdlClashes', 'clashItem', 'resolveHdlClash', 'syncBanner', 'refreshSyncBanner',
    'topUcfPorts', 'ucfPort', 'refreshOpenEditor', 'syncHdlFromSchematic',
    'convertToSchematic', 'drawingsAsBase', 'setViewAsTop', 'viewSel', 'topOfView', 'exportSchAsIse', 'schContextMenu'],
  'processes.js': ['STATUS_ICON', 'SUMMARY_PROC', 'openMode', 'OPEN_SYNTH', 'ISE_ONLY', 'ISE_ONLY_TIP', 'forOpenMode',
    'processDefs', 'processDefsAll', 'selectionProcesses', 'renderProcesses', 'ISE_PROCS', 'runProcess',
    'topConfirmed', 'setStatus', 'markStale', 'diagsFor', 'saveAll', 'checkSyntax', 'checkSyntaxInner',
    'hdlDiagnostics', 'checkFileSyntax', 'IMPL_IDS', 'EXTRA_STEPS', 'SIM_MODEL_NAMES', 'STATUS_FILE',
    'sourcesFingerprint', 'synthFingerprint', 'loadUcfText', 'saveImplStatus', 'restoreImplStatus'],
  'design.js': ['renderHierarchy', 'clashBadge', 'viewOfModule', 'treeItem', 'selectRow', 'markSelRow', 'treeKeys',
    'select', 'testBench', 'inView', 'moduleContextMenu', 'fileContextMenu', 'projectContextMenu', 'setTop',
    'projectSaves', 'saveProjectJson', 'serialOp', 'removeFile', 'removeModule', 'removeNow'],
  'menus.js': ['setupMenus', 'setupToolbar', 'refreshSteps', 'showPalette', 'printActive', 'downloadUrl', 'exportProjectZip', 'openBundle'],
  'viewers.js': ['netlistSources', 'SIM_MODEL_THEN', 'offerSimModel', 'isPrimitive', 'openTechSchematic',
    'openSilinxTechSchematic', 'openSchematic', 'readDataFiles', 'runSimulation', 'runSimulationInner',
    'saveStimTestbench', 'confirmElabErrors', 'openEmulator'],
  'rename.js': ['renameSymbolIn', 'extOf', 'dirOf', 'renameDialog', 'renameSource'],
};
// every module out of app.js, the ones split out of a part included
const MODULES = [...Object.keys(PARTS), ...Object.values(SPLIT).flat()];

test('#405 app.js split: each moved function is defined in its module only', () => {
  for (const [mod, names] of Object.entries(PARTS)) {
    const code = readPart(mod);
    for (const name of names) {
      assert.ok(definedIn(code, name), `${name} in ${mod}`);
      assert.ok(!definedIn(app, name), `${name} not in app.js any more`);
    }
  }
});

test('#405 app.js split: what app.js imports from a module is exported by it, and what the module imports from app.js is exported there', () => {
  for (const mod of Object.keys(PARTS)) {
    const code = read(mod), names = importedFrom(app, mod);
    assert.ok(names?.length, `app.js imports from ${mod}`);
    const exported = exportsOf(code);
    for (const name of names) assert.ok(exported.has(name), `${mod} exports ${name}`);
    const fromApp = importedFrom(code, 'app.js'), appExports = new Set([...exportsOf(app), 'S', 'app']);
    assert.ok(fromApp?.includes('S'), `${mod} imports S from app.js`);
    for (const name of fromApp) assert.ok(appExports.has(name), `app.js exports ${name} (for ${mod})`);
  }
  // the names other modules use on the app object are still there
  for (const name of ['log', 'logLine', 'setDiagnostics']) assert.match(app, new RegExp(`export const app = \\{[^}]*\\b${name}\\b`));
  for (const name of ['openProject', 'closeProject', 'reloadProject', 'stepTracker', 'regenerateUcf']) assert.match(app, new RegExp(`export const app = \\{[^}]*\\b${name}\\b`));
  // and app.js still exports them by name
  assert.match(app, /^export \{ log, setDiagnostics \};/m);
  assert.match(app, /^export \{ openProject, closeProject, reloadProject \};/m);
});

test('#405 app.js split: the helpers fail on a part missing from a module', () => {
  assert.equal(definedIn('function other() {}', 'log'), false);
  assert.equal(definedIn('export async function log(x) {}', 'log'), true);
  assert.equal(importedFrom("import { a } from './x.js';", 'console.js'), null);
  assert.deepEqual(importedFrom("import { a, b } from './console.js';", 'console.js'), ['a', 'b']);
});

// #375: open, close and reload stay in call order. The queue moved with them, unchanged: each call waits for the one
// before it, a failed one included.
test('#405 project.js: open / close / reload keep their call order (the queues of #375)', () => {
  const code = read('project.js');
  assert.match(code, /^let lifecycle = Promise\.resolve\(\);\nfunction inOrder\(fn\) \{\n  const run = lifecycle\.then\(fn, fn\);\n  lifecycle = run\.catch\(\(\) => \{\}\);\n  return run;\n\}/m);
  assert.match(code, /^export function openProject\(name\) \{ return inOrder\(\(\) => openProjectNow\(name\)\); \}$/m);
  assert.match(code, /^export function closeProject\(\) \{ return inOrder\(closeProjectNow\); \}$/m);
  assert.match(code, /S\.reloadChain = \(S\.reloadChain \|\| Promise\.resolve\(\)\)\.then\(run, run\);/);
  // every document closed through app.js (its view state kept as it was), never by project.js itself
  assert.equal((code.match(/if \(!await closeAllDocs\(\)\) return;/g) || []).length, 2);
  assert.doesNotMatch(code, /keepView|closeDoc\(/);
});

// The modules import app.js and app.js imports them (a cycle): a module's top level reads nothing app.js
// defines, or it would read it before app.js has run: its top-level constants are literals or functions.
test('#405 app.js split: a module\'s top-level constants use nothing imported from app.js', () => {
  for (const mod of MODULES) {
    const code = read(mod), fromApp = importedFrom(code, 'app.js');
    for (const m of code.matchAll(/^(?:export )?(?:const|let) (\w+) = ([^\n]*(?:\n {2}[^\n]*)*)/gm)) {
      if (/^(?:async )?(?:\([^)]*\)|\w+) =>/.test(m[2])) continue;   // a function: run later
      // the functions inside it (an object's run: () => …) run later too
      const now = m[2].replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''").replace(/(?:\([^()]*\)|\w+) => (?:\{[^{}]*\}|[^,}\n]*)/g, '');
      for (const name of fromApp) assert.doesNotMatch(now, new RegExp(`\\b${name}\\b`), `${mod}: ${m[1]} reads ${name}`);
    }
  }
});

test('#405 implement.js: the implementation processes, Check Constraints and Stop left app.js', () => {
  const code = read('implement.js');
  for (const s of ['=== SILINX STEP', "'Synthesize - Yosys (open)'", 'pin location(s) chosen by the tools', 'api.cancelJob(S.currentJob)'])
    assert.ok(code.includes(s) && !app.includes(s), s);
  // the processes panel's runners (processes.js since the fifth part) still reach them
  for (const name of ['runImpl', 'synthOpen', 'checkUcfFile', 'stopProcesses']) assert.match(read('processes.js'), new RegExp(`\\b${name}\\(`), name);
});

test('#405 drawings.js: the drawings\' editors and their HDL synchronization left app.js', () => {
  const code = readPart('drawings.js');
  for (const s of ["import('./asm-editor.js')", "import('./truthtable.js')", "import('./fsm-editor.js')", "import('./petri-editor.js')"])
    assert.ok(code.includes(s) && !app.includes(s), s);
  // the names other modules took from app.js come from drawings.js now
  assert.deepEqual(importedFrom(read('project.js'), 'drawings.js'), ['drawingsAsBase', 'adoptDrawnHdl', 'drawnHdlClashes']);
  assert.deepEqual(importedFrom(read('implement.js'), 'drawings.js'), ['refreshOpenEditor', 'topUcfPorts', 'ucfPort']);
  for (const name of ['openTt', 'openFsm', 'openPetri', 'openSch', 'openAsm']) assert.match(app, new RegExp(`export const app = \\{[^}]*\\b${name}\\b`));
});

// every name a module imports from app.js or a module split out of it is exported there (a name that moved
// with a later part is imported from its new module)
test('#405 app.js split: the imports among app.js and its modules name what the other module exports', () => {
  const mods = ['app.js', ...MODULES];
  for (const mod of mods) {
    const code = read(mod);
    for (const other of mods) {
      if (other === mod) continue;
      const names = importedFrom(code, other) || [];
      const exported = new Set([...exportsOf(read(other)), ...(other === 'app.js' ? ['S', 'app'] : [])]);
      for (const name of names) assert.ok(exported.has(name), `${mod} imports ${name} from ${other}, which does not export it`);
    }
  }
});

test('#405 processes.js: the Processes panel, Check Syntax and the processes\' status left app.js', () => {
  const code = read('processes.js');
  for (const s of ["'build/silinx-status.json'", "'Design Summary/Reports'", 'Behavioral Check Syntax']) assert.ok(code.includes(s) && !app.includes(s), s);
  for (const name of ['renderProcesses', 'restoreImplStatus']) assert.ok(importedFrom(read('project.js'), 'processes.js').includes(name), name);
  assert.match(app, /export const app = \{[^}]*\brenderProcesses\b/);
});

// app.js's own one-letter helper ($ = getElementById) is not imported: a module that calls it defines its own
test('#405 app.js split: a module calling $() defines it', () => {
  for (const mod of MODULES) {
    const code = read(mod);
    if (/(?:^|[^\w.$])\$\(/m.test(code)) assert.match(code, /^const \$ = id => document\.getElementById\(id\);$/m, mod);
  }
});

test('#405 design.js: the Design pane, its context menus, Set as Top Module and the project\'s saves left app.js', () => {
  const code = read('design.js');
  for (const s of ["$('hier')", 'let projectSaves = Promise.resolve()']) assert.ok(code.includes(s) && !app.includes(s), s);
  for (const name of ['renderHierarchy', 'saveProjectJson', 'setTop']) assert.match(app, new RegExp(`export const app = \\{[^}]*\\b${name}\\b`), name);
});

test('#405 menus.js: the menu bar, the toolbar, the command palette, printing and the project zip left app.js', () => {
  const code = read('menus.js');
  for (const s of ["menuBar($('menubar')", 'function exportProjectZip(', 'function openBundle(']) assert.ok(code.includes(s) && !app.includes(s), s);
  // app.js's boot still sets them up
  for (const name of ['setupMenus', 'setupToolbar']) assert.match(app, new RegExp(`\\b${name}\\(\\)`), name);
});

test('#405 viewers.js: the RTL and technology schematics, ISim and the Board Emulator left app.js', () => {
  const code = read('viewers.js');
  for (const s of ["import('./isim.js')", "import('./emulator.js')", 'function offerSimModel(']) assert.ok(code.includes(s) && !app.includes(s), s);
  for (const name of ['runSimulation']) assert.match(app, new RegExp(`export const app = \\{[^}]*\\b${name}\\b`), name);
});

test('#405 rename.js: Rename Symbol and renaming a source left app.js', () => {
  const code = read('rename.js');
  for (const s of ['renameSymbolAtCursor(', 'renameModuleInSource(']) assert.ok(code.includes(s) && !app.includes(s), s);
  assert.ok(importedFrom(read('design.js'), 'rename.js').includes('renameDialog'));
});

// A module uses no name of app.js's world (app.js's and the modules' top-level names, what they import) without
// importing or defining it: the first runs of the UI tests caught such a name only once its code ran. `t` is a
// local name of several functions (a truth table, a text), not i18n's t, which none of the modules uses.
const LOCAL_NAMES = new Set(['t']);
const imported = code => new Set([...code.matchAll(/^import (?:\{([^}]*)\}|\* as ([\w$]+)|([\w$]+)) from/gm)]
  .flatMap(m => (m[1] ? m[1].split(',').map(x => x.trim().split(' as ').pop().trim()).filter(Boolean) : [m[2] || m[3]])));
const topNames = code => new Set([...code.matchAll(/^(?:export )?(?:async )?(?:function\*? |const |let |var |class )([\w$]+)/gm)].map(m => m[1]));
const codeOnly = code => code.replace(/^import [^;]*;\n/gm, '').replace(/\/\/[^\n]*/g, '')
  .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, "''").replace(/\$\{/g, ' {').replaceAll('...', ' ');
// ($ only as a call: a regular expression's end of line is not one)
const usesName = (body, n) => (n === '$' ? /(?<![\w$.])\$\(/.test(body)
  : new RegExp(`(?<![\\w$.])${n}(?![\\w$])(?!\\s*:(?!:))`).test(body));

test('#405 app.js split: every name of app.js\'s world a module uses is imported or defined there', () => {
  const mods = ['app.js', ...MODULES];
  const known = new Set(mods.flatMap(m => { const c = read(m); return [...topNames(c), ...imported(c)]; }));
  for (const mod of mods) {
    const code = read(mod), have = new Set([...topNames(code), ...imported(code)]), body = codeOnly(code);
    const missing = [...known].filter(n => !have.has(n) && !LOCAL_NAMES.has(n) && usesName(body, n));
    assert.deepEqual(missing, [], `${mod} uses names it neither imports nor defines`);
  }
  // the check finds one, a spread and a namespace's member included
  assert.equal(usesName(codeOnly('const a = [...primitiveSources(x)];'), 'primitiveSources'), true);
  assert.equal(usesName(codeOnly('wiz.newSourceWizard();'), 'wiz'), true);
  assert.equal(usesName(codeOnly("x = { icon: 'wave' }; y = `${a}`; // log(z)"), 'icon'), false);
  assert.equal(usesName(codeOnly('x = `${a}`; y = /a$/;'), '$'), false);
  assert.equal(usesName(codeOnly("$('hier').focus();"), '$'), true);
});
