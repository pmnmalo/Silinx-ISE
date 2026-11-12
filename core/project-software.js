// The software a project's zip comes from or goes to (#3703: the Software: row of Import Project (.zip)… and Export
// Project (.zip)…). Silinx reads and writes a Silinx project (silinx.json and every file) and a Xilinx ISE one (its
// .xise and its sources); not yet an AMD Vivado project (.xpr) nor an Intel Quartus one (.qpf, .qsf): those are shown
// disabled, their reason their tip, never a choice that fails.
//
//   SOFTWARE: [{ id, label, reason? }]   (id: an export's kind, server/project-zip.js; reason: why it is disabled)
//   projectSoftware(paths) -> id | null  the software of a zip's (or a folder's) files, as the import reads them
//     (server/project-zip.js importProjectEntries, web/js/project-store.js projectFromZip): a .xise, an ISE project;
//     else a silinx.json, a Silinx one; else a .xpr, a Vivado one; a .qpf or a .qsf, a Quartus one.

export const SOFTWARE = Object.freeze([
  { id: 'silinx', label: 'Silinx' },
  { id: 'xilinx', label: 'Xilinx ISE' },
  { id: 'vivado', label: 'AMD Vivado', reason: 'Silinx does not read or write an AMD Vivado project (.xpr) yet.' },
  { id: 'quartus', label: 'Intel Quartus', reason: 'Silinx does not read or write an Intel Quartus project (.qpf, .qsf) yet.' },
].map(Object.freeze));

/** The software Silinx reads and writes a project of (an export's kinds). */
export const SUPPORTED = Object.freeze(SOFTWARE.filter(s => !s.reason).map(s => s.id));

/** The software of a project given its files' paths (a zip's entries, a folder's files), or null. */
export function projectSoftware(paths) {
  const names = [...paths].map(p => String(p).split('/').pop());
  const has = re => names.some(n => re.test(n));
  if (has(/\.xise$/i)) return 'xilinx';
  if (has(/^silinx\.json$/i)) return 'silinx';
  if (has(/\.xpr$/i)) return 'vivado';
  if (has(/\.(qpf|qsf)$/i)) return 'quartus';
  return null;
}
