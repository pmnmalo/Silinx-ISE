// web/js/highlight.js, the drawing editors' one HDL highlighter (#489): its tokens per language, the
// text kept as it was, and no editor keeping a highlighter of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { highlightHdl, KEYWORDS } from '../web/js/highlight.js';
import { generateFsm, newFsm } from '../core/fsm.js';

const spans = (html, cls) => [...html.matchAll(new RegExp(`<span class="${cls}">([^<]*)</span>`, 'g'))].map(m => m[1]);
// the text the browser shows: the tags dropped, the entities read (an independent reference)
const shown = html => html.replace(/<[^>]*>/g, '').replace(/&(lt|gt|quot|#39|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", amp: '&' }[e]));

const VHDL = `library ieee;
use ieee.std_logic_1164.all;
-- a comment: entity <x> & "y"
entity top is
  port (clk : in std_logic; q : out std_logic_vector(3 downto 0));
end top;
architecture rtl of top is
  type state_t is (S_IDLE, S_RUN);
  signal St : state_t := S_IDLE;
begin
  q <= "0101" when rising_edge(clk) and Begin = '1' else (others => '0');
end rtl;`;

const VERILOG = `// top <1> & "2"
(* fsm_encoding = "one-hot" *)
module top (input clk, output reg [3:0] q);
  localparam S_IDLE = 2'b00;
  always @(posedge clk) begin
    if (q == 4'hF) q <= 0; else q <= q + 1; -- not a comment here
  end
endmodule`;

test('#489 highlightHdl, VHDL: keywords in lower case, comments, literals and state constants', () => {
  const html = highlightHdl(VHDL, 'vhdl');
  assert.equal(shown(html), VHDL);
  assert.deepEqual(spans(html, 'tk-com'), ['-- a comment: entity &lt;x&gt; &amp; &quot;y&quot;']);
  assert.deepEqual(spans(html, 'tk-lit'), ['&quot;0101&quot;', '&#39;1&#39;', '&#39;0&#39;']);
  assert.deepEqual(spans(html, 'tk-st'), ['S_IDLE', 'S_RUN', 'S_IDLE']);
  const kws = spans(html, 'tk-kw');
  for (const k of ['library', 'use', 'all', 'entity', 'is', 'port', 'in', 'out', 'std_logic', 'std_logic_vector', 'downto', 'end',
    'architecture', 'of', 'type', 'signal', 'begin', 'when', 'rising_edge', 'and', 'else', 'others']) assert.ok(kws.includes(k), k);
  // a name starting with a capital is not a keyword (Begin, St), nor a Verilog keyword in VHDL
  assert.ok(!kws.includes('Begin') && !kws.includes('St'));
  assert.equal(spans(highlightHdl('always wire', 'vhdl'), 'tk-kw').length, 0);
});

test('#489 highlightHdl, Verilog: its keywords, sized literals, attributes; -- is not a comment', () => {
  const html = highlightHdl(VERILOG, 'verilog');
  assert.equal(shown(html), VERILOG);
  assert.deepEqual(spans(html, 'tk-com'), ['// top &lt;1&gt; &amp; &quot;2&quot;']);
  assert.deepEqual(spans(html, 'tk-attr'), ['(* fsm_encoding = &quot;one-hot&quot; *)']);
  assert.deepEqual(spans(html, 'tk-lit'), ["2&#39;b00", "4&#39;hF"]);
  const kws = spans(html, 'tk-kw');
  for (const k of ['module', 'input', 'output', 'reg', 'localparam', 'always', 'posedge', 'begin', 'if', 'else', 'end', 'endmodule']) assert.ok(kws.includes(k), k);
  assert.ok(!kws.includes('not') && !kws.includes('comment'), 'the VHDL comment\'s words are plain Verilog text');
  assert.equal(spans(highlightHdl('entity signal', 'verilog'), 'tk-kw').length, 0);
});

test('#489 highlightHdl: no language given, either language\'s keywords and comments; empty and hostile text', () => {
  const html = highlightHdl('entity module -- a\n// b', undefined);
  assert.deepEqual(spans(html, 'tk-kw'), ['entity', 'module']);
  assert.deepEqual(spans(html, 'tk-com'), ['-- a', '// b']);
  assert.equal(highlightHdl('', 'vhdl'), '');
  const evil = `signal \\x"><img src=x onerror=alert(1)> : bit; -- </span><script>`;
  for (const lang of ['vhdl', 'verilog', undefined]) {
    const out = highlightHdl(evil, lang);
    assert.equal(shown(out), evil);
    assert.ok(!/<(img|script|\/span><script)/i.test(out.replace(/<\/?span[^>]*>/gi, '')), `no markup from the text (${lang})`);
  }
  // the keyword sets are lower case, each language's own
  for (const set of Object.values(KEYWORDS)) for (const k of set) assert.equal(k, k.toLowerCase());
  assert.ok(KEYWORDS.vhdl.has('entity') && !KEYWORDS.verilog.has('entity') && KEYWORDS.verilog.has('module'));
});

test('#489 highlightHdl on generated HDL: a state diagram\'s VHDL and Verilog shown as generated', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const { code } = generateFsm(newFsm(), lang);
    const html = highlightHdl(code, lang);
    assert.equal(shown(html), code, lang);
    assert.ok(spans(html, 'tk-kw').length > 10, `${lang}: keywords`);
  }
});

// (each editor, and the module that shows its HDL since #405: the schematic editor's Symbol Info; the FSM editor shows
// none since #2505)
test('#489 no drawing editor keeps a highlighter of its own', () => {
  const read = (f) => fs.readFileSync(new URL(`../web/js/${f}`, import.meta.url), 'utf8');
  for (const [f, hdl] of [['asm-editor.js', 'asm-editor.js'], ['fsm-editor.js', null], ['fsm-bottom.js', null], ['sch-editor.js', 'sch-info.js']]) {
    for (const g of new Set([f, hdl].filter(Boolean))) assert.doesNotMatch(read(g), /function highlight\(|^const KW = /m, g);
    if (hdl) assert.match(read(hdl), /^import \{ highlightHdl \} from '\.\/highlight\.js';$/m, hdl);
  }
});
