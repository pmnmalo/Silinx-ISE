// UI (#2693): an HDL source in the language that is not the project's preferred one has the preferred language's badge
// after its own on its Design row: [Verilog*] [VHDL] in a VHDL project, [VHDL*] [Verilog] in a Verilog one. The badge
// opens the source translated (core/translate.js), read-only (typing changes nothing), made again when the source is
// saved; a source that cannot be translated says why, with its line. Both preferred languages, Portuguese; no warnings.
// The source's tab menu (#2711): Show Generated VHDL / Verilog Beside, the translation on the other side, the source in
// front; a source in the preferred language has none.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity top is
    Port ( clk : in STD_LOGIC;
           rst : in STD_LOGIC;
           led : out STD_LOGIC_VECTOR (3 downto 0) );
end top;

architecture Behavioral of top is
    signal q : STD_LOGIC_VECTOR (3 downto 0);
begin
    u_cnt: entity work.cnt port map ( clk => clk, rst => rst, q => q );
    led <= not q;
end Behavioral;
`;
const CNT = `module cnt (
    input wire clk,
    input wire rst,
    output reg [3:0] q
);
    always @(posedge clk)
        if (rst) q <= 4'd0;
        else q <= q + 4'd1;
endmodule
`;
// (casez with don't-care bits: no translation)
const PRIO = `module prio (input [3:0] r, output reg [1:0] g);
    always @*
        casez (r)
            4'b1???: g = 2'd3;
            4'b01??: g = 2'd2;
            default: g = 2'd0;
        endcase
endmodule
`;
const CNT_VHDL = `-- cnt.v, translated from Verilog by Silinx: read-only, the comments not carried over.

library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity cnt is
    port (
        clk : in std_logic;
        rst : in std_logic;
        q : out std_logic_vector(3 downto 0)
    );
end cnt;

architecture Behavioral of cnt is
    signal q_i : std_logic_vector(3 downto 0);
begin
    q <= q_i;

    process (clk)
    begin
        if rising_edge(clk) then
            if rst = '1' then
                q_i <= "0000";
            else
                q_i <= std_logic_vector(unsigned(q_i) + 1);
            end if;
        end if;
    end process;
end Behavioral;
`;
const TOP_VERILOG = `// top.vhd, translated from VHDL by Silinx: read-only, the comments not carried over.

module top (
    input wire clk,
    input wire rst,
    output wire [3:0] led
);
    wire [3:0] q;

    cnt u_cnt (
        .clk(clk),
        .rst(rst),
        .q(q)
    );

    assign led = ~q;
endmodule
`;

// a row's badges ("Verilog*": the base) and their tips
const row = (page, name) => page.eval((n) => {
  const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl')?.textContent.trim() === n);
  return r ? [...r.querySelectorAll('.badge')].map((b) => `${b.textContent}${b.classList.contains('base') ? '*' : ''} (${b.title})`) : null;
}, name);
const badge = (page, name, text) => page.eval((n, t) => {
  const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl')?.textContent.trim() === n);
  [...r.querySelectorAll('.badge')].find((b) => b.textContent === t).click();
}, name, text);
// the document shown: its id, read-only, its text, its banner
const shown = (page) => page.eval(() => ({ id: window.Silinx.active?.id, ro: window.Silinx.active?.editor?.view.state.readOnly, text: window.Silinx.active?.editor?.getValue(),
  banner: document.querySelector('.doc:not([hidden]) .gen-banner')?.textContent }));
// a document's tab menu (its items), by the tab's title
const tabMenu = async (page, title) => {
  const at = await page.eval((t) => {
    const r = [...document.querySelectorAll('#doc-tabs .tab')].find((x) => x.querySelector('.tlabel')?.textContent === t && x.getClientRects().length).getBoundingClientRect();
    return { x: r.left + r.width / 3, y: r.top + r.height / 2 };
  }, title);
  await page.rightClick(at);
  return page.waitFor(() => { const l = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return l.length ? l : null; }, [], { what: 'the tab menu' });
};
// the documents shown: side (- not split), id, * in front
const sides = (page) => page.eval(() => window.Silinx.docs.filter((d) => d.el.getClientRects().length)
  .map((d) => `${d.el.classList.contains('pane-a') ? 'a' : d.el.classList.contains('pane-b') ? 'b' : '-'}:${d.id}${d === window.Silinx.active ? '*' : ''}`).sort());
const noWarnings = async (page) => {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
};

uiTest('#2693 a Verilog source in a VHDL project: [Verilog*] [VHDL], the VHDL its translation, read-only, made again on a save; a source with no translation says why; Portuguese; no warnings', E, async (page) => {
  await makeProject(env, { name: 'TrVhdl', top: 'top', preferredLanguage: 'vhdl', files: { 'src/top.vhd': TOP, 'src/cnt.v': CNT, 'src/prio.v': PRIO } });
  await page.openProject('TrVhdl');
  await page.leftTab('design');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'prio'), [], { what: 'the modules' });
  // the badges: the VHDL module its own only; the Verilog ones [VHDL] too, after their own
  assert.deepEqual(await row(page, 'top'), ['VHDL* (Open)']);
  assert.deepEqual(await row(page, 'u_cnt - cnt'), ['Verilog* (Open)', 'VHDL (Translated to VHDL (read-only))']);
  assert.deepEqual(await row(page, 'prio'), ['Verilog* (Open)', 'VHDL (Translated to VHDL (read-only))']);
  // [VHDL]: the translation, read-only
  await badge(page, 'u_cnt - cnt', 'VHDL');
  await page.waitFor(() => window.Silinx.active?.id === 'tr:src/cnt.v' && window.Silinx.active.editor, [], { what: 'the translation' });
  assert.deepEqual(await shown(page), { id: 'tr:src/cnt.v', ro: true, text: CNT_VHDL, banner: 'Read-only, translated from cnt.v' });
  assert.equal(await page.eval(() => window.Silinx.active.title), 'cnt.vhd');
  // typing in it changes nothing
  await page.click('.doc:not([hidden]) .cm-content');
  await page.type('-- typed');
  await page.key('Backspace');
  await page.key('Enter');
  assert.equal((await shown(page)).text, CNT_VHDL);
  // the source edited and saved: the translation follows
  await page.eval(() => window.SilinxApp.openFile('src/cnt.v'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/cnt.v' && window.Silinx.active.editor);
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace("q + 4'd1", "q - 4'd1")); });
  await page.eval(() => window.SilinxApp.saveAll());
  await page.waitFor(() => window.Silinx.docs.find((d) => d.id === 'tr:src/cnt.v').editor.getValue().includes('unsigned(q_i) - 1'), [], { what: 'the translation made again' });
  assert.equal(await page.eval(() => window.Silinx.docs.find((d) => d.id === 'tr:src/cnt.v').editor.getValue()), CNT_VHDL.replace('unsigned(q_i) + 1', 'unsigned(q_i) - 1'));
  // a source with no translation: why, with its line
  await badge(page, 'prio', 'VHDL');
  await page.waitFor(() => window.Silinx.active?.id === 'tr:src/prio.v' && window.Silinx.active.editor, [], { what: 'the translation of prio.v' });
  assert.deepEqual(await shown(page), { id: 'tr:src/prio.v', ro: true, banner: 'Cannot be translated from prio.v',
    text: "-- prio.v cannot be translated to VHDL:\n--   line 3: a casez with don't-care bits cannot be translated to VHDL" });
  // in Portuguese: the tip and the banner
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await badge(page, 'u_cnt - cnt', 'VHDL');
  await page.waitFor(() => window.Silinx.active?.id === 'tr:src/cnt.v' && window.Silinx.active.editor, [], { what: 'the translation again' });
  assert.deepEqual(await row(page, 'u_cnt - cnt'), ['Verilog* (Abrir)', 'VHDL (Traduzido para VHDL (só de leitura))']);
  assert.equal((await shown(page)).banner, 'Só de leitura, traduzido de cnt.v');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await noWarnings(page);
});

uiTest('#2693 a VHDL source in a Verilog project: [VHDL*] [Verilog], the Verilog its translation, read-only; the Verilog module its own badge only; no warnings', E, async (page) => {
  await makeProject(env, { name: 'TrVerilog', top: 'top', preferredLanguage: 'verilog', files: { 'src/top.vhd': TOP, 'src/cnt.v': CNT } });
  await page.openProject('TrVerilog');
  await page.leftTab('design');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'cnt'), [], { what: 'the modules' });
  assert.deepEqual(await row(page, 'top'), ['VHDL* (Open)', 'Verilog (Translated to Verilog (read-only))']);
  assert.deepEqual(await row(page, 'u_cnt - cnt'), ['Verilog* (Open)']);
  await badge(page, 'top', 'Verilog');
  await page.waitFor(() => window.Silinx.active?.id === 'tr:src/top.vhd' && window.Silinx.active.editor, [], { what: 'the translation' });
  assert.deepEqual(await shown(page), { id: 'tr:src/top.vhd', ro: true, text: TOP_VERILOG, banner: 'Read-only, translated from top.vhd' });
  assert.equal(await page.eval(() => window.Silinx.active.title), 'top.v');
  await page.click('.doc:not([hidden]) .cm-content');
  await page.type('// typed');
  assert.equal((await shown(page)).text, TOP_VERILOG);
  // [VHDL*] still opens the source itself
  await badge(page, 'top', 'VHDL');
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd', [], { what: 'the source' });
  await noWarnings(page);
});

uiTest('#2711 an HDL source\'s tab menu: Show Generated VHDL Beside (a Verilog source, a VHDL project), its translation on the other side, the source in front; again, where it is; Verilog Beside in a Verilog project; Portuguese; no warnings', E, async (page) => {
  await makeProject(env, { name: 'TrBeside', top: 'top', preferredLanguage: 'vhdl', files: { 'src/top.vhd': TOP, 'src/cnt.v': CNT } });
  await page.openProject('TrBeside');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'cnt'), [], { what: 'the modules' });
  // a source in the preferred language: no such item
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  assert.ok(!(await tabMenu(page, 'top.vhd')).some((l) => /Beside/.test(l)));
  await page.closeMenus();
  // the Verilog source: Show Generated VHDL Beside
  await page.eval(() => window.SilinxApp.openFile('src/cnt.v'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/cnt.v' && window.Silinx.active.editor);
  assert.equal((await tabMenu(page, 'cnt.v')).at(-1), 'Show Generated VHDL Beside');
  await page.click('body > .menu-popup .mi', { text: 'Show Generated VHDL Beside' });
  await page.waitFor(() => window.Silinx.docs.find((d) => d.id === 'tr:src/cnt.v')?.el.classList.contains('pane-b'), [], { what: 'the translation beside' });
  assert.ok((await sides(page)).includes('a:file:src/cnt.v*'));
  assert.ok((await sides(page)).includes('b:tr:src/cnt.v'));
  assert.deepEqual(await page.eval(() => { const d = window.Silinx.docs.find((x) => x.id === 'tr:src/cnt.v'); return { ro: d.editor.view.state.readOnly, text: d.editor.getValue() }; }), { ro: true, text: CNT_VHDL });
  // again (the source edited, not saved): made again, where it is
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace("q + 4'd1", "q - 4'd1")); });
  await tabMenu(page, 'cnt.v');
  await page.click('body > .menu-popup .mi', { text: 'Show Generated VHDL Beside' });
  await page.waitFor(() => window.Silinx.docs.find((d) => d.id === 'tr:src/cnt.v').editor.getValue().includes('unsigned(q_i) - 1'), [], { what: 'the translation made again' });
  assert.ok((await sides(page)).includes('a:file:src/cnt.v*'));
  assert.ok((await sides(page)).includes('b:tr:src/cnt.v'));
  assert.equal(await page.eval(() => window.Silinx.docs.filter((d) => d.id === 'tr:src/cnt.v').length), 1);
  // View ▸ Show Generated HDL Beside: enabled for it
  assert.equal(await page.eval(() => window.SilinxApp.S.menus.find((m) => m.label === 'View').items().find((x) => x?.label === 'Show Generated HDL Beside').disabled()), false);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.ok((await tabMenu(page, 'cnt.v')).includes('Mostrar o VHDL Gerado ao Lado'));
  await page.closeMenus();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await noWarnings(page);
});

uiTest('#2711 a VHDL source\'s tab menu in a Verilog project: Show Generated Verilog Beside, its translation on the other side; no warnings', E, async (page) => {
  await makeProject(env, { name: 'TrBesideV', top: 'top', preferredLanguage: 'verilog', files: { 'src/top.vhd': TOP, 'src/cnt.v': CNT } });
  await page.openProject('TrBesideV');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'cnt'), [], { what: 'the modules' });
  await page.eval(() => window.SilinxApp.openFile('src/cnt.v'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/cnt.v' && window.Silinx.active.editor);
  assert.ok(!(await tabMenu(page, 'cnt.v')).some((l) => /Beside/.test(l)));
  await page.closeMenus();
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  assert.equal((await tabMenu(page, 'top.vhd')).at(-1), 'Show Generated Verilog Beside');
  await page.click('body > .menu-popup .mi', { text: 'Show Generated Verilog Beside' });
  await page.waitFor(() => window.Silinx.docs.find((d) => d.id === 'tr:src/top.vhd')?.el.classList.contains('pane-b'), [], { what: 'the translation beside' });
  assert.ok((await sides(page)).includes('a:file:src/top.vhd*'));
  assert.equal(await page.eval(() => window.Silinx.docs.find((d) => d.id === 'tr:src/top.vhd').editor.getValue()), TOP_VERILOG);
  await noWarnings(page);
});
