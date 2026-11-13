// HDL source editor built on CodeMirror 6 (its ES modules: the import map of web/index.html, bundled
// in the standalone edition): syntax highlighting, context-aware auto-complete, language templates
// (snippets), live lint from the Silinx parsers with quick fixes (in the lint tooltip, a click on its
// marker, Ctrl+.), hover info, go-to-definition, rename symbol (F2, web/js/refactor.js), folding,
// comment toggling, search.
import { EditorState, StateEffect, StateField, Compartment, Transaction } from '@codemirror/state';
import { EditorView, Decoration, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { StreamLanguage, syntaxHighlighting, bracketMatching, foldGutter, foldService, foldCode, indentUnit } from '@codemirror/language';
import { history, historyKeymap, defaultKeymap, undo, redo, undoDepth, redoDepth, toggleComment, indentMore, indentLess, selectAll } from '@codemirror/commands';
import { search, searchKeymap, openSearchPanel, closeSearchPanel, searchPanelOpen, findNext, gotoLine as gotoLinePanel, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { linter, lintGutter, setDiagnostics as showDiagnostics } from '@codemirror/lint';
import { tags, tagHighlighter } from '@lezer/highlight';
import { vhdl } from '@codemirror/legacy-modes/mode/vhdl';
import { verilog } from '@codemirror/legacy-modes/mode/verilog';
import { c } from '@codemirror/legacy-modes/mode/clike';
import { checkC } from '/core/c-check.js';
import { parse as parseVerilog } from '/core/verilog/parser.js';
import { parse as parseVhdl } from '/core/vhdl/parser.js';
import { quickFixes } from '/core/quickfix.js';
import { hintTooltip } from './diaghelp.js';
import { t, getLanguage, onLanguageChange } from './i18n.js';
import { EDITOR_PHRASES_PT } from './i18n-editor.js';
import { popupMenu, message } from './ui.js';
import { esc } from './dom.js';
import { mountCompletion } from './editor-complete.js';
import { cSnippets } from './c-templates.js';
import { exprShort, typeText } from '/core/type-text.js';
import { genChain } from '/core/util.js';
import { statusLine } from './status-line.js';
import { peersField, peerSetter } from './editor-peers.js';

/** A source's Language Templates: an HDL's (SNIPPETS), a C or C++ one's (web/js/c-templates.js, #1855), else none. */
export const snippetsFor = (lang, path) => (lang === 'c' ? cSnippets(path) : SNIPPETS[lang] || null);
// Language templates (ISE "Language Templates"). ${1}/${0} style placeholders: the cursor goes to `$0`.
export const SNIPPETS = {
  vhdl: [
    { name: 'entity', text: 'entity ${name} is\n  port (\n    clk : in  std_logic;\n    rst : in  std_logic;\n    $0\n  );\nend ${name};\n' },
    { name: 'architecture', text: 'architecture Behavioral of ${name} is\nbegin\n  $0\nend Behavioral;\n' },
    { name: 'process (clocked, async reset)', text: 'process (clk, rst)\nbegin\n  if rst = \'1\' then\n    $0\n  elsif rising_edge(clk) then\n    \n  end if;\nend process;\n' },
    { name: 'process (clocked, sync reset)', text: 'process (clk)\nbegin\n  if rising_edge(clk) then\n    if rst = \'1\' then\n      $0\n    else\n      \n    end if;\n  end if;\nend process;\n' },
    { name: 'process (combinational)', text: 'process (all)\nbegin\n  $0\nend process;\n' },
    { name: 'if', text: 'if $0 then\n  \nend if;' },
    { name: 'if-elsif-else', text: 'if $0 then\n  \nelsif  then\n  \nelse\n  \nend if;' },
    { name: 'case', text: 'case $0 is\n  when "00" =>\n    \n  when others =>\n    null;\nend case;' },
    { name: 'for loop', text: 'for i in 0 to $0 loop\n  \nend loop;' },
    { name: 'with select', text: 'with $0 select\n  y <= "00" when "00",\n       "11" when others;' },
    { name: 'when else', text: 'y <= a when $0 else b;' },
    { name: 'signal', text: 'signal $0 : std_logic_vector(7 downto 0) := (others => \'0\');' },
    { name: 'FSM (enum + 2 processes)', text: 'type state_t is (IDLE, RUN, DONE);\nsignal state, next_state : state_t := IDLE;\n\n-- state register\nprocess (clk)\nbegin\n  if rising_edge(clk) then\n    if rst = \'1\' then state <= IDLE; else state <= next_state; end if;\n  end if;\nend process;\n\n-- next state logic\nprocess (all)\nbegin\n  next_state <= state;\n  case state is\n    when IDLE => $0\n    when RUN  => \n    when DONE => next_state <= IDLE;\n  end case;\nend process;\n' },
    { name: 'counter', text: 'signal cnt : unsigned(7 downto 0) := (others => \'0\');\n\nprocess (clk)\nbegin\n  if rising_edge(clk) then\n    if rst = \'1\' then\n      cnt <= (others => \'0\');\n    else\n      cnt <= cnt + 1;\n    end if;\n  end if;\nend process;$0' },
    { name: 'component instantiation', text: 'u0 : entity work.${name}\n  port map (\n    $0\n  );' },
    { name: 'clock process (testbench)', text: 'clk_process : process\nbegin\n  clk <= \'0\'; wait for CLK_PERIOD/2;\n  clk <= \'1\'; wait for CLK_PERIOD/2;\nend process;$0' },
    { name: 'assert', text: 'assert $0 report "message" severity error;' },
    { name: 'report', text: 'report "$0" severity note;' },
    { name: 'libraries', text: 'library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n$0' },
  ],
  verilog: [
    { name: 'module', text: 'module ${name} (\n  input  wire clk,\n  input  wire rst,\n  $0\n);\n\nendmodule\n' },
    { name: 'always (clocked, async reset)', text: 'always @(posedge clk or posedge rst) begin\n  if (rst) begin\n    $0\n  end else begin\n    \n  end\nend' },
    { name: 'always (clocked)', text: 'always @(posedge clk) begin\n  $0\nend' },
    { name: 'always (combinational)', text: 'always @(*) begin\n  $0\nend' },
    { name: 'assign', text: 'assign $0 = ;' },
    { name: 'if-else', text: 'if ($0) begin\n  \nend else begin\n  \nend' },
    { name: 'case', text: 'case ($0)\n  2\'b00: ;\n  default: ;\nendcase' },
    { name: 'for loop', text: 'for (i = 0; i < $0; i = i + 1) begin\n  \nend' },
    { name: 'FSM (localparam + 2 always)', text: 'localparam IDLE = 2\'d0, RUN = 2\'d1, DONE = 2\'d2;\nreg [1:0] state, next_state;\n\nalways @(posedge clk)\n  if (rst) state <= IDLE; else state <= next_state;\n\nalways @(*) begin\n  next_state = state;\n  case (state)\n    IDLE: $0\n    RUN:  ;\n    DONE: next_state = IDLE;\n    default: next_state = IDLE;\n  endcase\nend\n' },
    { name: 'counter', text: 'reg [7:0] cnt;\nalways @(posedge clk)\n  if (rst) cnt <= 8\'d0;\n  else     cnt <= cnt + 1\'b1;$0' },
    { name: 'generate for', text: 'genvar i;\ngenerate\n  for (i = 0; i < $0; i = i + 1) begin : gen\n    \n  end\nendgenerate' },
    { name: 'instantiation', text: '${name} u0 (\n  $0\n);' },
    { name: 'initial (testbench)', text: 'initial begin\n  $0\n  #100;\n  $finish;\nend' },
    { name: 'clock (testbench)', text: 'always #5 clk = ~clk;$0' },
    { name: 'display', text: '$display("t=%0t  $0", $time);' },
    { name: 'function', text: 'function [7:0] $0;\n  input [7:0] x;\n  begin\n    \n  end\nendfunction' },
  ],
};

// ------------------------------------------------------------------ type text helpers (core/type-text.js, #2674)
export { typeText };

// Collect the symbols declared in a parsed file (for completion and hover).
function symbolsOf(parsed, lang) {
  const syms = new Map();
  const add = (name, kind, detail, loc) => { if (name && !syms.has(name)) syms.set(name, { name, kind, detail, loc }); };
  const visitItems = items => {
    for (const it of items || []) {
      if (it.kind === 'instance') add(it.name, 'instance', `instance of ${it.module}`, it.loc);
      if (it.kind === 'process' && it.label) add(it.label, 'process', 'process', it.loc);
      if (it.kind === 'generate_for') { add(it.var, 'genvar', 'generate variable', it.loc); visitDecls(it.decls); visitItems(it.items); }
      if (it.kind === 'generate_if') for (const g of genChain(it)) { visitDecls(g.decls); visitItems(g.then); if (!g.elseChain) visitItems(g.else); }
      if (it.kind === 'process') visitDecls(it.decls);
    }
  };
  const visitDecls = decls => {
    for (const d of decls || []) {
      if (d.kind === 'signal') add(d.name, d.net === 'variable' ? 'variable' : 'signal', typeText(d.type, lang), d.loc);
      else if (d.kind === 'const') add(d.name, 'constant', typeText(d.type, lang), d.loc);
      else if (d.kind === 'type') {
        add(d.name, 'type', typeText(d.type, lang), d.loc);
        if (d.type.kind === 'enum') d.type.values.forEach(v => add(v, 'enum', `literal of ${d.name}`, d.loc));
      } else if (d.kind === 'function' || d.kind === 'task') add(d.name, d.kind, `${d.kind}(${d.params.map(p => p.name).join(', ')})`, d.loc);
    }
  };
  for (const u of parsed.units || []) {
    if (u.kind === 'module') {
      for (const p of u.params) add(p.name, 'generic', p.default ? `= ${exprShort(p.default)}` : '', u.loc);
      for (const p of u.ports) add(p.name, 'port', `${p.dir} ${typeText(p.type, lang)}`, p.loc);
    }
    visitDecls(u.decls);
    visitItems(u.items);
  }
  return syms;
}

// ------------------------------------------------------------------ languages
// the legacy modes' token names as classes (tok-*), coloured by web/css/app.css and silinx.css
const highlighter = tagHighlighter([
  { tag: tags.keyword, class: 'tok-keyword' },
  { tag: tags.standard(tags.variableName), class: 'tok-builtin' },
  { tag: tags.typeName, class: 'tok-type' },
  { tag: tags.atom, class: 'tok-atom' },
  { tag: tags.number, class: 'tok-number' },
  { tag: [tags.string, tags.special(tags.string)], class: 'tok-string' },
  { tag: tags.comment, class: 'tok-comment' },
  { tag: tags.meta, class: 'tok-meta' },
  { tag: tags.definition(tags.variableName), class: 'tok-def' },
  { tag: tags.special(tags.variableName), class: 'tok-variable2' },
]);

// Simple UCF highlighting mode.
const ucf = {
  name: 'ucf',
  token(stream) {
    if (stream.match('#')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match(/^"[^"]*"/)) return 'string';
    if (stream.match(/^(NET|INST|TIMESPEC|TIMEGRP|PIN|CONFIG)\b/i)) return 'keyword';
    if (stream.match(/^(LOC|IOSTANDARD|PERIOD|TNM_NET|PULLUP|PULLDOWN|KEEPER|DRIVE|SLEW|CLOCK_DEDICATED_ROUTE|HIGH|LOW|FAST|SLOW)\b/i)) return 'builtin';
    if (stream.match(/^\d+(\.\d+)?\s*(ns|ps|us|MHz|%)?/i)) return 'number';
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: '#' } },
};
const LANGUAGES = {};
const languageOf = lang => {
  const mode = { vhdl, verilog, ucf, c }[lang];   // (c: Silinx HLS, #1524)
  return mode ? (LANGUAGES[lang] ??= StreamLanguage.define(mode)) : [];
};

// folding by indentation: a line folds up to the last following line indented deeper than it
const indentOf = s => s.match(/^\s*/)[0].replace(/\t/g, '  ').length;
const indentFold = foldService.of((state, from) => {
  const line = state.doc.lineAt(from);
  if (!line.text.trim()) return null;
  const ind = indentOf(line.text);
  let last = null;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const l = state.doc.line(n);
    if (!l.text.trim()) continue;
    if (indentOf(l.text) <= ind) break;
    last = l;
  }
  return last ? { from: line.to, to: last.to } : null;
});

// the line of a jump (gotoLine) flashes for a moment
const flashLine = StateEffect.define();
const flashField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(flashLine)) deco = e.value == null ? Decoration.none : Decoration.set([Decoration.line({ class: 'xl-flash-line' }).range(e.value)]);
    return deco;
  },
  provide: f => EditorView.decorations.from(f),
});

// the lines a timing path goes through (#3178, Show Path): marked until another path or none; faint once the file is
// edited (the analysis was of the design before the edit), the marks following the text
const pathLines = StateEffect.define();
const pathMark = (stale) => Decoration.line(stale ? { class: 'xl-path-line xl-path-stale', attributes: { title: t('From the timing analysis before this edit') } } : { class: 'xl-path-line' });
const pathField = StateField.define({
  create: () => ({ deco: Decoration.none, stale: false }),
  update(v, tr) {
    let { deco, stale } = v;
    deco = deco.map(tr.changes);
    if (tr.docChanged && !stale && deco.size) {
      const at = [];
      deco.between(0, tr.state.doc.length, from => { at.push(from); });
      deco = Decoration.set(at.map(a => pathMark(true).range(a)));
      stale = true;
    }
    for (const e of tr.effects) if (e.is(pathLines)) { deco = Decoration.set(e.value.map(at => pathMark(false).range(at))); stale = false; }
    return deco === v.deco && stale === v.stale ? v : { deco, stale };
  },
  provide: f => EditorView.decorations.from(f, v => v.deco),
});

/** Mark these lines of an editor (createEditor's; 1-based; none: unmarked), the first one scrolled into view (a timing
 *  path's, #3178); markedLines: the lines marked; marksStale: whether the file was edited since. */
export function markLines({ view }, lines = []) {
  const doc = view.state.doc, at = [...new Set(lines)].filter(l => l >= 1 && l <= doc.lines).sort((x, y) => x - y).map(l => doc.line(l).from);
  view.dispatch({ effects: [pathLines.of(at), ...(at.length ? [EditorView.scrollIntoView(at[0], { y: 'center' })] : [])] });
}
export function markedLines({ view }) {
  const out = [];
  view.state.field(pathField).deco.between(0, view.state.doc.length, from => { out.push(view.state.doc.lineAt(from).number); });
  return out;
}
export const marksStale = ({ view }) => view.state.field(pathField).stale;

// the texts of the editor's own panels (search, go to line, folding), in the interface's language
const phrases = () => (getLanguage() === 'pt' ? EDITOR_PHRASES_PT : {});

/** The parse of a source for the lint and the symbols: VHDL, Verilog, or Silinx HLS (its checks' messages as the parse
 *  errors, #1524). */
function parseSource(lang, text, path) {
  if (lang === 'c') return { units: [], errors: checkC(text, path).diagnostics };
  try { return (lang === 'vhdl' ? parseVhdl : parseVerilog)(text, path); }
  catch (e) { return { units: [], errors: [{ line: 1, col: 1, message: 'parser crashed: ' + e.message, severity: 'error' }] }; }
}

// ------------------------------------------------------------------ editor factory
// a text editor's status line (#2763): { el, show(pos) }, the cursor's line and column (0-based pos) and the language
function cursorStatus(lang, path) {
  const name = { vhdl: 'VHDL', verilog: /\.sv$/i.test(path) ? 'SystemVerilog' : 'Verilog', ucf: 'UCF',
    c: /\.(cpp|cc|cxx|hpp|hh)$/i.test(path) ? 'C++' : 'C' }[lang] || 'Text';
  const st = statusLine();
  return { el: st.el, show: (p) => st.set([{ text: `Ln ${p.line + 1}, Col ${p.ch + 1}`, cls: 'pos' }, name]) };
}

export function createEditor(container, { text = '', lang = 'verilog', path = '', readOnly = false, project = () => null, onChange, onSave, onGotoDefinition, onCursor, onRename, onFix } = {}) {
  // (onChange({ user }): user says whether the change was the user's own in the editor, #534)
  let parsed = { units: [], errors: [] }, syms = new Map(), parsedDoc = null;   // (parsedDoc: the text parsed)
  let externalDiags = [];
  let anns = [];   // the lint annotations shown (with their diagnostic: d), their lines 0-based
  let view = null;

  // positions as { line, ch } (0-based), as the rest of the app counts them
  const posOf = off => { const l = view.state.doc.lineAt(off); return { line: l.number - 1, ch: off - l.from }; };
  const offsetOf = ({ line, ch }) => {
    const doc = view.state.doc, l = doc.line(Math.min(doc.lines, Math.max(1, line + 1)));
    return l.from + Math.min(l.length, Math.max(0, ch));
  };
  const lineText = line => (line >= 0 && line < view.state.doc.lines ? view.state.doc.line(line + 1).text : '');
  const getCursor = () => posOf(view.state.selection.main.head);
  const status = cursorStatus(lang, path), showPos = () => status.show(getCursor());   // (the caller puts it under the editor)
  const setCursor = pos => view.dispatch({ selection: { anchor: offsetOf(pos) }, scrollIntoView: true });
  const posAt = (x, y) => { const off = view.posAtCoords({ x, y }, false); return posOf(off); };
  const lineAtY = y => view.state.doc.lineAt(view.lineBlockAtHeight(y - view.documentTop).from).number - 1;

  const reparse = () => {
    if (lang !== 'vhdl' && lang !== 'verilog' && lang !== 'c') return;
    parsedDoc = view.state.doc;
    parsed = parseSource(lang, parsedDoc.toString(), path);
    syms = symbolsOf(parsed, lang);
  };

  const lintAnnotations = () => {
    // (a lint forced by the app right after an edit comes before the reparse of the edit's timer)
    if (parsedDoc !== view.state.doc) reparse();
    const out = [];
    const mk = (d, src) => {
      const line = Math.min(view.state.doc.lines - 1, Math.max(0, (d.line || 1) - 1));
      const lt = lineText(line);
      const ch = Math.min(lt.length, Math.max(0, (d.col || 1) - 1));
      let end = ch;
      while (end < lt.length && /[\w$]/.test(lt[end])) end++;
      if (end === ch) end = Math.min(lt.length, ch + 1);
      const from = offsetOf({ line, ch }), to = offsetOf({ line, ch: end });
      out.push({ from, to, line, message: `${src}${d.message}${hintTooltip(d)}`, severity: d.severity === 'warning' ? 'warning' : 'error', diag: d });
    };
    const seen = new Set();
    for (const d of [...(parsed.errors || []), ...externalDiags]) {
      const k = `${d.line}:${d.message}`;
      if (seen.has(k)) continue;
      seen.add(k); mk(d, '');
    }
    anns = out;
    return out.map(({ from, to, severity, message }) => ({ from, to, severity, message }));
  };

  // (the linter runs on the edits only: new diagnostics of the app are shown at once)
  const lintNow = () => { if (lints) view.dispatch(showDiagnostics(view.state, lintAnnotations())); };

  // ---- quick fixes of the errors (core/quickfix.js): in the lint tooltip, on a click on the
  // marker of the line, with Ctrl+. (Cmd+.) on the line; one undoable edit, then the lint runs again
  const modules = () => (project()?.modules || []).map(m => ({ name: m.name, ports: (m.portList || []).map(p => p.name), params: m.paramList || [] }));
  // (a read-only editor, the HDL generated from a drawing (#1176): no fixes, no rename, no completion, no Tab)
  const ro = () => view.state.readOnly;
  const fixesOf = d => (d && !ro() ? quickFixes(view.state.doc.toString(), lang, d, { modules: modules() }) : []);
  const fixLabel = f => `${t('Fix:')} ${t(f.title)}`;
  /** Replace ranges [{ from: { line, ch }, to, text }] of the current text in one undoable step. */
  function replaceRanges(edits, userEvent = 'input') {
    if (ro()) return;
    view.dispatch({ changes: edits.map(e => ({ from: offsetOf(e.from), to: offsetOf(e.to), insert: e.text })), userEvent });
  }
  function applyFix(fix) {
    if (ro()) return;
    replaceRanges(fix.edits.map(e => ({ from: { line: e.line - 1, ch: e.col - 1 }, to: { line: (e.endLine ?? e.line) - 1, ch: (e.endCol ?? e.col) - 1 }, text: e.text })), 'input.quickfix');
    hideLintTip();
    view.focus();
    onFix?.(fix);
  }
  function fixesOnLine(line) {
    const out = [], seen = new Set();
    for (const a of anns.filter(x => x.line === line)) {
      for (const f of fixesOf(a.diag)) if (!seen.has(f.title)) { seen.add(f.title); out.push(f); }
    }
    return out;
  }
  function showFixMenu(line = getCursor().line, at = null) {
    const fixes = fixesOnLine(line);
    if (!fixes.length) { message('No quick fix here.'); return; }
    const c = at || view.coordsAtPos(line === getCursor().line ? view.state.selection.main.head : offsetOf({ line, ch: 0 }));
    popupMenu(fixes.map(f => ({ label: `Fix: ${f.title}`, action: () => applyFix(f) })), c.left, c.bottom);
  }

  // the lint tooltip: the messages with their help and their fixes (buttons)
  // It opens just above the pointer (its bottom-left corner there, not covering what is pointed
  // at): the pointer goes from the marker into it without crossing anything else, and it closes
  // as soon as the pointer is on neither.
  let lintTip = null, lintTipFor = null;
  function hideLintTip() {
    lintTipFor?.removeEventListener('mouseout', leave);
    lintTip?.remove();
    lintTip = lintTipFor = null;
  }
  function leave(e) { if (!(lintTip?.contains(e.relatedTarget) || lintTipFor?.contains(e.relatedTarget))) hideLintTip(); }
  function showLintTip(ev, target, list) {
    if (lintTip && lintTipFor === target && lintTip.isConnected) return;
    hideLintTip();
    const tt = document.createElement('div');
    tt.className = 'xl-lint-tip';
    for (const a of list) {
      const m = document.createElement('div');
      m.className = `xl-lint-msg xl-lint-msg-${a.severity}`;
      m.setAttribute('data-no-i18n', '');
      m.textContent = a.message;
      tt.append(m);
      for (const f of fixesOf(a.diag)) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'xl-fix'; b.setAttribute('data-no-i18n', '');
        b.textContent = fixLabel(f);
        b.addEventListener('click', e => { e.preventDefault(); applyFix(f); });
        tt.append(b);
      }
    }
    document.body.append(tt);
    tt.style.left = `${Math.max(0, Math.min(ev.clientX - 4, innerWidth - tt.offsetWidth))}px`;
    tt.style.top = `${Math.max(0, ev.clientY - tt.offsetHeight - 1)}px`;
    tt.addEventListener('mouseout', leave);
    target.addEventListener('mouseout', leave);
    lintTip = tt; lintTipFor = target;
  }

  // ---- completion (editor-complete.js)
  const { completions, insertSnippet, renderKind } = mountCompletion({
    lang, path, project, syms: () => syms, view: () => view
  });

  // ---- keys
  function insertSoftTab(v) {
    if (ro()) return true;
    const sel = v.state.selection.main;
    const col = sel.head - v.state.doc.lineAt(sel.head).from;
    v.dispatch(v.state.replaceSelection(' '.repeat(2 - (col % 2))), { userEvent: 'input' });
    return true;
  }
  const keys = [
    { key: 'Mod-s', run: () => { onSave?.(); return true; } },
    { key: 'Mod-/', run: toggleComment },
    { key: 'Ctrl-q', run: foldCode },
    { key: 'Mod-f', run: openSearchPanel }, { key: 'Mod-Alt-f', run: openSearchPanel }, { key: 'Ctrl-h', run: openSearchPanel },
    { key: 'Cmd-g', run: findNext }, { key: 'Ctrl-g', run: gotoLinePanel },
    { key: 'F12', run: v => { gotoDef(getCursor()); return true; } },
    { key: 'F2', run: () => { if (!ro()) onRename?.(); return true; } },
    { key: 'Mod-.', run: () => { if (!ro()) showFixMenu(); return true; } },
    { key: 'Tab', run: v => (v.state.selection.ranges.some(r => !r.empty) ? indentMore(v) : insertSoftTab(v)), shift: indentLess },
  ];

  const lints = lang === 'vhdl' || lang === 'verilog' || lang === 'ucf' || lang === 'c';
  const phrasing = new Compartment(), readOnliness = new Compartment();
  view = new EditorView({
    parent: container,
    state: EditorState.create({
      doc: text,
      extensions: [
        // (the tooltips are the editor's own, below: they stay while the pointer is on them, for their fixes)
        lints ? [linter(() => lintAnnotations(), { delay: 400, tooltipFilter: () => [] }), lintGutter({ tooltipFilter: () => [] })] : [],
        lineNumbers(), foldGutter(), indentFold, highlightActiveLineGutter(),
        history(), drawSelection(), highlightActiveLine(), bracketMatching(), closeBrackets(),
        highlightSelectionMatches({ wholeWords: true }), search({ top: true }), flashField, pathField, peersField,
        languageOf(lang), syntaxHighlighting(highlighter), EditorView.editorAttributes.of({ class: 'xl-editor' }),
        indentUnit.of('  '), EditorState.tabSize.of(2), readOnliness.of(EditorState.readOnly.of(readOnly)), phrasing.of(EditorState.phrases.of(phrases())),
        lang === 'vhdl' || lang === 'verilog' ? autocompletion({ override: [ctx => (ro() ? null : completions(ctx))], icons: false, maxRenderedOptions: 200, addToOptions: [{ render: renderKind, position: 20 }] }) : [],
        keymap.of([...keys, ...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap]),
        EditorView.updateListener.of(u => {
          if (u.docChanged) {
            hideLintTip();
            clearTimeout(changeTimer);
            changeTimer = setTimeout(() => { reparse(); }, 250);
            // (user: the change is the user's own, typed, pasted, dropped, undone or redone here, a fix or a
            // snippet of theirs; false: written by setValue, as a command or an Undo of the project writes)
            onChange?.({ user: u.transactions.some(tr => !!tr.annotation(Transaction.userEvent)) });
          }
          if (u.selectionSet) { const p = getCursor(); showPos(); onCursor?.(p.line + 1, p.ch + 1); }
        }),
      ],
    }),
  });
  let changeTimer = null;
  let cleanDoc = view.state.doc;
  reparse(); showPos();
  // another language: the editor's own texts, and the help of the lint messages
  const offLang = onLanguageChange(() => { view.dispatch({ effects: phrasing.reconfigure(EditorState.phrases.of(phrases())) }); lintNow(); });

  view.dom.addEventListener('mousedown', ev => {
    // a click on the marker of a line: its fixes
    if (ev.button === 0 && ev.target.closest?.('.cm-gutter-lint')) { ev.preventDefault(); showFixMenu(lineAtY(ev.clientY), { left: ev.clientX, bottom: ev.clientY }); return; }
    // go to definition (Cmd/Ctrl + click)
    if (!(ev.metaKey || ev.ctrlKey) || !ev.target.closest?.('.cm-content')) return;
    ev.preventDefault();
    gotoDef(posAt(ev.clientX, ev.clientY));
  });
  view.dom.addEventListener('mouseover', ev => {
    const el = ev.target;
    const marker = el.closest?.('.cm-lint-marker');
    if (marker) {
      const line = lineAtY(ev.clientY);
      const list = anns.filter(a => a.line === line);
      if (list.length) showLintTip(ev, marker, list);
    } else if (el.closest?.('.cm-lintRange')) {
      const mark = el.closest('.cm-lintRange'), b = mark.getBoundingClientRect();
      const off = view.posAtCoords({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 }, false);
      const list = anns.filter(a => a.from <= off && off <= a.to);
      if (list.length) showLintTip(ev, mark, list);
    }
  });

  // ---- hover info
  const tip = document.createElement('div');
  tip.className = 'xl-hover-tip';
  tip.style.display = 'none';
  document.body.appendChild(tip);
  let hoverTimer = null;
  view.dom.addEventListener('mousemove', ev => {
    clearTimeout(hoverTimer);
    tip.style.display = 'none';
    if (!ev.target.closest?.('.cm-content')) return;
    hoverTimer = setTimeout(() => {
      const word = wordAt(posAt(ev.clientX, ev.clientY));
      if (!word) return;
      const info = lookupSym(word);
      if (!info) return;
      tip.innerHTML = `<b>${esc(info.name)}</b> <span class="k">${esc(info.kind)}</span>${info.detail ? `<div class="d">${esc(info.detail)}</div>` : ''}`;
      tip.style.left = `${ev.clientX + 12}px`;
      tip.style.top = `${ev.clientY + 14}px`;
      tip.style.display = 'block';
    }, 450);
  });
  view.dom.addEventListener('mouseleave', () => { clearTimeout(hoverTimer); tip.style.display = 'none'; });

  function wordAt(pos) {
    const line = lineText(pos.line);
    let s = pos.ch, e = pos.ch;
    while (s > 0 && /[\w$]/.test(line[s - 1])) s--;
    while (e < line.length && /[\w$]/.test(line[e])) e++;
    return s < e ? line.slice(s, e) : null;
  }
  function lookupSym(word) {
    const key = lang === 'vhdl' ? word.toLowerCase() : word;
    if (syms.has(key)) return syms.get(key);
    const pj = project();
    const m = pj?.modules?.find(x => (x.lang === 'vhdl' ? x.name === word.toLowerCase() : x.name === word));
    if (m) return { name: m.name, kind: 'module', detail: `${m.file}${m.ports ? '\n' + m.ports : ''}`, module: m };
    return null;
  }

  // ---- go to definition (Cmd/Ctrl + click or F12)
  function gotoDef(pos) {
    const word = wordAt(pos);
    if (!word) return;
    const info = lookupSym(word);
    if (!info) return;
    if (info.module) onGotoDefinition?.({ file: info.module.file, line: info.module.line || 1 });
    else if (info.loc) setCursor({ line: info.loc.line - 1, ch: (info.loc.col || 1) - 1 });
  }

  // the editor's commands, by the names of the menus and buttons
  // (findToggle: the Find buttons, a second click closing the find bar, #1328)
  const COMMANDS = { undo, redo, selectAll, findPersistent: openSearchPanel, findToggle: v => (searchPanelOpen(v.state) ? closeSearchPanel(v) : openSearchPanel(v)),
    replace: openSearchPanel, jumpToLine: gotoLinePanel, toggleComment };

  return {
    view,
    status: status.el,   // (its status line's element, #2763)
    getValue: () => view.state.doc.toString(),
    setValue: v => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } }),
    focus: () => view.focus(),
    refresh: () => view.requestMeasure(),
    gotoLine(line, col = 1) {
      const off = offsetOf({ line: Math.max(0, line - 1), ch: Math.max(0, col - 1) });
      view.dispatch({ selection: { anchor: off }, effects: [flashLine.of(view.state.doc.lineAt(off).from), EditorView.scrollIntoView(off, { y: 'nearest', yMargin: 120 })] });
      setTimeout(() => view.dispatch({ effects: flashLine.of(null) }), 1500);
      view.focus();
    },
    setDiagnostics(diags) { externalDiags = diags || []; lintNow(); },
    /** Lint the text again now (the parser's errors and the diagnostics of setDiagnostics). */
    lintNow,
    insertText(s) { if (ro()) return; const at = view.state.selection.main.head; insertSnippet(s, at, at); view.focus(); },
    /** Read-only or editable again (setValue still writes it: the HDL generated from a drawing, #1176). */
    setReadOnly: v => view.dispatch({ effects: readOnliness.reconfigure(EditorState.readOnly.of(!!v)) }),
    readOnly: ro,
    markClean: () => { cleanDoc = view.state.doc; },
    isClean: () => view.state.doc.eq(cleanDoc),
    destroy() { offLang(); tip.remove(); hideLintTip(); view.destroy(); },
    /** The quick fixes of a diagnostic of this file (on the editor's text), and applying one. */
    quickFixes: d => fixesOf(d),
    applyFix, fixesOnLine, showFixMenu,
    exec: cmd => COMMANDS[cmd]?.(view),
    // the cursor, the selection and the history, positions as { line, ch } (0-based); the other participants' cursors (#3181)
    getCursor, setCursor, posAt, replaceRanges, setPeers: peerSetter(() => view, offsetOf),
    somethingSelected: () => view.state.selection.ranges.some(r => !r.empty),
    getSelection: () => view.state.selection.ranges.map(r => view.state.sliceDoc(r.from, r.to)).join('\n'),
    replaceSelection: s => !ro() && view.dispatch(view.state.replaceSelection(s), { userEvent: 'input', scrollIntoView: true }),
    historySize: () => ({ undo: undoDepth(view.state), redo: redoDepth(view.state) }),
    /** The lint annotations shown: [{ line (1-based), severity, message }]. */
    diagnostics: () => anns.map(a => ({ line: a.line + 1, severity: a.severity, message: a.diag.message })),
  };
}


// Instantiation template for a module (used by completion and Instantiate module).
export function instTemplate(m, lang) {
  const ports = m.portList || [];
  const params = m.paramList || [];
  if (lang === 'vhdl') {
    let s = `u_${m.name} : entity work.${m.name}\n`;
    if (params.length) s += `  generic map (\n${params.map(p => `    ${p} => ${p}`).join(',\n')}\n  )\n`;
    s += `  port map (\n${ports.map(p => `    ${p.name.padEnd(8)} => ${p.name}`).join(',\n')}\n  );`;
    return s;
  }
  let s = m.name;
  if (params.length) s += ` #(\n${params.map(p => `  .${p}(${p})`).join(',\n')}\n)`;
  s += ` u_${m.name} (\n${ports.map(p => `  .${p.name.padEnd(8)}(${p.name})`).join(',\n')}\n);`;
  return s;
}
