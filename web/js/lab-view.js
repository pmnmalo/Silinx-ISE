// A guided lab (#3179, core/labs.js) as a document: Project ▸ Guided Labs… lists the labs the project can run (the
// shipped ones, its example's first, and its own labs/*.lab.json) and opens one. As every viewer (docs/UI-GUIDELINES.md):
// its toolbar (Check Step, Previous, Next, ☰ Steps on a narrow screen, the ⋮ menu's Restart the Lab), the step shown,
// its hint after a failed try, the Steps side panel on the right (each step with its tick, a click shows it; folded as
// the editors' Properties, side-fold.js; over the page behind ☰ Steps under 1024 px, narrow.js), its status line, and
// every check's result in the console. A step is checked on the project as it is saved, a process on its last run
// (core/labs-check.js, the checks the MCP server's `lab` tool runs, server/mcp-labs.js); the progress is the project's
// labs/progress.json, so a lab resumes where it was left. Its texts are in the interface's language (a lab's own, not the dictionary's).
import { h, dialog } from './ui.js';
import { api } from './api.js';
import { S, findDoc, openDoc } from './app.js';
import { log } from './console.js';
import { saveAll } from './processes.js';
import { inView } from './design.js';
import { getLanguage, onLanguageChange, t } from './i18n.js';
import { mountSideFold } from './side-fold.js';
import { panelToggle } from './narrow.js';
import { statusLine } from './status-line.js';
import { toolbarMenu } from './toolbar-menu.js';
import { PROCESSES } from '/core/labs-check.js';
import { PROGRESS_FILE, checkLines, checkStep, labFileLines, labProgress, listLabs, localize, nextOpen, parseLab, parseProgress, progressText, recordTry } from '/core/labs.js';

export const STEPS_KEY = 'silinx.narrow.labsteps';   // (the Steps panel shown on a narrow screen)
const lang = () => (getLanguage() === 'pt' ? 'pt' : 'en');

/** The project `name` as a lab's checks read it (core/labs-check.js `io`): as it is saved, its HDL as Check Syntax takes
 *  it (the HDL files of the view, and the views' HDL made in the browser, S.viewSources). */
export function projectIo(name) {
  const pj = () => api.project(name);
  return {
    project: pj,
    files: async () => (await pj()).fileTree || [],
    read: rel => api.readFile(name, rel),
    sources: async sim => [...(await api.sources(name)).filter(s => !s.missing && !s.view), ...(S.viewSources || [])]
      .filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role || 'design', sim)),
    // the last run's reports, current while the Processes pane marks none of its steps out of date or failed
    reports: async process => {
      const r = await api.reports(name).catch(() => null);
      return { reports: r?.summary ? r : null, current: !PROCESSES[process].marks.some(m => S.status?.[m] === 'stale' || S.status?.[m] === 'err') };
    },
  };
}

const readProgress = async name => { try { return parseProgress(await api.readFile(name, PROGRESS_FILE)); } catch { return {}; } };
/** The labs the project `name` can run (core/labs.js listLabs): { labs, problems }. */
export async function projectLabs(name) {
  const pj = await api.project(name);
  return listLabs(pj.fileTree || [], rel => api.readFile(name, rel), { example: name });
}

/** Opens the lab `id` of the project in front (a link's lab=, web/js/link-open.js): false when it has none of that id. */
export async function openLabById(id) {
  const entry = S.project && (await projectLabs(S.project.name)).labs.find(l => l.id === id);
  if (!entry) return false;
  await openLab(entry);
  return true;
}

// A teacher's lab file (New Source ▸ Guided Lab, labs/<name>.lab.json) checked as it is edited (core/labs.js parseLab):
// Check Syntax of the file says its problems, and each save says them when they change (none: the lab can be run)
const saidProblems = new Map();   // (a lab file's problems last said, by its path)

/** Check Syntax of a lab file: its problems in the console. Resolves to true when it has none. */
export async function checkLabFile(path) {
  await saveAll();
  log(`\nStarted : "Check Syntax" of ${path}.\n`, 'hdr');
  const { problems } = parseLab(await api.readFile(S.project.name, path), path);
  saidProblems.set(path, problems.join('\n'));
  const lines = labFileLines(path, problems);
  for (const l of lines.slice(0, -1)) log(l, 'err');
  log(lines.at(-1), problems.length ? 'err' : 'ok', { diag: false });
  log(problems.length ? `\nProcess "Check Syntax" failed (${problems.length} error(s), 0 warning(s))` : '\nProcess "Check Syntax" completed successfully', problems.length ? 'err' : 'ok', { diag: false });
  return !problems.length;
}

/** A lab file saved (app.js flushDoc): its problems said when they changed since they were last; with none, an open Lab
 *  document of it reads it again (#3330: its steps, texts and checks; its progress kept). */
export async function labFileSaved(path) {
  const { lab, problems } = parseLab(await api.readFile(S.project.name, path), path);
  if (lab) for (const d of S.docs.filter(d => d.labSource === path && d.reload)) d.reload(lab, path);
  const key = problems.join('\n');
  if (saidProblems.get(path) === key || (!saidProblems.has(path) && !problems.length)) { saidProblems.set(path, key); return; }
  saidProblems.set(path, key);
  const lines = labFileLines(path, problems);
  for (const l of lines.slice(0, -1)) log(l, 'err');
  log(lines.at(-1), problems.length ? 'warn' : 'ok', { diag: false });
}

/** Project ▸ Guided Labs…: the labs of the project in a list, the one picked opened. */
export async function guidedLabsDialog() {
  if (!S.project) return;
  const name = S.project.name;
  const [{ labs, problems }, all] = await Promise.all([projectLabs(name), readProgress(name)]);
  for (const m of problems) log(`WARNING: ${m}`, 'warn');
  let close;
  const rows = labs.map(l => {
    const p = labProgress(all, l.lab);
    const done = l.lab.steps.filter(s => p.done[s.id]).length;
    return h('button', { type: 'button', class: 'lab-pick', 'data-lab': l.id, onclick: () => close(l) },
      h('span', { class: 'lab-pick-title', 'data-no-i18n': '', text: localize(l.lab.title, lang()) }),
      h('span', { class: 'lab-pick-from', text: l.source === 'silinx' ? `Silinx's, for the ${l.example} example` : l.source, 'data-no-i18n': l.source !== 'silinx' }),
      h('span', { class: 'lab-pick-done', text: `${done} of ${l.lab.steps.length} steps done` }));
  });
  const body = h('div', { class: 'lab-list' }, ...(rows.length ? rows : [h('p', {}, 'This project has no lab.')]));
  const picked = await dialog({ title: 'Guided Labs', body, buttons: [{ label: 'Cancel', value: null }], width: 480, onOpen: d => { close = d.close; } });
  if (picked) await openLab(picked);
}

/** Opens the lab `entry` (an entry of listLabs) of the project in front, at the step it was left at. */
export async function openLab(entry) {
  const id = `lab:${entry.id}`;
  const d = findDoc(id);
  if (d) { openDoc({ id }); return d; }
  // (a project's own lab: its file, which labFileSaved reads again into the document when it is saved)
  return openDoc({ id, title: labTitle(entry.lab), icon: 'help', create: (el, doc) => ({ labSource: entry.source, ...mountLab(el, doc, entry.lab) }) });
}
const labTitle = lab => `Lab: ${localize(lab.title, lang())}`;

// a step's text: `code` and **bold** of a small Markdown, the rest as it is
function richText(text) {
  const out = [];
  for (const part of String(text).split(/(`[^`]+`|\*\*[^*]+\*\*)/)) {
    if (!part) continue;
    if (/^`.+`$/.test(part)) out.push(h('code', {}, part.slice(1, -1)));
    else if (/^\*\*.+\*\*$/.test(part)) out.push(h('b', {}, part.slice(2, -2)));
    else out.push(part);
  }
  return out;
}

/** The lab document in `el`: its toolbar, its step, its Steps panel, its status line. */
export function mountLab(el, doc, lab) {
  const name = S.project.name;
  const io = projectIo(name);
  let all = {}, p = labProgress(all, lab), busy = false;
  const root = h('div', { class: 'lab' });
  const btn = (label, title, cmd, onclick) => h('button', { type: 'button', class: 'asm-btn asm-wide', 'data-cmd': cmd, title, onclick }, label);
  const checkBtn = btn('Check Step', 'Check this step on the project', 'check-step', () => check());
  const prevBtn = btn('◀ Previous', 'The previous step', 'prev-step', () => go(p.step - 1));
  const nextBtn = btn('Next ▶', 'The next step', 'next-step', () => go(p.step + 1));
  const line = statusLine();
  root.append(h('div', { class: 'asm-toolbar lab-bar' },
    h('div', { class: 'asm-group' }, checkBtn, prevBtn, nextBtn),
    h('div', { class: 'asm-spacer' }),
    h('div', { class: 'asm-group' }, panelToggle(root, h('button', { type: 'button', class: 'asm-btn asm-wide', 'data-panel': 'steps', title: 'Show / hide the steps panel' }, '☰ Steps'), { key: STEPS_KEY })),
    toolbarMenu([btn('Restart the Lab', 'Clear the steps done: the lab from its first step', 'restart-lab', () => restart())], { title: 'The lab', btnClass: 'asm-btn' }).el));
  const page = h('div', { class: 'lab-page', 'data-no-i18n': '' });
  const list = h('ol', { class: 'lab-steps' });
  const side = h('aside', { class: 'lab-side' }, h('div', { class: 'asm-cap' }, 'Steps'), list);
  root.append(h('div', { class: 'lab-main' }, page, side), line.el);
  el.append(root);
  mountSideFold({ root, side, key: 'silinx.lab.steps.folded', titles: { fold: 'Collapse the Steps panel', unfold: 'Expand the Steps panel' } });

  const save = () => api.writeFile(name, PROGRESS_FILE, progressText(all)).catch(e => log(`WARNING: the lab's progress is not saved (${PROGRESS_FILE}: ${e.message})`, 'warn'));
  function render() {
    const L = lang(), k = p.step, step = lab.steps[k - 1];
    const done = !!p.done[step.id], tries = p.tries[step.id] || 0;
    page.replaceChildren(
      ...(k === 1 && lab.intro ? [h('p', { class: 'lab-intro' }, ...richText(localize(lab.intro, L)))] : []),
      h('div', { class: 'lab-num' }, t(`Step ${k} of ${lab.steps.length}`)),
      h('h2', { class: 'lab-title' }, localize(step.title, L), done ? h('span', { class: 'lab-done', title: t('This step is done') }, ` ✓ ${t('Done')}`) : ''),
      h('p', { class: 'lab-text' }, ...richText(localize(step.text, L))),
      ...(!done && tries && step.hint ? [h('div', { class: 'lab-hint' }, h('b', {}, `${t('Hint')}: `), ...richText(localize(step.hint, L)))] : []));
    list.replaceChildren(...lab.steps.map((s, i) => h('li', { class: `lab-step${i + 1 === k ? ' current' : ''}${p.done[s.id] ? ' done' : ''}`, 'data-step': s.id, 'data-no-i18n': '',
      title: p.done[s.id] ? t('Done') : t('Not done yet'), onclick: () => go(i + 1) }, h('span', { class: 'lab-tick', 'aria-hidden': 'true' }, p.done[s.id] ? '✓' : String(i + 1)), localize(s.title, L))));
    prevBtn.disabled = k <= 1; nextBtn.disabled = k >= lab.steps.length; checkBtn.disabled = busy;
    const n = lab.steps.filter(s => p.done[s.id]).length;
    line.set([`Step ${k} of ${lab.steps.length}`, `${n} done`]);   // (translated as every status line)
    const label = doc.tab?.querySelector('.tlabel');
    if (label) { doc.title = labTitle(lab); label.textContent = doc.title; }
  }
  function go(k) {
    if (k < 1 || k > lab.steps.length || k === p.step) return;
    p.step = k;
    render();
    save();
  }
  async function check() {
    if (busy) return;
    busy = true; render();
    const step = lab.steps[p.step - 1];
    try {
      await saveAll();   // (as Check Syntax: the documents saved first)
      const result = await checkStep(step, io);
      recordTry(all, lab, step, result.ok);
      const lines = checkLines(lab, step, result, lang());
      log(`\n${lines[0]}\n`, 'hdr', { diag: false });
      for (const l of lines.slice(1, -1)) log(l, 'warn');
      if (!result.ok && step.hint) log(`Hint: ${localize(step.hint, lang())}`, '', { diag: false });
      log(lines.at(-1), result.ok ? 'ok' : 'warn', { diag: false });
      if (result.ok) { const next = nextOpen(lab, p, p.step); if (next) p.step = next; else log(`Every step of the lab "${localize(lab.title, lang())}" is done.`, 'ok', { diag: false }); }
      await save();
    } catch (e) { log(`ERROR: ${e.message}`, 'err'); }
    busy = false;
    render();
  }
  async function restart() {
    delete all[lab.id];
    p = labProgress(all, lab);
    await save();
    log(`Lab "${localize(lab.title, lang())}" restarted: no step done.`, '', { diag: false });
    render();
  }
  // the lab's file saved again (labFileSaved): its new steps, texts and checks, the steps done kept by their ids and the
  // step shown when it is still there
  function reload(next, path) {
    const shown = lab.steps[p.step - 1]?.id;
    lab = next;
    p = labProgress(all, lab);
    const k = lab.steps.findIndex(s => s.id === shown);
    if (k >= 0) p.step = k + 1;
    doc.lab = lab;
    log(`Lab "${localize(lab.title, lang())}" read again from ${path}: its steps as saved, the steps done kept.`, '', { diag: false });
    render();
  }
  const off = onLanguageChange(render);
  render();
  (async () => { all = await readProgress(name); p = labProgress(all, lab); render(); root.dataset.ready = '1'; })();
  return { lab, destroy: () => off(), checkStep: check, reload };
}
