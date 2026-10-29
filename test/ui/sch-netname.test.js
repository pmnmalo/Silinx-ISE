// UI (#689, #734, #754): a wire named with a name another net has: the editor asks whether to connect them by name.
// Cancel: nothing changes, the nets stay apart; Connect by name: one net (the HDL one signal). In
// English and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, netlist, generateHdl } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const P = (x, y) => ({ x, y });
const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });

uiTest('#689 schematic: a net name another net has asks to connect them by name; Cancel keeps them apart, Connect makes one net (English, Portuguese)', E, async (page) => {
  // a -> U1 -> W2 named s; W3 (unnamed) -> U2 -> y
  const doc = newDoc('byname', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 80, 90), inv('S2', 'U2', 80, 290));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 220, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(80, 100)] }, { id: 'W2', points: [P(160, 100), P(220, 100)] },
    { id: 'W3', points: [P(40, 300), P(80, 300)] }, { id: 'W4', points: [P(160, 300), P(220, 300)] });
  doc.labels.push({ id: 'L1', x: 200, y: 100, net: 's' });
  await makeProject(env, { name: 'ByNamePj', files: { 'src/byname.sch.json': JSON.stringify(doc) } });
  await page.openProject('ByNamePj');
  await page.eval(() => window.SilinxApp.openSch('src/byname.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  const at = (x, y) => page.eval((ed, px, py) => { const l = document.querySelector(`${ed} svg [data-kind=wire] .whit`); const p = l.ownerSVGElement.createSVGPoint(); p.x = px; p.y = py; const q = p.matrixTransform(l.getScreenCTM()); return { x: q.x, y: q.y }; }, ED, x, y);
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const joined = async () => { const nl = netlist(await getDoc()); return nl.wireNet.get('W2') === nl.wireNet.get('W3'); };
  // the Add Net Name tool, the name s typed in its box, a click on W3
  const nameW3 = async () => {
    await page.click(`${ED} .se-btn[data-act=net]`);
    await page.eval((ed) => { const i = [...document.querySelectorAll(`${ed} .se-optin`)].find((e) => e.getClientRects().length); i.value = 's'; i.dispatchEvent(new Event('input', { bubbles: true })); }, ED);
    await page.click(await at(70, 300));
  };
  const dialogText = () => page.eval(() => { const d = [...document.querySelectorAll('.dlg-overlay')].pop(); return { title: d.querySelector('.dlg-title span').textContent, body: d.querySelector('.dlg-body').innerText.trim(), buttons: [...d.querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent.trim()) }; });

  for (const lang of ['en', 'pt']) {
    await page.eval(async (l) => (await import('/js/i18n.js')).setLanguage(l), lang);
    const T = lang === 'en'
      ? { title: 'Net name already used', body: "Another net is already named 's'.\nConnect this net to it by name? They become one net, without a wire drawn between them.", yes: 'Connect by name', no: 'Cancel' }
      : { title: 'Nome de rede já usado', body: "Já há outra rede chamada 's'.\nLigar esta rede a ela pelo nome? Passam a ser uma só rede, sem um fio desenhado entre elas.", yes: 'Ligar pelo nome', no: 'Cancelar' };
    // No: nothing added, the nets apart
    await nameW3();
    await page.waitDialog(T.title);
    assert.deepEqual(await dialogText(), { title: T.title, body: T.body, buttons: [T.yes, T.no] }, lang);
    await page.dialogButton(T.no);
    await page.waitNoDialog();
    assert.equal((await getDoc()).labels.length, 1, `${lang}: Cancel: no name added`);
    assert.equal(await joined(), false, `${lang}: Cancel: two nets`);
    // Yes: one net, connected by name
    await nameW3();
    await page.waitDialog(T.title);
    await page.dialogButton(T.yes);
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().labels.length === 2, [], { what: 'the name added' });
    const d = await getDoc();
    assert.equal(await joined(), true, `${lang}: Connect: one net`);
    assert.deepEqual(d.labels.map((l) => [l.x, l.y, l.net]), [[200, 100, 's'], [70, 300, 's']]);
    const nl = netlist(d);
    assert.deepEqual(nl.diagnostics.map((x) => x.message), [], `${lang}: no warnings`);
    assert.equal((generateHdl(d, { lang: 'vhdl' }).code.match(/signal s\b[^;]*;/g) || []).length, 1, 'one signal s');
    await page.key('Escape');
    await page.menu(lang === 'en' ? 'Edit' : 'Editar', lang === 'en' ? 'Undo' : 'Anular');
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().labels.length === 1, [], { what: 'undone' });
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});

// #734: a net connected by name renamed by one of its net names: the whole set takes the new name (its other net
// names, its I/O marker of that name), said in the status line, undone in one step; in English and Portuguese
uiTest('#734 schematic: renaming a net name renames the whole net connected by name, its I/O marker too; one Undo (English, Portuguese)', E, async (page) => {
  // a -> U1 -> W2 named s; W3 named s too (one net, by name) -> U2 -> y; a second wire W5 named a: the input marker's net
  const doc = newDoc('rename', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 80, 90), inv('S2', 'U2', 80, 290));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 220, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(80, 100)] }, { id: 'W2', points: [P(160, 100), P(220, 100)] },
    { id: 'W3', points: [P(40, 300), P(80, 300)] }, { id: 'W4', points: [P(160, 300), P(220, 300)] }, { id: 'W5', points: [P(300, 100), P(360, 100)] });
  doc.labels.push({ id: 'L1', x: 200, y: 100, net: 's' }, { id: 'L2', x: 60, y: 300, net: 'S' }, { id: 'L3', x: 320, y: 100, net: 'a' });
  await makeProject(env, { name: 'RenamePj', files: { 'src/rename.sch.json': JSON.stringify(doc) } });
  await page.openProject('RenamePj');
  await page.eval(() => window.SilinxApp.openSch('src/rename.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  // a net name selected, its Name field set (as typed, then Enter)
  const rename = async (id, name) => {
    await page.click(`${ED} [data-kind=label][data-id=${id}] .hitbox`);
    await page.waitFor((ed) => document.querySelector(`${ed} .se-field input`), [ED], { what: 'the net name\'s properties' });
    await page.eval((ed, v) => { const i = document.querySelector(`${ed} .se-field input`); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }, ED, name);
  };
  // the status line's note (shown a moment, translated in Portuguese)
  const hint = (t) => page.waitFor((ed, x) => { const e = document.querySelector(`${ed} .se-hint`); return !!e && !e.hidden && e.textContent === x; }, [ED, t], { what: `the note: ${t}` });
  for (const lang of ['en', 'pt']) {
    await page.eval(async (l) => (await import('/js/i18n.js')).setLanguage(l), lang);
    // s (and S: VHDL) renamed q from L1: L2 too, the two still one net
    await rename('L1', 'q');
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().labels.map((l) => l.net).join() === 'q,q,a', [], { what: `${lang}: the set renamed` });
    const nl = netlist(await getDoc());
    assert.equal(nl.wireNet.get('W2'), nl.wireNet.get('W3'), `${lang}: one net`);
    await hint(lang === 'en' ? "Renamed to 'q' with the net: 1 other net name" : "Mudado para 'q' com a rede: outro nome de rede");
    // one Undo: both back
    await page.key('Escape');
    await page.menu(lang === 'en' ? 'Edit' : 'Editar', lang === 'en' ? 'Undo' : 'Anular');
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().labels.map((l) => l.net).join() === 's,S,a', [], { what: `${lang}: undone in one step` });
    // the net named a (W5) renamed b: the input marker a with it, the module's port
    await rename('L3', 'b');
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.map((p) => p.name).join() === 'b,y', [], { what: `${lang}: the marker renamed` });
    assert.deepEqual((await getDoc()).labels.map((l) => l.net), ['s', 'S', 'b']);
    assert.match(generateHdl(await getDoc(), { lang: 'vhdl' }).code, /\bb\s*:\s*in\b/i);
    await hint(lang === 'en' ? "Renamed to 'b' with the net: the I/O marker 'b' (a port of the module)" : "Mudado para 'b' com a rede: o marcador de E/S 'b' (um porto do módulo)");
    await page.key('Escape');
    await page.menu(lang === 'en' ? 'Edit' : 'Editar', lang === 'en' ? 'Undo' : 'Anular');
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.map((p) => p.name).join() === 'a,y', [], { what: `${lang}: the marker undone` });
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});

// #754: a wire drawn between two named nets (s and t) is refused, as in ISE's schematic editor ("would create a
// short"): the status line says why, nothing is added; a wire to an unnamed net is drawn. In English and Portuguese
uiTest('#754 schematic: a wire between two named nets is refused with a note; to an unnamed net it is drawn (English, Portuguese)', E, async (page) => {
  // a -> U1 -> W2 named s; W3 named t -> U2 -> y; W6 (unnamed) -> U3
  const doc = newDoc('short', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 80, 90), inv('S2', 'U2', 80, 290), inv('S3', 'U3', 80, 490));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 220, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(80, 100)] }, { id: 'W2', points: [P(160, 100), P(220, 100)] },
    { id: 'W3', points: [P(40, 300), P(80, 300)] }, { id: 'W4', points: [P(160, 300), P(220, 300)] }, { id: 'W6', points: [P(40, 500), P(80, 500)] });
  doc.labels.push({ id: 'L1', x: 200, y: 100, net: 's' }, { id: 'L2', x: 60, y: 300, net: 't' });
  await makeProject(env, { name: 'ShortPj', files: { 'src/short.sch.json': JSON.stringify(doc) } });
  await page.openProject('ShortPj');
  await page.eval(() => window.SilinxApp.openSch('src/short.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 3, [ED], { what: 'drawn' });
  const at = (x, y) => page.eval((ed, px, py) => { const l = document.querySelector(`${ed} svg [data-kind=wire] .whit`); const p = l.ownerSVGElement.createSVGPoint(); p.x = px; p.y = py; const q = p.matrixTransform(l.getScreenCTM()); return { x: q.x, y: q.y }; }, ED, x, y);
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const hint = (t) => page.waitFor((ed, x) => { const e = document.querySelector(`${ed} .se-hint`); return !!e && !e.hidden && e.textContent === x; }, [ED, t], { what: `the note: ${t}` });
  const draw = async (pts) => { await page.click(`${ED} .se-btn[data-act=wire]`); for (const [x, y] of pts) await page.click(await at(x, y)); await page.key('Escape'); };
  for (const lang of ['en', 'pt']) {
    await page.eval(async (l) => (await import('/js/i18n.js')).setLanguage(l), lang);
    // from W2's end (s) to W3's end (t): refused
    await draw([[220, 100], [220, 200], [40, 200], [40, 300]]);
    await hint(lang === 'en' ? "The wire would short net 's' and net 't': two named nets cannot be joined. Rename one of them first (the same name connects them)."
      : "O fio poria em curto a rede 's' e a rede 't': duas redes com nome não podem ser unidas. Mude primeiro o nome de uma delas (o mesmo nome liga-as).");
    const d = await getDoc();
    assert.equal(d.wires.length, 5, `${lang}: no wire added`);
    const nl = netlist(d);
    assert.notEqual(nl.wireNet.get('W2'), nl.wireNet.get('W3'), `${lang}: s and t apart`);
    assert.ok(!nl.diagnostics.some((x) => /several names/.test(x.message)), `${lang}: no net with two names`);
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // from W2's end (s) to W6's end (unnamed): drawn, U3's input on s; the warnings only t's (driven by nothing)
  await draw([[220, 100], [240, 100], [240, 440], [40, 440], [40, 500]]);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 6, [], { what: 'the wire drawn' });
  const d = await getDoc();
  const nl = netlist(d);
  assert.equal(nl.wireNet.get('W6'), nl.wireNet.get('W2'), 'one net');
  assert.equal(nl.wireNet.get('W6').name, 's');
  assert.deepEqual(nl.diagnostics.map((x) => x.message).sort(), ["net 't' connects only U2.I", "net 't' has no driver (read by U2.I)"], 'only t\'s own warnings');
});

// #806: a move, a wire segment dragged or a paste that would short two named nets is refused like a drawn wire
// (#754): the schematic as it was, nothing to undo, the note in the status line; in English and Portuguese
uiTest('#806 schematic: a segment dragged, a marker moved or a paste onto another named net is refused with a note (English, Portuguese)', E, async (page) => {
  // a -> U1 -> W2 named s, its end at (220, 100); W7 named t (free); W11 named u (free), 40 up-left of W2's end;
  // the input marker b (free)
  const doc = newDoc('moves', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 80, 90));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'b', dir: 'in', width: 1, x: 400, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(80, 100)] }, { id: 'W2', points: [P(160, 100), P(220, 100)] },
    { id: 'W7', points: [P(220, 160), P(280, 160)] }, { id: 'W11', points: [P(140, 60), P(180, 60)] });
  doc.labels.push({ id: 'L1', x: 200, y: 100, net: 's' }, { id: 'L7', x: 260, y: 160, net: 't' }, { id: 'L11', x: 160, y: 60, net: 'u' });
  await makeProject(env, { name: 'MovesPj', files: { 'src/moves.sch.json': JSON.stringify(doc) } });
  await page.openProject('MovesPj');
  await page.eval(() => window.SilinxApp.openSch('src/moves.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .port`).length === 2, [ED], { what: 'drawn' });
  const at = (x, y) => page.eval((ed, px, py) => { const l = document.querySelector(`${ed} svg [data-kind=wire] .whit`); const p = l.ownerSVGElement.createSVGPoint(); p.x = px; p.y = py; const q = p.matrixTransform(l.getScreenCTM()); return { x: q.x, y: q.y }; }, ED, x, y);
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const doc0 = JSON.stringify(await getDoc());
  const hint = (t) => page.waitFor((ed, x) => { const e = document.querySelector(`${ed} .se-hint`); return !!e && !e.hidden && e.textContent === x; }, [ED, t], { what: `the note: ${t}` });
  const note = (lang, what, a, b) => (lang === 'en'
    ? `${what} would short net '${a}' and net '${b}': two named nets cannot be joined. Rename one of them first (the same name connects them).`
    : `${{ 'The wire': 'O fio', 'The move': 'A deslocação', Pasting: 'Colar' }[what]} poria em curto a rede '${a}' e a rede '${b}': duas redes com nome não podem ser unidas. Mude primeiro o nome de uma delas (o mesmo nome liga-as).`);
  const same = async (what) => {
    assert.equal(JSON.stringify(await getDoc()), doc0, `${what}: the schematic as it was`);
    assert.equal(await page.eval(() => window.Silinx.active.schEditor.canUndo()), false, `${what}: nothing to undo`);
  };
  for (const lang of ['en', 'pt']) {
    await page.eval(async (l) => (await import('/js/i18n.js')).setLanguage(l), lang);
    // W7 (t) dragged up by its segment onto W2's end (s)
    await page.drag(await at(250, 160), await at(250, 100));
    await hint(note(lang, 'The move', 's', 't'));
    await same(`${lang}: the segment`);
    // the marker b moved onto W2's end
    await page.drag(await at(400, 300), await at(220, 100));
    await hint(note(lang, 'The move', 's', 'b'));
    await same(`${lang}: the marker`);
    // W11 (u) copied and pasted (40 right and down): the copy (its net u_1, a name of its own) ends on W2's end
    await page.click(await at(170, 60));
    await page.eval(() => window.Silinx.active.schEditor.copy());
    // (an offset given: the paste goes there, not at the mouse nor in a blank place, #1797)
    await page.eval(() => window.Silinx.active.schEditor.paste(undefined, { dx: 40, dy: 40 }));
    await hint(note(lang, 'Pasting', 's', 'u_1'));
    await same(`${lang}: the paste`);
    await page.key('Escape');
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // a move that shorts nothing still moves: W7 dragged down 20
  await page.drag(await at(250, 160), await at(250, 180));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W7').points[0].y === 180, [], { what: 'W7 moved' });
});
