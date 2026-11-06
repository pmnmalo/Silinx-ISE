// The gate schematic of a truth table (#405: core/logic-sch.js out of core/logic.js): logic.js still exports it; a
// table of two outputs (one with a don't-care) as a schematic in every form (SOP, POS, XOR, NAND, NOR) and both
// languages: no schematic error, its generated HDL has no diagnostic, and the module's truth table, simulated, is
// the table's (the don't-care taken as the minimal form chose it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as logic from '../core/logic.js';
import { schematicFromTable, schematicErrors, gateForm } from '../core/logic-sch.js';
import { generateHdl } from '../core/schdoc.js';

test('#405 truth table schematic: logic.js exports the module\'s functions', () => {
  assert.deepEqual([logic.schematicFromTable, logic.schematicErrors, logic.gateForm], [schematicFromTable, schematicErrors, gateForm]);
});

test('#405 truth table schematic: every form, both languages: the module simulated gives the table', () => {
  const doc = logic.normalizeTable({ ...logic.newTable('t', ['a', 'b', 'c'], ['f', 'g']), table: { f: '01101001', g: '0001-111' } });
  for (const form of logic.FORMS) {
    for (const lang of ['vhdl', 'verilog']) {
      const what = `${form} ${lang}`;
      const sch = schematicFromTable(doc, { form, lang });
      assert.deepEqual(schematicErrors(sch), [], what);
      assert.ok(sch.symbols.length > 0, what);
      const g = generateHdl(sch, {});
      assert.deepEqual(g.diagnostics, [], what);
      const tt = logic.truthTableFromModule([{ path: g.filename, lang, text: g.code }], sch.name);
      // (the don't care as the minimal form chose it; the canonical SOP leaves it out: 0, #2951)
      assert.deepEqual(tt.table, { f: '01101001', g: form === 'csop' ? '00010111' : '00011111' }, what);
    }
  }
});
