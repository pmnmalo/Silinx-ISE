// The Petri Net Wizard (#208), New Source ▸ 'Petri Net' ▸ Wizard > (#958): the name, language and location (not
// shown from New Source, #2082) -> the inputs and outputs (the Schematic Wizard's table, inputs and outputs only, no
// quick-add buttons), the clock and the
// reset -> summary; it creates a .pn.json with those ports declared and no places yet, and opens it in
// the Petri net editor. The pages: web/js/modwizard.js (namePage, portEditor).
import { api } from './api.js';
import { h, alertDlg, toast } from './ui.js';
import { normalizePetri, petriErrors } from '/core/petri.js';
import { reservedError } from '/core/reserved.js';
import { wizard, field, replaceGuard, closeBeforeReplace } from './wizards.js';
import { namePage, portEditor } from './modwizard.js';
import { S, app } from './app.js';
import { portText, namedPages } from './wizard-util.js';


/** The net the wizard makes: the ports, the clock and the reset, nothing drawn yet. */
export function petriFromPorts({ name, lang, description = '', ports, clock = 'clk', reset = 'rst' }) {
  return normalizePetri({
    name, lang, clock, reset: { name: reset, active: 'high', sync: true },
    ...(description.trim() ? { description: description.trim() } : {}),
    inputs: ports.filter(p => p.dir === 'in').map(p => ({ name: p.name, width: +p.width })),
    outputs: ports.filter(p => p.dir === 'out').map(p => ({ name: p.name, width: +p.width })),
    places: [], transitions: [], arcs: [],
  });
}

export async function petriWizard({ name = '', location = 'src', lang = null, named = false, back = null } = {}) {
  const guard = replaceGuard('Petri Net Wizard');
  if (!S.project) return;
  const L = lang || (S.project.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  const p1 = namePage({
    title: 'Name and Language', name, lang: L, loc: location, guard, ext: '.pn.json', nameLabel: 'Petri net (module) name:',
    hint: 'The wizard creates a Petri net with its inputs and outputs declared, ready for you to draw its places, transitions and arcs; its HDL is generated from it.',
  });
  const ports = [];
  const pe = portEditor(ports, { lang: p1.lang, dirs: ['in', 'out'] });   // only the user's own ports (#2082); the clock and the reset: fields of their own
  const clkIn = h('input', { type: 'text', class: 'pw-clock', value: 'clk', style: { width: '100px' } });
  const rstIn = h('input', { type: 'text', class: 'pw-reset', value: 'rst', style: { width: '100px' } });
  const net = () => petriFromPorts({ name: p1.name(), lang: p1.lang(), description: p1.desc.value, ports, clock: clkIn.value.trim(), reset: rstIn.value.trim() });
  const p2 = {
    title: 'Inputs and Outputs',
    render: () => h('div', {}, pe.node,
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        ...field('Clock:', clkIn), ...field('Reset (synchronous, to the initial marking):', rstIn))),
    validate: () => {
      const err = pe.check(p1.name());
      if (err) return err;
      const r = reservedError(clkIn.value.trim()) || reservedError(rstIn.value.trim());
      if (r) return `${r}: choose another name.`;
      const errs = petriErrors(net());
      return errs.length ? errs[0].message : null;
    },
  };
  const summary = h('pre', { class: 'mw-summary code-box' });
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      const m = net();
      summary.textContent = [
        `The wizard will create the Petri net ${p1.path()} and open it in the Petri net editor.`,
        '',
        `Module: ${m.name} (${m.lang === 'vhdl' ? 'VHDL' : 'Verilog'})`,
        `Inputs: ${m.inputs.map(portText).join(', ') || 'none'}`,
        `Outputs: ${m.outputs.map(portText).join(', ') || 'none'}`,
        `Clock: ${m.clock}; reset: ${m.reset.name} (synchronous, active high)`,
        '',
        'Then draw its places, transitions and arcs; the outputs are set by the places (while marked) and the transitions (when they fire).',
      ].join('\n');
    },
    validate: () => guard(p1.path()),
  };
  const ok = await wizard('Petri Net Wizard', namedPages(p1.page, [p1.page, p2, pSum], named, p1.tail), { width: 820, back });
  if (!ok) return;
  let m;
  try { m = net(); } catch (e) { return alertDlg('Petri Net Wizard', e.message, 'error'); }
  const path = p1.path();
  await closeBeforeReplace(path);
  await api.writeFile(S.project.name, path, JSON.stringify(m, null, 2));
  await app.reloadProject();
  app.log(`Petri Net Wizard: created ${path} with ${m.inputs.length} input(s) and ${m.outputs.length} output(s).`, 'ok');
  toast(`Petri net ${m.name} created`, 'ok');
  app.openPetri(path);
  return path;
}
