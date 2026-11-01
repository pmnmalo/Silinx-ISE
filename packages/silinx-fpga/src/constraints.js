// Silinx toolchain - the constraints' model (#2385), the same whatever the format they are written in:
//   assignments    the pins: { name: { loc, iostandard, pull, drive, slew, clockDedicatedRoute } }
//   netStatements  the same in the order written, [{ net, attrs }] (ucf.js portAssignments: wildcards, the last one wins)
//   clocks         [{ net, period (ns), duty, name?, tnm? }]
//   other          what is not portable: the format's own statements, as text, for the back ends that know the format
//   format, name   the format's id, the file's name (for the log)
//   forPorts(ports) the same text read knowing the top's ports (a name may depend on them, #63)
// A format is { id, read(text, { ports }) -> the fields above, write(model) -> text }; a back end says its own
// (open-flow-backends.js), UCF when it says none. PCF is the iCE40's (pcf.js, #2295); LPF and CST are to come (#2296).
import { generateUcf, parseUcf } from './ucf.js';

export const UCF = {
  id: 'ucf',
  read: (text, { ports } = {}) => parseUcf(text, { ports }),
  write: ({ assignments, clocks, other }) => generateUcf({ assignments, clocks, other }),
};

/** The model of a constraints file's text in a format; null when there is no text. Throws what the format's reader throws. */
export function readConstraints(format, text, name = null) {
  if (!text) return null;
  return { ...format.read(text), format: format.id, name, forPorts: ports => format.read(text, { ports }) };
}

/** The constraints of a design with these ports: of a model, of UCF text, or a parseUcf result as it is. */
export function constraintsFor(constraints, ports) {
  if (typeof constraints === 'string') return parseUcf(constraints, { ports });
  return constraints?.forPorts ? constraints.forPorts(ports) : constraints;
}
