// The MCP server's tool of the guided labs (#3179, server/mcp.js, #2674), as the interface's Lab document
// (web/js/lab-view.js): the labs a project can run (the shipped ones and its labs/*.lab.json), a step shown, a step
// checked on the project (core/labs.js checkStep, core/labs-check.js: the same checks, the project read through the
// same `io`), the try recorded in its labs/progress.json as the interface records it, and a lab restarted.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, readProject, viewSourcesOf, STR, PROJECT } from './mcp-util.js';
import { PROGRESS_FILE, checkLines, checkStep, labProgress, listLabs, localize, nextOpen, parseProgress, progressText, recordTry, stepOf } from '../core/labs.js';

const ACTIONS = ['list', 'show', 'check', 'restart'];

/** The project `name` as the lab checks read it (core/labs-check.js `io`). */
export function projectIo(name) {
  return {
    project: () => P.readProject(name),
    files: () => P.fileTree(name),
    read: rel => P.readFile(name, rel),
    sources: async sim => viewSourcesOf(name, await P.readProject(name), sim),
    reports: () => lastRun(name),
  };
}

/** The last run's build/reports.json (null: none) and whether it is newer than every file the implementation reads (the
 *  project's files but its test benches, its build/ and labs/ folders): { reports, current }. */
export async function lastRun(name) {
  const { projectReports } = await import('./impl-routes.js');
  const r = await projectReports(name).catch(() => null);
  if (!r?.summary) return { reports: null, current: false };
  const pj = await P.readProject(name), dir = P.projectDir(name);
  const sim = new Set((pj.files || []).filter(f => f.role === 'sim').map(f => f.path));
  const inputs = ['silinx.json', ...(await P.fileTree(name)).filter(f => !/^(build|labs)\//.test(f) && !sim.has(f))];
  const times = await Promise.all(inputs.map(f => fs.stat(path.join(dir, f)).then(s => s.mtimeMs, () => 0)));
  const at = Date.parse(r.generatedAt);
  return { reports: r, current: !(at < Math.max(0, ...times)) };
}

async function readProgress(name) {
  try { return parseProgress(await P.readFile(name, PROGRESS_FILE)); } catch { return {}; }
}

// a lab of the project by its id: its entry of listLabs
async function findLab(name, id) {
  const { labs } = await listLabs(await P.fileTree(name), rel => P.readFile(name, rel), { example: name });
  if (!id) throw toolError(`lab: the lab's id (${labs.map(l => l.id).join(', ') || 'none'}: action list)`);
  const l = labs.find(x => x.id === id);
  if (!l) throw toolError(`no lab '${id}' in the project '${name}' (${labs.map(x => x.id).join(', ') || 'none'})`);
  return l.lab;
}

const stepJson = (lab, s, p, lang) => ({ number: lab.steps.indexOf(s) + 1, id: s.id, title: localize(s.title, lang), text: localize(s.text, lang),
  ...(s.hint ? { hint: localize(s.hint, lang) } : {}), checks: s.checks || [], done: !!p.done[s.id], tries: p.tries[s.id] || 0 });

export const LAB_TOOLS = [
  {
    name: 'lab', title: 'Guided labs',
    description: 'The guided labs of a project, as its Lab document (Project ▸ Guided Labs…): list (the labs shipped with Silinx, each for an example, and the project\'s own labs/*.lab.json, with each one\'s steps done), show (a step: its text, its hint, its checks, done or not), check (run a step\'s checks on the project, as Check Step does: the reasons it is not done, its hint then; the try recorded in labs/progress.json; a step with no checks is marked done), restart (the lab\'s progress cleared).',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, action: { type: 'string', enum: ACTIONS, description: 'list, show, check or restart.' },
      lab: STR('The lab\'s id (action list gives them).'),
      step: { type: ['string', 'integer'], description: 'The step: its id or its number from 1 (default: the step the lab is at).' },
      language: { type: 'string', enum: ['en', 'pt'], description: 'The texts\' language (default en).' },
    }, required: ['project', 'action'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async run({ project: name, action, lab: id, step: which, language: lang = 'en' }) {
      await readProject(name);
      if (!ACTIONS.includes(action)) throw toolError(`action: one of ${ACTIONS.join(', ')}`);
      const all = await readProgress(name);
      if (action === 'list') {
        const { labs, problems } = await listLabs(await P.fileTree(name), rel => P.readFile(name, rel), { example: name });
        const rows = labs.map(l => { const p = labProgress(all, l.lab); return { id: l.id, title: localize(l.lab.title, lang), source: l.source, example: l.example, steps: l.lab.steps.length, done: l.lab.steps.filter(s => p.done[s.id]).length, step: p.step }; });
        const lines = [...rows.map(r => `${r.id}: "${r.title}" (${r.source === 'silinx' ? `Silinx's, for the ${r.example} example` : r.source}), ${r.done} of ${r.steps} step(s) done`), ...problems.map(m => `WARNING: ${m}`)];
        return { text: lines.join('\n') || `The project '${name}' has no lab.`, data: { project: name, labs: rows, problems } };
      }
      const lab = await findLab(name, id);
      if (action === 'restart') {
        delete all[lab.id];
        await P.writeFile(name, PROGRESS_FILE, progressText(all));
        return { text: `Lab "${localize(lab.title, lang)}" restarted: no step done.`, data: { project: name, lab: lab.id, step: 1 } };
      }
      const p = labProgress(all, lab);
      const step = which === undefined ? lab.steps[p.step - 1] : stepOf(lab, which);
      if (!step) throw toolError(`step: the lab '${lab.id}' has steps 1 to ${lab.steps.length} (${lab.steps.map(s => s.id).join(', ')})`);
      p.step = lab.steps.indexOf(step) + 1;
      if (action === 'show') {
        await P.writeFile(name, PROGRESS_FILE, progressText(all));   // (the step shown, as the document's: resumed there)
        const s = stepJson(lab, step, p, lang);
        return { text: [`Lab "${localize(lab.title, lang)}", step ${s.number} of ${lab.steps.length}: ${s.title}${s.done ? ' (done)' : ''}`, s.text].join('\n'), data: { project: name, lab: lab.id, step: s } };
      }
      const result = await checkStep(step, projectIo(name));
      recordTry(all, lab, step, result.ok);
      const next = result.ok ? nextOpen(lab, p, p.step) : p.step;
      if (next) p.step = next;
      await P.writeFile(name, PROGRESS_FILE, progressText(all));
      const lines = checkLines(lab, step, result, lang);
      if (!result.ok && step.hint) lines.push(`Hint: ${localize(step.hint, lang)}`);
      if (result.ok) lines.push(next ? `Next: step ${next}, ${localize(lab.steps[next - 1].title, lang)}.` : 'Every step of the lab is done.');
      return { text: lines.join('\n'), data: { project: name, lab: lab.id, step: stepJson(lab, step, p, lang), ok: result.ok, results: result.results, next: next || null, labDone: !nextOpen(lab, p) } };
    },
  },
];
