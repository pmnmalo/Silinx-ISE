// HDL source editor built on CodeMirror 5 (loaded globally as window.CodeMirror):
// syntax highlighting, context-aware auto-complete, language templates (snippets), live lint
// from the Silinx parsers, hover info, go-to-definition, folding, comment toggling, search.
import { parse as parseVerilog } from '/core/verilog/parser.js';
import { parse as parseVhdl } from '/core/vhdl/parser.js';
import { hintTooltip } from './diaghelp.js';

const CM = () => window.CodeMirror;

// ------------------------------------------------------------------ vocabulary
const VHDL_KW = `abs access after alias all and architecture array assert attribute begin block body buffer bus case component
configuration constant disconnect downto else elsif end entity exit file for function generate generic group guarded if impure in
inertial inout is label library linkage literal loop map mod nand new next nor not null of on open or others out package port
postponed procedure process pure range record register reject rem report return rol ror select severity signal shared sla sll sra srl
subtype then to transport type unaffected units until use variable wait when while with xnor xor`.split(/\s+/);
const VHDL_TYPES = `std_logic std_logic_vector std_ulogic std_ulogic_vector unsigned signed integer natural positive boolean bit bit_vector
time string real character`.split(/\s+/);
const VHDL_FUNCS = `rising_edge falling_edge to_unsigned to_signed to_integer resize std_logic_vector shift_left shift_right rotate_left
rotate_right conv_integer conv_std_logic_vector to_stdlogicvector now`.split(/\s+/);
const VHDL_LIBS = ['ieee', 'ieee.std_logic_1164.all', 'ieee.numeric_std.all', 'ieee.std_logic_unsigned.all', 'work', 'std.env.all'];

const VLOG_KW = `always and assign automatic begin buf case casex casez default defparam else end endcase endfunction endgenerate endmodule
endtask for forever function generate genvar if initial inout input integer localparam module nand negedge nor not or output parameter
posedge real reg repeat signed task time tri wait while wire xnor xor always_ff always_comb logic`.split(/\s+/);
const VLOG_SYS = `$display $write $monitor $strobe $finish $stop $time $realtime $random $urandom $signed $unsigned $clog2 $readmemh
$readmemb $dumpfile $dumpvars $error $warning $info $fatal`.split(/\s+/);

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

// ------------------------------------------------------------------ type text helpers
function rangeText(r, lang) {
  if (!r) return '';
  const t = e => exprShort(e);
  if (r.of) return `${t(r.of)}'range`;
  return lang === 'vhdl' ? `(${t(r.left)} ${r.dir || 'downto'} ${t(r.right)})` : `[${t(r.left)}:${t(r.right)}]`;
}
function exprShort(e) {
  if (!e) return '?';
  switch (e.op) {
    case 'int': return e.value;
    case 'ref': return e.name;
    case 'binary': return `${exprShort(e.a)}${e.o === '==' ? '=' : e.o}${exprShort(e.b)}`;
    case 'lit': return `"${e.bits}"`;
    case 'apply': return `${e.name}(..)`;
    case 'attr': return `${exprShort(e.prefix)}'${e.attr}`;
    default: return '…';
  }
}
export function typeText(ts, lang) {
  if (!ts) return '';
  switch (ts.kind) {
    case 'logic':
      if (lang === 'vhdl') return ts.range ? `${ts.signed ? 'signed' : 'std_logic_vector'}${rangeText(ts.range, lang)}` : 'std_logic';
      return `${ts.signed ? 'signed ' : ''}${ts.range ? rangeText(ts.range, lang) : '1 bit'}`;
    case 'integer': return ts.range ? `integer range ${exprShort(ts.range.left)} to ${exprShort(ts.range.right)}` : 'integer';
    case 'named': return ts.name + (ts.range ? rangeText(ts.range, lang) : '');
    case 'array': return `array ${rangeText(ts.range, lang)} of ${typeText(ts.elem, lang)}`;
    case 'enum': return `(${ts.values.join(', ')})`;
    default: return ts.kind;
  }
}

// Collect the symbols declared in a parsed file (for completion and hover).
function symbolsOf(parsed, lang) {
  const syms = new Map();
  const add = (name, kind, detail, loc) => { if (name && !syms.has(name)) syms.set(name, { name, kind, detail, loc }); };
  const visitItems = items => {
    for (const it of items || []) {
      if (it.kind === 'instance') add(it.name, 'instance', `instance of ${it.module}`, it.loc);
      if (it.kind === 'process' && it.label) add(it.label, 'process', 'process', it.loc);
      if (it.kind === 'generate_for') { add(it.var, 'genvar', 'generate variable', it.loc); visitDecls(it.decls); visitItems(it.items); }
      if (it.kind === 'generate_if') { visitDecls(it.decls); visitItems(it.then); visitItems(it.else); }
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

// ------------------------------------------------------------------ editor factory
export function createEditor(container, { text = '', lang = 'verilog', path = '', readOnly = false, project = () => null, onChange, onSave, onGotoDefinition, onCursor } = {}) {
  const CodeMirror = CM();
  const mode = lang === 'vhdl' ? 'vhdl' : lang === 'verilog' ? 'verilog' : lang === 'ucf' ? 'ucf' : 'text/plain';
  let parsed = { units: [], errors: [] }, syms = new Map();
  let externalDiags = [];

  const reparse = () => {
    if (lang !== 'vhdl' && lang !== 'verilog') return;
    try { parsed = (lang === 'vhdl' ? parseVhdl : parseVerilog)(cm.getValue(), path); }
    catch (e) { parsed = { units: [], errors: [{ line: 1, col: 1, message: 'parser crashed: ' + e.message, severity: 'error' }] }; }
    syms = symbolsOf(parsed, lang);
  };

  const lintAnnotations = () => {
    const out = [];
    const mk = (d, src) => {
      const line = Math.max(0, (d.line || 1) - 1);
      const lineText = cm.getLine(line) ?? '';
      const ch = Math.max(0, (d.col || 1) - 1);
      let end = ch;
      while (end < lineText.length && /[\w$]/.test(lineText[end])) end++;
      if (end === ch) end = Math.min(lineText.length, ch + 1);
      out.push({ from: CodeMirror.Pos(line, ch), to: CodeMirror.Pos(line, end), message: `${src}${d.message}${hintTooltip(d)}`, severity: d.severity === 'warning' ? 'warning' : 'error' });
    };
    const seen = new Set();
    for (const d of [...(parsed.errors || []), ...externalDiags]) {
      const k = `${d.line}:${d.message}`;
      if (seen.has(k)) continue;
      seen.add(k); mk(d, '');
    }
    return out;
  };

  const cm = CodeMirror(container, {
    value: text, mode, readOnly, lineNumbers: true, indentUnit: 2, tabSize: 2, indentWithTabs: false,
    matchBrackets: true, autoCloseBrackets: true, styleActiveLine: true, highlightSelectionMatches: { showToken: /\w/, annotateScrollbar: false },
    foldGutter: true, foldOptions: { rangeFinder: CodeMirror.fold.indent, widget: '…' },
    gutters: ['CodeMirror-lint-markers', 'CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    lint: lang === 'vhdl' || lang === 'verilog' || lang === 'ucf' ? { getAnnotations: () => lintAnnotations(), delay: 400 } : false,
    extraKeys: {
      'Ctrl-Space': c => showHint(c, true),
      'Cmd-S': () => onSave?.(), 'Ctrl-S': () => onSave?.(),
      'Cmd-/': c => toggleComment(c), 'Ctrl-/': c => toggleComment(c),
      'Ctrl-Q': c => c.foldCode(c.getCursor()),
      'Cmd-F': 'findPersistent', 'Ctrl-F': 'findPersistent', 'Cmd-Alt-F': 'replace', 'Ctrl-H': 'replace',
      'Cmd-G': 'findNext', 'Ctrl-G': 'jumpToLine',
      'F12': c => gotoDef(c),
      Tab: c => (c.somethingSelected() ? c.indentSelection('add') : c.execCommand('insertSoftTab')),
      'Shift-Tab': c => c.indentSelection('subtract'),
    },
  });
  cm.getWrapperElement().classList.add('xl-editor');
  reparse();

  function toggleComment(c) {
    c.toggleComment({ lineComment: lang === 'vhdl' ? '--' : lang === 'ucf' ? '#' : '//' });
  }

  // ---- completion
  function hintList(c) {
    const cur = c.getCursor();
    const token = c.getTokenAt(cur);
    const line = c.getLine(cur.line);
    let start = cur.ch, end = cur.ch;
    while (start > 0 && /[\w$.]/.test(line[start - 1])) start--;
    while (end < line.length && /[\w$]/.test(line[end])) end++;
    const word = line.slice(start, cur.ch);
    const lw = word.toLowerCase();
    const list = [];
    const seen = new Set();
    const push = (text, kind, detail, extra = {}) => {
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      if (lw && !key.startsWith(lw) && !(lw.length >= 2 && key.includes(lw))) return;
      seen.add(key);
      list.push({ text, displayText: text, kind, detail, render: renderItem, ...extra });
    };
    // project symbols in this file first
    for (const s of syms.values()) push(s.name, s.kind, s.detail);
    // modules/entities of the project
    const pj = project();
    for (const m of pj?.modules || []) {
      push(m.name, 'module', `${m.lang} ${m.kind || 'module'} (${m.file})`);
      if (lw && m.name.toLowerCase().startsWith(lw)) {
        list.push({ text: instTemplate(m, lang), displayText: `${m.name} — instantiate`, kind: 'snippet', detail: 'instantiation template', render: renderItem, snippet: true });
      }
    }
    if (lang === 'vhdl') {
      for (const k of VHDL_KW) push(k, 'keyword', '');
      for (const k of VHDL_TYPES) push(k, 'type', 'type');
      for (const k of VHDL_FUNCS) push(k, 'function', 'built-in');
      if (/use\s+[\w.]*$/i.test(line.slice(0, cur.ch))) for (const k of VHDL_LIBS) push(k, 'library', '');
    } else {
      for (const k of VLOG_KW) push(k, 'keyword', '');
      for (const k of VLOG_SYS) push(k, 'system', 'system task/function');
    }
    for (const s of SNIPPETS[lang] || []) {
      if (!lw || s.name.toLowerCase().startsWith(lw) || s.name.toLowerCase().split(/[\s(]/)[0].startsWith(lw))
        list.push({ text: s.text, displayText: s.name, kind: 'snippet', detail: 'template', render: renderItem, snippet: true });
    }
    // Ranking: exact prefix, then symbols, keywords, snippets
    const rank = { port: 0, signal: 0, variable: 0, constant: 1, generic: 1, enum: 1, type: 2, function: 2, module: 2, process: 3, instance: 3, genvar: 1, keyword: 4, system: 4, library: 4, snippet: 5, task: 2 };
    list.sort((a, b) => {
      const pa = a.displayText.toLowerCase().startsWith(lw) ? 0 : 1, pb = b.displayText.toLowerCase().startsWith(lw) ? 0 : 1;
      return pa - pb || (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || a.displayText.localeCompare(b.displayText);
    });
    const from = CodeMirror.Pos(cur.line, start), to = CodeMirror.Pos(cur.line, end);
    for (const it of list) if (it.snippet) it.hint = (cmi, data, item) => insertSnippet(cmi, item.text, from, to, word);
    return { list: list.slice(0, 200), from, to };
  }

  function renderItem(el, data, cur) {
    el.innerHTML = '';
    const k = document.createElement('span');
    k.className = `xl-hint-kind k-${cur.kind}`;
    k.textContent = { port: 'P', signal: 'S', variable: 'V', constant: 'C', generic: 'G', enum: 'E', type: 'T', function: 'f', task: 't', module: 'M', process: 'p', instance: 'I', keyword: 'k', system: '$', library: 'L', snippet: '❏', genvar: 'g' }[cur.kind] || '·';
    const n = document.createElement('span'); n.className = 'xl-hint-name'; n.textContent = cur.displayText;
    const d = document.createElement('span'); d.className = 'xl-hint-detail'; d.textContent = cur.detail || '';
    el.append(k, n, d);
  }

  function insertSnippet(c, text, from, to, word) {
    const name = (path.split('/').pop() || 'top').replace(/\.\w+$/, '');
    let t = text.replace(/\$\{name\}/g, name);
    const baseIndent = (c.getLine(from.line).match(/^\s*/) || [''])[0];
    t = t.split('\n').map((l, i) => (i ? baseIndent + l : l)).join('\n');
    const idx = t.indexOf('$0');
    t = t.replace('$0', '');
    c.replaceRange(t, from, to);
    if (idx >= 0) {
      const before = t.slice(0, idx).split('\n');
      const line = from.line + before.length - 1;
      const ch = (before.length === 1 ? from.ch : 0) + before[before.length - 1].length;
      c.setCursor(CodeMirror.Pos(line, ch));
    }
  }

  function showHint(c, explicit) {
    c.showHint({ hint: hintList, completeSingle: false, closeCharacters: /[\s()[\]{};:>,=]/, alignWithWord: true, explicit });
  }

  cm.on('inputRead', (c, ch) => {
    if (c.state.completionActive) return;
    const t = ch.text.join('');
    if (/^[\w$]$/.test(t)) {
      const cur = c.getCursor();
      const tok = c.getTokenAt(cur);
      if (tok.type === 'comment' || tok.type === 'string') return;
      const line = c.getLine(cur.line);
      let s = cur.ch; while (s > 0 && /[\w$]/.test(line[s - 1])) s--;
      if (cur.ch - s >= 2 || t === '$') showHint(c, false);
    }
  });

  // ---- hover info
  const tip = document.createElement('div');
  tip.className = 'xl-hover-tip';
  tip.style.display = 'none';
  document.body.appendChild(tip);
  let hoverTimer = null;
  cm.getWrapperElement().addEventListener('mousemove', ev => {
    clearTimeout(hoverTimer);
    tip.style.display = 'none';
    hoverTimer = setTimeout(() => {
      const pos = cm.coordsChar({ left: ev.clientX, top: ev.clientY }, 'window');
      const word = wordAt(pos);
      if (!word) return;
      let info = lookupSym(word);
      // diagnostics under the cursor take priority
      const marks = cm.findMarksAt(pos).filter(m => m.__annotation);
      let html = '';
      if (info) html += `<b>${esc(info.name)}</b> <span class="k">${info.kind}</span>${info.detail ? `<div class="d">${esc(info.detail)}</div>` : ''}`;
      if (!html) return;
      tip.innerHTML = html;
      tip.style.left = `${ev.clientX + 12}px`;
      tip.style.top = `${ev.clientY + 14}px`;
      tip.style.display = 'block';
    }, 450);
  });
  cm.getWrapperElement().addEventListener('mouseleave', () => { clearTimeout(hoverTimer); tip.style.display = 'none'; });

  function wordAt(pos) {
    const line = cm.getLine(pos.line) || '';
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
  function gotoDef(c, pos = c.getCursor()) {
    const word = wordAt(pos);
    if (!word) return;
    const info = lookupSym(word);
    if (!info) return;
    if (info.module) onGotoDefinition?.({ file: info.module.file, line: info.module.line || 1 });
    else if (info.loc) c.setCursor(CodeMirror.Pos(info.loc.line - 1, (info.loc.col || 1) - 1));
  }
  cm.getWrapperElement().addEventListener('mousedown', ev => {
    if (!(ev.metaKey || ev.ctrlKey)) return;
    const pos = cm.coordsChar({ left: ev.clientX, top: ev.clientY }, 'window');
    ev.preventDefault();
    gotoDef(cm, pos);
  });

  let changeTimer = null;
  cm.on('change', () => {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => { reparse(); }, 250);
    onChange?.();
  });
  cm.on('cursorActivity', c => { const p = c.getCursor(); onCursor?.(p.line + 1, p.ch + 1); });

  return {
    cm,
    getValue: () => cm.getValue(),
    setValue: v => cm.setValue(v),
    focus: () => cm.focus(),
    refresh: () => cm.refresh(),
    gotoLine(line, col = 1) {
      const pos = CodeMirror.Pos(Math.max(0, line - 1), Math.max(0, col - 1));
      cm.setCursor(pos);
      cm.scrollIntoView(pos, 120);
      cm.addLineClass(pos.line, 'background', 'xl-flash-line');
      setTimeout(() => cm.removeLineClass(pos.line, 'background', 'xl-flash-line'), 1500);
      cm.focus();
    },
    setDiagnostics(diags) { externalDiags = diags || []; cm.performLint?.(); },
    insertText(t) { insertSnippet(cm, t, cm.getCursor(), cm.getCursor(), ''); cm.focus(); },
    markClean: () => cm.markClean(),
    isClean: () => cm.isClean(),
    destroy() { tip.remove(); },
    exec: cmd => cm.execCommand(cmd),
  };
}

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Instantiation template for a module (used by completion and "View HDL Instantiation Template").
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

// Simple UCF highlighting mode.
export function defineUcfMode() {
  const CodeMirror = CM();
  if (!CodeMirror || CodeMirror.modes.ucf) return;
  CodeMirror.defineMode('ucf', () => ({
    token(stream) {
      if (stream.match('#')) { stream.skipToEnd(); return 'comment'; }
      if (stream.match(/^"[^"]*"/)) return 'string';
      if (stream.match(/^(NET|INST|TIMESPEC|TIMEGRP|PIN|CONFIG)\b/i)) return 'keyword';
      if (stream.match(/^(LOC|IOSTANDARD|PERIOD|TNM_NET|PULLUP|PULLDOWN|KEEPER|DRIVE|SLEW|CLOCK_DEDICATED_ROUTE|HIGH|LOW|FAST|SLOW)\b/i)) return 'builtin';
      if (stream.match(/^\d+(\.\d+)?\s*(ns|ps|us|MHz|%)?/i)) return 'number';
      stream.next();
      return null;
    },
    lineComment: '#',
  }));
}
