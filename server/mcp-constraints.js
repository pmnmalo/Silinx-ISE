// The MCP server's Check Constraints (#2296), the interface's process (web/js/implement.js checkUcfFile): a project's
// constraints file read in its device's format with the same checks and messages, a UCF's by ucf.js checkUcf, a PCF's,
// an LPF's, a CST's and an XDC's by core/constraints-check.js (the line the back end would stop at; the names that are no
// port of the top; a pin of no pin of the package, given twice, on no resource of the board, at another voltage than its
// bank's), each line as ConstraintSystem's in the console.
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, diagLine, diagJson } from './mcp-util.js';

// the top's ports as the interface's check reads them (web/js/drawings.js ucfPort), its language; none when it does not elaborate
async function topPorts(name, pj) {
  if (!pj.top) return { ports: [], lang: 'vhdl' };
  try {
    const { elaborateView } = await import('./mcp-util.js');
    const { design, srcs, lib } = await elaborateView(name);
    const ports = (design?.top?.ports || []).map(p => {
      const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar);
      return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null };
    });
    const file = [...(lib?.modules?.values() || [])].find(m => m.name === pj.top)?.file;
    return { ports, lang: srcs?.find(s => s.path === file)?.lang || 'vhdl' };
  } catch { return { ports: [], lang: 'vhdl' }; }
}

export const CONSTRAINTS_TOOLS = [
  {
    name: 'check_constraints', title: 'Check Constraints',
    description: 'Check a constraints file (default: the project\'s) as the interface\'s Check Constraints does, in the device\'s format: UCF (Spartan), PCF (iCE40), LPF (ECP5), CST (Gowin) or XDC (7-series). Its errors and warnings with their line: the syntax, the names that are no port of the top, the ports with no pin, and the pins (one that is no pin of the device\'s package, one given to two ports, one on no resource of the board, an I/O standard at another voltage than its bank\'s on the board).',
    inputSchema: { type: 'object', properties: { project: PROJECT, file: STR('The constraints file (default: the project\'s constraints file).') }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, file }) {
      const pj = await readProject(name);
      const path = file || pj.constraints;
      if (!path) throw toolError(`the project '${name}' has no constraints file: give file`);
      if (!/\.(ucf|pcf|lpf|cst|xdc)$/i.test(path)) throw toolError(`${path} is not a constraints file (.ucf, .pcf, .lpf, .cst, .xdc)`);
      let text;
      try { text = await P.readFile(name, path); } catch { throw toolError(`${path} cannot be read.`); }
      const { ports, lang } = await topPorts(name, pj);
      const { resolveBoard, findPart, findFamily } = await import('./devices.js');
      const r = pj.board ? resolveBoard(pj.board, { part: pj.device?.part }) : null;
      const board = r ? { ...r.board, resources: r.resources } : null;
      const ext = path.split('.').pop().toLowerCase();
      let diags;
      if (ext === 'ucf') {
        const { checkUcf } = await import('../packages/silinx-fpga/src/parts.js');
        const iostandards = findFamily(findPart(pj.device?.part)?.family || pj.device?.family)?.ioStandards || null;
        diags = checkUcf(text, { top: pj.top, ports, lang, iostandards, board, package: pj.device?.package });
      } else {
        const { constraintsDiagnostics } = await import('../core/constraints-check.js');
        diags = constraintsDiagnostics(ext, text, ext === 'xdc' ? { ports } : { ports, top: pj.top || null, device: pj.device, board });
      }
      diags = diags.map(d => ({ ...d, file: path, tool: 'ConstraintSystem' }));
      const errors = diags.filter(d => d.severity === 'error'), warnings = diags.filter(d => d.severity !== 'error');
      const lines = [`Started : "Check Constraints" of ${path}.`, ...diags.map(diagLine),
        errors.length ? `Process "Check Constraints" failed (${errors.length} error(s), ${warnings.length} warning(s))`
          : `Process "Check Constraints" completed successfully${warnings.length ? ` with ${warnings.length} warning(s)` : ''}`];
      return { text: lines.join('\n'), data: { project: name, file: path, ok: !errors.length, errors: errors.map(diagJson), warnings: warnings.map(diagJson) } };
    },
  },
];
