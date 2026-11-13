// The toasts of web/js (#3540, docs/UI-GUIDELINES.md: every message goes to the console, a toast only says an action was
// done): every toast's kind has a style, and no toast says that a file cannot be opened or read, nor a dialog's field
// error (beside the field); #3591: no toast is an error or a warning, nor a refusal (a line of the console).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web', 'js');

/** The arguments' source texts of every call of `name(` in src (strings, templates and nested calls skipped over). */
function callArgs(src, name) {
  const out = [];
  const re = new RegExp(`(?<![\\w.])${name}\\(`, 'g');
  for (const m of src.matchAll(re)) {
    const args = [];
    let depth = 0, cur = '', i = m.index + m[0].length;
    const stack = [];   // the quotes, templates and ${ open
    for (; i < src.length; i++) {
      const c = src[i];
      const top = stack[stack.length - 1];
      if (top === "'" || top === '"') { cur += c; if (c === '\\') cur += src[++i]; else if (c === top) stack.pop(); continue; }
      if (top === '`') {
        cur += c;
        if (c === '\\') cur += src[++i];
        else if (c === '`') stack.pop();
        else if (c === '$' && src[i + 1] === '{') { cur += src[++i]; stack.push('${'); }
        continue;
      }
      if (c === "'" || c === '"' || c === '`') { stack.push(c); cur += c; continue; }
      if (top === '${' && c === '}') { stack.pop(); cur += c; continue; }
      if (c === '{' && top === '${') { stack.push('{'); cur += c; continue; }
      if (c === '}' && top === '{') { stack.pop(); cur += c; continue; }
      if (c === '(' || c === '[' || (c === '{' && !stack.length)) { depth++; cur += c; continue; }
      if (c === ')' || c === ']' || (c === '}' && !stack.length)) {
        if (depth === 0 && c === ')') break;
        depth--; cur += c; continue;
      }
      if (c === ',' && depth === 0 && !stack.length) { args.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) args.push(cur.trim());
    out.push(args);
  }
  return out;
}

const toasts = () => fs.readdirSync(WEB).filter((f) => f.endsWith('.js') && f !== 'ui.js')
  .flatMap((f) => callArgs(fs.readFileSync(path.join(WEB, f), 'utf8'), 'toast').map((a) => ({ file: f, msg: a[0], kind: a[1] })));

test('callArgs: the arguments of each call, strings, templates and nested calls kept whole', () => {
  assert.deepEqual(callArgs("toast(`a, ${f(x, y)} b`, 'ok'); x.toast('no'); toast('it\\'s, so', 'error', 5000, { label: 'Undo', run: () => g(1, 2) });", 'toast'),
    [['`a, ${f(x, y)} b`', "'ok'"], ["'it\\'s, so'", "'error'", '5000', "{ label: 'Undo', run: () => g(1, 2) }"]]);
  assert.deepEqual(callArgs("toast(m)", 'toast'), [['m']]);
});

test('#3540 every toast\'s kind has a style (info, the toast\'s own, or a .toast-<kind> of the style sheets)', () => {
  const css = fs.readdirSync(path.join(ROOT, 'web', 'css')).map((f) => fs.readFileSync(path.join(ROOT, 'web', 'css', f), 'utf8')).join('\n');
  const styled = new Set(['info', ...[...css.matchAll(/\.toast-(\w+)\b/g)].map((m) => m[1])]);
  assert.ok(styled.has('error') && styled.has('ok'), [...styled].join(', '));
  const all = toasts();
  assert.ok(all.length > 20, `${all.length} toasts`);   // (#3591: the messages moved to the console)
  const bad = all.filter((x) => x.kind && !(/^'(\w+)'$/.test(x.kind) && styled.has(x.kind.slice(1, -1))) && !/^\w+ \? '\w+' : '\w+'$/.test(x.kind))
    .map((x) => `${x.file}: toast(${x.msg}, ${x.kind})`);
  assert.deepEqual(bad, []);
  // (a kind chosen at run time: both styled)
  for (const x of all.filter((y) => /\?/.test(y.kind || ''))) for (const k of x.kind.match(/'(\w+)'/g)) assert.ok(styled.has(k.slice(1, -1)), `${x.file}: ${x.kind}`);
});

test('#3540 no toast says a file cannot be opened or parsed, nor a check dialog\'s field error: the console, or beside the field', () => {
  const bad = toasts().filter((x) => /Cannot (open|parse)|e\.message, 'error'|time limit is|depth is|\bwhy\b/.test(`${x.msg}, ${x.kind}`)).map((x) => `${x.file}: ${x.msg}`);
  assert.deepEqual(bad, []);
  // the errors of opening a drawing or a file: logError, an ERROR line of the console with its Errors tab in front
  for (const f of ['app.js', 'drawings.js', 'drawings-tt.js', 'pinplanner.js']) assert.match(fs.readFileSync(path.join(WEB, f), 'utf8'), /logError\(`cannot (open|parse) \$\{/, f);
});

test('#3591 no toast of kind error or warning is left: the errors, warnings and refusals are lines of the console', () => {
  const all = toasts();
  assert.deepEqual(all.filter((x) => /'(error|warn\w*)'/.test(x.kind || '') || /\? '(error|warn\w*)'|'(error|warn\w*)' :/.test(x.kind || '')).map((x) => `${x.file}: toast(${x.msg}, ${x.kind})`), []);
  // the busy refusals, the menu action's error, Rename Symbol's refusals, the stimuli's save, the reference, the
  // commands that do nothing (no project, no top, no process running, no quick fix, no clipboard), Failed — see console
  const msgs = /Another operation|already running|being implemented|Failed — see console|no other module|Cannot save the stimuli|res\.error|at\.error|err\.message|Open a project first|Select the top module first|no module that can be the top|No process is running|No quick fix here|Use Ctrl\+V|^p\.title$/;
  assert.deepEqual(all.filter((x) => msgs.test(x.msg)).map((x) => `${x.file}: toast(${x.msg})`), []);
  // the menu's error and the editor's quick fix through ui.js's message, the app's console
  const ui = fs.readFileSync(path.join(WEB, 'ui.js'), 'utf8');
  assert.match(ui, /message\(`\$\{it\.label\}: \$\{err\.message \|\| err\}`, 'error'\)/);
  assert.match(fs.readFileSync(path.join(WEB, 'app.js'), 'utf8'), /setMessageSink\(\(text, level\) => \(level === 'error' \? logError : level === 'warning' \? logWarning : logInfo\)\(text\)\)/);
  const at = (f, re) => assert.match(fs.readFileSync(path.join(WEB, f), 'utf8'), re, f);
  at('impact.js', /logError\('Another operation is running'\)/);
  at('impact.js', /logError\('The design is being implemented: program it when it ends'\)/);
  at('program-ice40.js', /logError\('Another operation is running'\)/);
  at('implement.js', /logError\('An implementation is already running \(use Stop to cancel it\)'\)/);
  at('processes.js', /logError\('An implementation is already running \(use Stop to cancel it\)'\)/);
  at('refactor.js', /logError\(res\.error\)/);
  at('viewers.js', /logError\(`Cannot save the stimuli: \$\{e\.message\}`\)/);
  at('pinplanner.js', /logWarning\(`I\/O Pin Planning: /);
  at('verify.js', /logInfo\('The project has no other module to be the reference: add the reference module first'\)/);
});
