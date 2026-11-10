// core/schname.js (#1546): the name Rename… gives an instance, an I/O marker or a net name of a schematic: an identifier
// of VHDL and Verilog, not a reserved word, not another instance's or I/O marker's name; the messages in Portuguese.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoInstName, instName, nameUnnamed, renameError } from '../core/schname.js';
import { newDoc } from '../core/schdoc.js';

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (k === 'silinx.lang' ? 'pt' : null), setItem() {}, removeItem() {} }, configurable: true, writable: true });
const { t } = await import('../web/js/i18n.js');

const sheet = () => {
  const d = newDoc('top', 'vhdl');
  d.symbols.push({ id: 'S1', type: 'inv', name: 'U1', x: 100, y: 100, params: { width: 1 } }, { id: 'S2', type: 'inv', name: 'U2', x: 100, y: 300, params: { width: 1 } });
  d.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 110 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 220, y: 110 });
  d.labels.push({ id: 'L1', x: 200, y: 310, net: 's' });
  return d;
};

test('#1546 renameError: good names, its own name, a bus net name', () => {
  const d = sheet();
  for (const n of ['U3', 'count_en', 'x1', 'A_b_2', '  q  ']) assert.equal(renameError(d, 'sym', 'S1', n), null, n);
  assert.equal(renameError(d, 'sym', 'S1', 'U1'), null, 'its own name');
  assert.equal(renameError(d, 'sym', 'S1', 'u1'), null, 'its own name in another case');
  assert.equal(renameError(d, 'port', 'P1', 'b'), null);
  for (const n of ['data(7:0)', 'q[3:0]', 'd(0 to 3)', 'y', 'U1']) assert.equal(renameError(d, 'label', 'L1', n), null, `net name ${n}`);
});

test('#1546 renameError: an empty name, an invalid identifier, a reserved word of VHDL or Verilog (any letter case)', () => {
  const d = sheet();
  assert.equal(renameError(d, 'sym', 'S1', '   '), null, 'an instance: its automatic name (#3300)');
  assert.equal(renameError(d, 'port', 'P1', '   '), 'Type a name.');
  assert.equal(renameError(d, 'label', 'L1', ''), 'Type a name.');
  const bad = (n) => `'${n}' is not a valid name: use a letter, then letters, digits and single _ (not at the end).`;
  for (const n of ['1x', '_x', 'x_', 'a__b', 'a b', 'a-b', 'ü', 'a$b']) assert.equal(renameError(d, 'sym', 'S1', n), bad(n), n);
  assert.equal(renameError(d, 'label', 'L1', 'data(7:'), bad('data(7:'));
  assert.equal(renameError(d, 'label', 'L1', '2d(3:0)'), bad('2d(3:0)'));
  assert.equal(renameError(d, 'sym', 'S1', 'signal'), "'signal' is a reserved word of VHDL: choose another name.");
  assert.equal(renameError(d, 'sym', 'S1', 'Wire'), "'Wire' is a reserved word of Verilog: choose another name.");
  assert.equal(renameError(d, 'port', 'P1', 'AND'), "'AND' is a reserved word of VHDL and Verilog: choose another name.");
  assert.equal(renameError(d, 'label', 'L1', 'out(3:0)'), "'out' is a reserved word of VHDL: choose another name.");
  assert.equal(renameError(d, 'sym', 'S1', 'logic'), "'logic' is a reserved word of SystemVerilog: choose another name.");
});

test('#1546 renameError: the name of another instance or I/O marker (any letter case); a net name may share one', () => {
  const d = sheet();
  assert.equal(renameError(d, 'sym', 'S1', 'U2'), "'U2' is already the name of another instance: choose another name.");
  assert.equal(renameError(d, 'sym', 'S1', 'u2'), "'u2' is already the name of another instance: choose another name.");
  assert.equal(renameError(d, 'sym', 'S1', 'A'), "'A' is already the name of an I/O marker: choose another name.");
  assert.equal(renameError(d, 'port', 'P1', 'Y'), "'Y' is already the name of another I/O marker: choose another name.");
  assert.equal(renameError(d, 'port', 'P1', 'u1'), "'u1' is already the name of an instance: choose another name.");
  assert.equal(renameError(d, 'label', 'L1', 'a'), null, 'another net of that name: asked by the editor (#689)');
});

test('#1546 Rename…: its labels and messages in Portuguese', () => {
  const T = {
    'Rename…': 'Mudar o Nome…', Rename: 'Mudar o Nome', 'New name:': 'Novo nome:', Cancel: 'Cancelar',
    'Rename Instance': 'Mudar o Nome da Instância', 'Rename I/O Marker': 'Mudar o Nome do Marcador de E/S', 'Rename Net Name': 'Mudar o Nome da Rede',
    'Type a name.': 'Escreva um nome.',
    "'1x' is not a valid name: use a letter, then letters, digits and single _ (not at the end).": "'1x' não é um nome válido: use uma letra, seguida de letras, dígitos e _ simples (não no fim).",
    "'signal' is a reserved word of VHDL: choose another name.": "'signal' é uma palavra reservada de VHDL: escolha outro nome.",
    "'AND' is a reserved word of VHDL and Verilog: choose another name.": "'AND' é uma palavra reservada de VHDL e Verilog: escolha outro nome.",
    "'U2' is already the name of another instance: choose another name.": "'U2' já é o nome de outra instância: escolha outro nome.",
    "'A' is already the name of an I/O marker: choose another name.": "'A' já é o nome de um marcador de E/S: escolha outro nome.",
    "'Y' is already the name of another I/O marker: choose another name.": "'Y' já é o nome de outro marcador de E/S: escolha outro nome.",
    "'u1' is already the name of an instance: choose another name.": "'u1' já é o nome de uma instância: escolha outro nome.",
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
});

// #3300: an instance's name cleared is a fresh automatic name, inst_n; an independent reference: the lowest n above
// every inst_n / XLXI_n of the other instances whose inst_n no other instance or I/O marker has
const reference = (d, id) => {
  const others = d.symbols.filter(s => s.id !== id);
  const top = Math.max(0, ...others.map(s => +(/^(?:inst|XLXI)_(\d+)$/.exec(s.name)?.[1] || 0)));
  const taken = [...others, ...d.ports].map(o => o.name.toLowerCase());
  for (let n = top + 1; ; n++) if (!taken.includes(`inst_${n}`)) return `inst_${n}`;
};

test('#3300 autoInstName: the next inst_n, after the inst_n and XLXI_n, skipping names in use', () => {
  const d = sheet();
  assert.equal(autoInstName(d), 'inst_1', 'no automatic name yet');
  assert.equal(autoInstName(d, 'S1'), 'inst_1');
  d.symbols[1].name = 'inst_4';
  assert.equal(autoInstName(d, 'S1'), 'inst_5');
  assert.equal(autoInstName(d, 'S2'), 'inst_1', 'its own name not counted');
  d.symbols[0].name = 'XLXI_7';
  assert.equal(autoInstName(d, 'S2'), 'inst_8', 'after an imported XLXI_n');
  d.ports[0].name = 'INST_8';
  assert.equal(autoInstName(d, 'S2'), 'inst_9', "an I/O marker's name, in any letter case");
  d.symbols.push({ id: 'S3', type: 'inv', name: 'Inst_9', x: 0, y: 0, params: {} });
  assert.equal(autoInstName(d, 'S2'), 'inst_10', "another instance's name in another case");
  for (const id of ['S1', 'S2', 'S3', null]) assert.equal(autoInstName(d, id), reference(d, id), String(id));
  assert.equal(autoInstName({}), 'inst_1', 'a document with no lists');
});

test('#3300 instName: a name typed kept (trimmed); an empty one an automatic name, valid for renameError', () => {
  const d = sheet();
  assert.equal(instName(d, 'S1', '  cnt  '), 'cnt');
  for (const v of ['', '   ', null, undefined]) assert.equal(instName(d, 'S1', v), 'inst_1', String(v));
  d.symbols[1].name = 'inst_2';
  const n = instName(d, 'S1', '');
  assert.equal(n, 'inst_3');
  assert.equal(renameError(d, 'sym', 'S1', n), null);
});

test('#3300 nameUnnamed: the instances with no name named one after another; the named ones kept', () => {
  const d = sheet();
  d.symbols.push({ id: 'S3', type: 'inv', name: '', x: 0, y: 0, params: {} }, { id: 'S4', type: 'inv', name: ' ', x: 0, y: 0, params: {} }, { id: 'S5', type: 'inv', x: 0, y: 0, params: {} });
  assert.deepEqual(nameUnnamed(d), [{ id: 'S3', name: 'inst_1' }, { id: 'S4', name: 'inst_2' }, { id: 'S5', name: 'inst_3' }]);
  assert.deepEqual(d.symbols.map(s => s.name), ['U1', 'U2', 'inst_1', 'inst_2', 'inst_3']);
  assert.deepEqual(nameUnnamed(d), [], 'all named');
  assert.deepEqual(nameUnnamed({}), []);
});
