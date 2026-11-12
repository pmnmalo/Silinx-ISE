// UI: the Exercise document's synthesis tests in the browser edition (#3216): the site built (test/ui/site-lib.js) and
// served over HTTP; the shipped counter4 imported as a project with its exercise beside it, a slices limit added and a
// test too tight for it; Run All Tests runs the open synthesis in the flow's worker (Place & Route, nextpnr's, for the
// slices: its chip database from the site's assets), and the verdicts and messages are those of the server's grader
// (server/grade.js, silinx grade's) on the same project; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { setupUi, uiTest, ROOT } from './harness.js';
import { FILE, openImport } from './zip-helpers.js';
import { buildSite } from './site-lib.js';
import { createZip } from '../../core/zip.js';
import { gradeSubmission, readSubmission, loadExercise, referenceVectorsOf } from '../../server/grade.js';
import { exerciseUnitNames } from '../../core/grade-design.js';

let env, site;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  site = await buildSite(env.tmp);
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

const EX = path.join(ROOT, 'exercises/counter4');
const read = (f) => fs.readFileSync(path.join(EX, f), 'utf8');
// the project: the starter's silinx.json, the reference as its design, the exercise and its files beside it
function projectFiles() {
  const ex = JSON.parse(read('counter4.exercise.json'));
  const impl = ex.tests.find((t) => t.kind === 'synthesis');
  impl.slices = 4;
  ex.tests.push({ ...impl, id: 'tight', title: 'Two flip-flops', ffs: 2, slices: undefined });
  return { 'silinx.json': read('starter/silinx.json'), 'src/counter4.vhd': read('ref/counter4.vhd'), 'counter4.exercise.json': `${JSON.stringify(ex, null, 2)}\n`,
    'tests/count.vec': read('tests/count.vec'), 'ref/counter4.vhd': read('ref/counter4.vhd'), 'tb/tb_counter4.vhd': read('tb/tb_counter4.vhd') };
}

uiTest('#3216 browser edition: the synthesis tests run in the page (the flow\'s worker, Place & Route for the slices), their verdicts the server grader\'s', E, async (page) => {
  const files = projectFiles();
  const codec = { deflate: (d) => zlib.deflateRawSync(d), inflate: (d) => zlib.inflateRawSync(d) };
  const zipFile = path.join(env.tmp, 'counter4-exercise.zip');
  fs.writeFileSync(zipFile, await createZip(Object.entries(files).map(([p, data]) => ({ path: p, data })), codec));
  // the server's grader on the same project
  const dir = path.join(env.tmp, 'counter4-exercise');
  for (const [p, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), t); }
  const ex = loadExercise(path.join(dir, 'counter4.exercise.json')).exercise;
  const server = await gradeSubmission(ex, { ...await readSubmission(dir), name: 'Cnt' }, { vectors: await referenceVectorsOf(ex), exerciseUnits: [...exerciseUnitNames(ex)] });
  assert.deepEqual(server.tests.map((t) => [t.id, t.verdict, t.messages]), [['count', 'AC', []], ['random', 'AC', []], ['bench', 'AC', []], ['impl', 'AC', []], ['tight', 'RL', ['4 flip-flops, at most 2']]]);

  await page.goto(site.url);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
  await openImport(page, 'silinx');
  await page.setFiles(FILE, [zipFile]);
  await page.fill('.dlg-overlay input[type=text]', 'Cnt');
  await page.dialogButton('Import');
  await page.waitFor(() => window.Silinx.project?.name === 'Cnt' && document.querySelector('#hier .row'), [], { what: 'the imported project open' });
  const D = '.doc:not([hidden]) .ex';
  await page.menu('Project', 'Exercise…');
  await page.waitFor((d) => window.Silinx.active?.id === 'exercise:counter4.exercise.json' && document.querySelector(d)?.dataset.ready === '1', [D], { what: 'the exercise' });
  const before = await page.eval(() => window.__console().length);
  await page.click(`${D} .ex-bar .tb-more-btn`);
  await page.click(`${D} .ex-bar .tb-more-menu .asm-btn`, { text: 'Run All Tests' });
  await page.waitFor((n) => /Process "Run All Tests" (completed|failed)/.test(window.__console().slice(n)), [before], { what: 'the tests run', timeout: 240000 });
  const out = await page.eval((n) => window.__console().slice(n), before);
  assert.match(out, /Cnt: 100 \/ 110 points \(Resource \/ Timing Limit\)\n {2}\+ count \(Counting and the reset\): AC Accepted, 30 \/ 30\n {2}\+ random \(Random inputs against the reference\): AC Accepted, 40 \/ 40 \[hidden\]\n {2}\+ bench \(The wrap and the reset while counting\): AC Accepted, 20 \/ 20 \[hidden\]\n {2}\+ impl \(Synthesis: no latch, at most 4 flip-flops\): AC Accepted, 10 \/ 10\n {2}- tight \(Two flip-flops\): RL Resource \/ Timing Limit, 0 \/ 10\n {6}4 flip-flops, at most 2\nProcess "Run All Tests" completed: 100 \/ 110 points\./, out);
  assert.doesNotMatch(out, /WARNING|ERROR/);
  // (the slices' Place & Route ran: nextpnr's chip database from this version's assets)
  assert.ok(site.served.some((r) => /^assets\/vendor\/nextpnr-spartan\/[\d.]+\/chipdb\/chipdb-xc3s250e\.bin\.gz$/.test(r)), site.served.filter((r) => /nextpnr/.test(r)).join('\n'));
}, { url: () => 'about:blank', timeout: 400000 });
