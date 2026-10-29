// A change of the target device in Design Properties (#796, part of #787): before it is made, the design checked
// against the new device (packages/silinx-fpga/src/resource-check.js deviceChangeIssues): the modules that use a primitive the new
// family lacks, with its equivalent there, and the resources the design needs more of than the new part has
// (from the last synthesis or implementation's report, and the design's own primitive instances and ports). The
// user is told and may still change the device; the issues stay in the console as warnings.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { compile, elaborate } from '/core/compile.js';
import { resourcesOf, deviceChangeIssues, primitiveInstances, usedOfReport } from '/packages/silinx-fpga/src/parts.js';
import { S, app, withPrimitives } from './app.js';
import { inView } from './design.js';

/** The issues of the project's design on the device `next` ({ family, part, package }): their messages ([] when
 *  it fits, or the part is not in the database). db: the device database (S.devices). */
async function deviceChangeMessages(pj, next, db) {
  const to = db.parts.find(p => p.part === next.part);
  if (!to) return [];
  const fromPart = db.parts.find(p => p.part === pj.device?.part);
  const from = fromPart?.family || pj.device?.family;
  // the design's primitive instances and its top's port bits (the drawings' HDL among the sources)
  let instances = [], ports = 0;
  if (pj.top) {
    try {
      const srcs = S.sources.filter(s => inView(s.role, false) && (s.lang === 'vhdl' || s.lang === 'verilog'));
      const top = elaborate(compile(withPrimitives(srcs)), pj.top).top;
      instances = primitiveInstances(top);
      ports = (top?.ports || []).reduce((n, p) => n + (p.sig?.t?.w || 1), 0);
    } catch { /* a design that does not elaborate: its report only */ }
  }
  // the resources of its last synthesis or implementation, on the device it was made for
  let used = {};
  try { if (fromPart) used = usedOfReport(await api.reports(pj.name), resourcesOf(fromPart, pj.device.package)); } catch { /* no report */ }
  const familyName = db.families?.find(f => f.id === to.family)?.displayName || to.family;
  return deviceChangeIssues({ from, to, pkg: next.package, familyName, instances, used, ports }).messages;
}

/** Tell the user what the device change means for the design: true to change it (the issues logged as
 *  warnings), false to keep the device. No issue: true at once. */
export async function confirmDeviceChange(pj, next, db) {
  const messages = await deviceChangeMessages(pj, next, db);
  if (!messages.length) return true;
  const part = next.part.toUpperCase();
  const ok = await dialog({
    title: 'Device Change', width: 560, className: 'device-change',
    body: h('div', {},
      h('p', {}, `The design, as it is, does not fit the ${part}:`),
      h('ul', { class: 'device-change-issues' }, ...messages.map(m => h('li', {}, m))),
      h('p', {}, 'The device can still be changed: change the design (or choose another device) before running the flow.')),
    buttons: [{ label: 'Change Device', value: true, primary: true }, { label: 'Cancel', value: null }],
  });
  if (!ok) return false;
  for (const m of messages) app.log(`WARNING: ${part}: ${m}`, 'warn');
  return true;
}
