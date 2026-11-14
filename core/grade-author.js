// Authoring an exercise (#3191, #3831) from a project that holds the right design: its reference made of the project's
// design (Reference from the Project, the MCP server's `grade reference`), and a vectors test's expected outputs filled
// from that reference (Expected from the Reference, `grade expected`): the teacher writes the rows' inputs only. The
// reference runs as a reference test's does (core/grade-sim.js referenceRows: compiled on its own, within the test's
// limits). Isomorphic: the Exercise document runs it in the page, server/grade-run.js in a grading process.
import { parseVectors, limitsOf } from './grade-format.js';
import { referenceRows } from './grade-sim.js';
import { submissionSources } from './grade-design.js';

/**
 * A project's design as an exercise's reference: { reference: { files }, problems }. A file of the project inside the
 * exercise's folder `dir` ('' the project's root) is listed by its path ({ path, file }, read when the tests run: the
 * reference follows the design as the teacher edits it); a drawing's HDL not saved as it is made, or a file outside the
 * folder, is written into the exercise ({ path, text }). `submission`: { project, files } (core/grade-design.js).
 */
export function projectReference(submission, dir = '') {
  const { sources, errors } = submissionSources(submission);
  if (errors.length) return { reference: null, problems: errors };
  if (!sources.length) return { reference: null, problems: ['the project has no design file'] };
  const inside = p => !dir || p.startsWith(`${dir}/`);
  const files = sources.map(s => (inside(s.path) && submission.files.get(s.path) === s.text
    ? { path: s.path, file: dir ? s.path.slice(dir.length + 1) : s.path }
    : { path: s.path, text: s.text }));
  return { reference: { files }, problems: [] };
}

// a vectors line split: what is before the '|' (the inputs, as written), the outputs' tokens, the comment
function splitLine(raw) {
  const c = raw.indexOf('#');
  const body = c < 0 ? raw : raw.slice(0, c), comment = c < 0 ? '' : raw.slice(c);
  const bar = body.indexOf('|');
  return { ins: (bar < 0 ? body : body.slice(0, bar)).trimEnd(), outs: bar < 0 ? [] : body.slice(bar + 1).trim().split(/\s+/).filter(Boolean), bar: bar >= 0, comment };
}

// the style of an output's column, from a value written in it: hex, 0b, binary (as many digits as the port is wide)
// or decimal (the default but for a 1-bit port's)
function styleOf(tokens, width) {
  const t = tokens.find(x => x && x !== '-');
  if (!t) return width === 1 ? 'bin' : 'dec';
  if (/^0x/i.test(t)) return 'hex';
  if (/^0b/i.test(t)) return '0b';
  return /^[01xz_]+$/i.test(t) && t.replace(/_/g, '').length === width ? 'bin' : 'dec';
}

// an output's bits (0 1 and -, the reference's X and Z) in its column's style; a value with a don't-care bit in binary
function formatBits(raw, style) {
  const bits = raw.replace(/[^01]/g, '-');
  if (/^-+$/.test(bits)) return '-';
  if (bits.includes('-') || style === 'bin') return bits;
  const n = BigInt(`0b${bits}`);
  return style === 'hex' ? `0x${n.toString(16).toUpperCase()}` : style === '0b' ? `0b${bits}` : n.toString();
}

/**
 * A vectors test's text with its outputs filled from the exercise's reference design: { text, rows, problems }. The
 * rows' inputs, the comments and the header stay as written; a row's outputs, left out, `-` or written, become the
 * reference's (an X or Z of it: `-`, not compared), each in its column's style. `ex`: the exercise with its files' texts
 * (withFileTexts); `test`: a vectors test (its `vectors`, its file's text read).
 */
export function expectedFromReference(ex, test) {
  const fail = m => ({ text: null, rows: 0, problems: [m] });
  if (test?.kind !== 'vectors') return fail('Expected from the Reference fills a vectors test');
  const refs = ex.reference?.files;
  if (!Array.isArray(refs) || !refs.length || refs.some(f => typeof f?.text !== 'string')) return fail('the exercise has no reference design (Reference from the Project makes it of the project\'s)');
  const lines = String(test.vectors ?? '').split(/\r?\n/);
  const at = lines.findIndex(l => splitLine(l).ins || splitLine(l).bar);
  if (at < 0) return fail('the vectors are empty: a line of the inputs\' names, a \'|\', the outputs\' names, then a row of inputs per cycle');
  const head = splitLine(lines[at]);
  const nOut = head.outs.length;
  // (each row's outputs, whatever they were, made don't cares: the names and the inputs are checked as a test's are)
  const blank = lines.map((l, k) => {
    const s = splitLine(l);
    if (k <= at || !s.ins) return l;
    return `${s.ins} | ${Array(nOut).fill('-').join(' ')}`;
  });
  const vec = parseVectors(blank.join('\n'), ex.ports || [], { clock: test.clock });
  if (vec.problems.length) return { text: null, rows: 0, problems: vec.problems };
  const r = referenceRows(refs, ex.top, ex.ports, { inputs: vec.inputs, rows: vec.rows }, { clock: test.clock, periodNs: test.periodNs ?? 20, limits: limitsOf(ex, test) });
  if (r.problems.length) return { text: null, rows: 0, problems: r.problems };
  const col = vec.outputs.map(p => r.outputs.findIndex(o => o.name.toLowerCase() === p.name.toLowerCase()));
  const rowAt = new Map(vec.rows.map((row, k) => [row.line, r.rows[k]]));
  const styles = vec.outputs.map((p, j) => styleOf(lines.slice(at + 1).map(l => splitLine(l).outs[j]), p.width));
  const text = lines.map((l, k) => {
    const row = rowAt.get(k + 1);
    if (!row) return l;
    const s = splitLine(l);
    const outs = vec.outputs.map((_, j) => formatBits(row.out[col[j]], styles[j]));
    return `${s.ins} | ${outs.join(' ')}${s.comment ? `  ${s.comment}` : ''}`;
  }).join('\n');
  return { text, rows: vec.rows.length, problems: [] };
}
