// Guided labs (#3179): step-by-step tutorials on a project, each step checked on it (core/labs-check.js) rather than
// only described. A lab is a JSON file (`*.lab.json`): shipped with Silinx (core/labs-shipped.js, each naming its
// example) or a teacher's, in a project's labs/ folder (shared with the project: export, Copy Link…). Its texts are
// { en, pt } (or one string); a step's checks all pass for it to be ticked, a step with none is ticked by the student.
// Unknown keys are kept (a graded exercise is a lab with its grade, later). The progress (the steps done, the tries,
// the step shown) is the project's, labs/progress.json: a lab resumes where it was left, in the interface
// (web/js/lab-view.js) or through the MCP server's `lab` tool (server/mcp-labs.js). Isomorphic.
import { CHECKS } from './labs-check.js';
import { LABS } from './labs-shipped.js';

export const LAB_VERSION = 1;
export const LAB_DIR = 'labs';
export const PROGRESS_FILE = 'labs/progress.json';
export const isLabFile = p => /^labs\/[^/]+\.lab\.json$/i.test(String(p || ''));
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** A lab's text in the language `lang` (else English, else the first one given). */
export function localize(text, lang = 'en') {
  if (text == null) return '';
  if (typeof text === 'string') return text;
  return text[lang] ?? text.en ?? Object.values(text).find(v => typeof v === 'string') ?? '';
}

const isText = v => typeof v === 'string' || (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).length > 0 && Object.values(v).every(s => typeof s === 'string'));

/** The problems of a lab (a parsed *.lab.json): [] when it can be run. `where`: its file, for the messages. */
export function labProblems(lab, where = 'the lab') {
  const out = [];
  const bad = m => out.push(`${where}: ${m}`);
  if (!lab || typeof lab !== 'object' || Array.isArray(lab)) return [`${where}: not a lab (a JSON object)`];
  if (lab.silinxLab !== LAB_VERSION) bad(`"silinxLab": ${LAB_VERSION} expected`);
  if (!ID_RE.test(String(lab.id ?? ''))) bad('"id": letters, digits, - and _ (at most 64)');
  if (!isText(lab.title)) bad('"title": a text, or { "en": …, "pt": … }');
  if (lab.intro !== undefined && !isText(lab.intro)) bad('"intro": a text');
  if (!Array.isArray(lab.steps) || !lab.steps.length) { bad('"steps": a list of steps'); return out; }
  const ids = new Set();
  lab.steps.forEach((s, k) => {
    const at = `step ${k + 1}`;
    if (!s || typeof s !== 'object') { bad(`${at}: not a step`); return; }
    if (!ID_RE.test(String(s.id ?? ''))) bad(`${at}: "id": letters, digits, - and _`);
    else if (ids.has(s.id)) bad(`${at}: the id '${s.id}' is another step's`);
    ids.add(s.id);
    if (!isText(s.title)) bad(`${at}: "title": a text`);
    if (!isText(s.text)) bad(`${at}: "text": a text`);
    if (s.hint !== undefined && !isText(s.hint)) bad(`${at}: "hint": a text`);
    if (s.checks !== undefined && !Array.isArray(s.checks)) { bad(`${at}: "checks": a list`); return; }
    for (const [j, c] of (s.checks || []).entries()) {
      const kind = CHECKS[c?.check];
      if (!kind) { bad(`${at}, check ${j + 1}: "check": one of ${Object.keys(CHECKS).join(', ')}`); continue; }
      for (const m of kind.problems(c)) bad(`${at}, check ${j + 1} (${c.check}): ${m}`);
    }
  });
  return out;
}

/** A new lab for New Source ▸ Guided Lab (#3179): its id `id` (the file's name), a reading step, then Check Syntax of
 *  the project's top and its test bench's simulation, as a teacher starts one; every text in English and Portuguese. */
export function newLab(id, { top = null, simTop = null } = {}) {
  const steps = [{
    id: 'read', title: { en: 'The project', pt: 'O projeto' },
    text: { en: `Open the project's top module${top ? `, \`${top}\`` : ''}, and read it. This step has no check: Check Step ticks it.`,
      pt: `Abra o módulo de topo do projeto${top ? `, \`${top}\`` : ''}, e leia-o. Este passo não tem verificação: Verificar Passo marca-o.` },
  }, {
    id: 'syntax', title: { en: 'Check Syntax', pt: 'Verificar a sintaxe' },
    text: { en: 'Run **Check Syntax** on the top module: no errors and no warnings.', pt: 'Execute **Check Syntax** no módulo de topo: sem erros nem avisos.' },
    hint: { en: 'The console\'s Errors and Warnings tabs say what is wrong and where.', pt: 'Os separadores Errors e Warnings da consola dizem o que está errado e onde.' },
    checks: [{ check: 'syntax', warnings: [] }],
  }];
  if (simTop) steps.push({
    id: 'simulate', title: { en: 'Simulate', pt: 'Simular' },
    text: { en: `Simulate the test bench \`${simTop}\`: it reports no error.`, pt: `Simule a bancada de teste \`${simTop}\`: não reporta nenhum erro.` },
    hint: { en: 'An error in the console says what the test bench expected.', pt: 'Um erro na consola diz o que a bancada de teste esperava.' },
    checks: [{ check: 'simulate', time_ns: 1000 }],
  });
  return { silinxLab: LAB_VERSION, id, title: { en: id, pt: id },
    intro: { en: 'What the student does in this lab, step by step. Press Check Step when a step is done.', pt: 'O que o aluno faz neste laboratório, passo a passo. Carregue em Verificar Passo quando acabar um passo.' }, steps };
}

/** A teacher's lab file checked (its Check Syntax, in the interface and the MCP server's lab validate): the lines said. */
export const labFileLines = (path, problems) => (problems.length
  ? [...problems.map(m => `ERROR: ${m}`), `The lab ${path} has ${problems.length} problem(s): Project ▸ Guided Labs… leaves it out until they are fixed.`]
  : [`The lab ${path} can be run (Project ▸ Guided Labs…).`]);

/** A lab of a file's text: { lab, problems } (lab null when it cannot be read). */
export function parseLab(text, where = 'the lab') {
  let lab;
  try { lab = JSON.parse(text); } catch (e) { return { lab: null, problems: [`${where}: not JSON (${e.message})`] }; }
  const problems = labProblems(lab, where);
  return { lab: problems.length ? null : lab, problems };
}

/** The labs a project can run: the shipped ones (its example's first) and its own labs/*.lab.json, read through
 *  `read(path)`; [{ id, source: 'silinx' | <its file>, example, lab }] and the problems of the files that are not labs.
 *  A project's lab with a shipped lab's id is the project's (a teacher's version). */
export async function listLabs(fileTree, read, { example = null, shipped = LABS } = {}) {
  const own = [], problems = [];
  for (const f of (fileTree || []).filter(isLabFile).sort()) {
    let text;
    try { text = await read(f); } catch { problems.push(`${f}: cannot be read`); continue; }
    const r = parseLab(text, f);
    if (r.lab) own.push({ id: r.lab.id, source: f, example: r.lab.example || null, lab: r.lab });
    else problems.push(...r.problems);
  }
  const mine = new Set(own.map(l => l.id));
  const ship = shipped.filter(l => !mine.has(l.id)).map(lab => ({ id: lab.id, source: 'silinx', example: lab.example || null, lab }))
    .sort((a, b) => (b.example === example) - (a.example === example));
  return { labs: [...own, ...ship], problems };
}

/** The step of a lab by its id or its number (from 1); null when it has none. */
export function stepOf(lab, step) {
  if (typeof step === 'number' || /^\d+$/.test(String(step))) return lab.steps[Number(step) - 1] || null;
  return lab.steps.find(s => s.id === step) || null;
}

// ------------------------------------------------------------------ the progress (labs/progress.json)
/** The progress file's text read: { <lab id>: { step, done: { <step id>: iso time }, tries: { <step id>: n } } }. */
export function parseProgress(text) {
  let p;
  try { p = JSON.parse(text || '{}'); } catch { return {}; }
  return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
}
export const progressText = p => `${JSON.stringify(p, null, 2)}\n`;

/** One lab's progress in `all` (made when it has none). */
export function labProgress(all, lab) {
  const p = all[lab.id] && typeof all[lab.id] === 'object' && !Array.isArray(all[lab.id]) ? all[lab.id] : (all[lab.id] = {});
  if (!(Number.isInteger(p.step) && p.step >= 1 && p.step <= lab.steps.length)) p.step = 1;
  const plain = v => v && typeof v === 'object' && !Array.isArray(v);
  if (!plain(p.done)) p.done = {};
  if (!plain(p.tries)) p.tries = {};
  return p;
}

/** A step's try recorded: ticked when `ok` (the time `now`), its tries counted otherwise. Returns the lab's progress. */
export function recordTry(all, lab, step, ok, now = new Date().toISOString()) {
  const p = labProgress(all, lab);
  if (ok) p.done[step.id] = p.done[step.id] || now;
  else { p.tries[step.id] = (p.tries[step.id] || 0) + 1; delete p.done[step.id]; }
  return p;
}

/** The next step not done after `from` (a number from 1), else the first not done, else null (the lab done). */
export function nextOpen(lab, p, from = 0) {
  const open = k => !p.done[lab.steps[k].id];
  for (let k = from; k < lab.steps.length; k++) if (open(k)) return k + 1;
  for (let k = 0; k < from && k < lab.steps.length; k++) if (open(k)) return k + 1;
  return null;
}

/** The lines of a check's result, as the console and the MCP tool give them: a header, the reasons, the result. */
export function checkLines(lab, step, result, lang = 'en') {
  const k = lab.steps.indexOf(step) + 1;
  const head = `Lab "${localize(lab.title, lang)}", step ${k} of ${lab.steps.length}: ${localize(step.title, lang)}`;
  const reasons = result.results.flatMap(r => r.reasons.map(m => `WARNING: ${m}`));
  return [head, ...reasons, result.ok ? 'Step done.' : `Not done yet (${reasons.length} problem(s)).`];
}

/** Runs a step's checks on the project `io` (core/labs-check.js): { ok, results: [{ check, ok, reasons }] }. A step
 *  with no checks is done when the student says so: `ok` true. */
export async function checkStep(step, io) {
  const results = [];
  for (const c of step.checks || []) {
    let reasons;
    try { reasons = await CHECKS[c.check].run(c, io); } catch (e) { reasons = [e.message || String(e)]; }
    reasons = [...new Set(reasons)];   // (a signal missing at every time: said once)
    results.push({ check: c.check, ok: !reasons.length, reasons });
  }
  return { ok: results.every(r => r.ok), results };
}
