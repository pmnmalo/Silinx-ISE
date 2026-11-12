// The MCP server's Find in Project (server/mcp.js, #3546), as the page of the toolbar's Find (web/js/find-project.js):
// one search across every source of a project (its HDL, constraints, test benches and data files: their lines; its
// drawings: their texts), through the same functions (core/find.js), and its Replace All in the text sources not
// generated from a drawing (a generated HDL file is found but replaced in its drawing). What is replaced is written as
// write_file writes, through the import gate (#2830).
import * as P from './projects.js';
import { toolError, clip, readProject, STR, PROJECT } from './mcp-util.js';

const LISTED = 500;   // (the results listed at most, in the text and in the structured content)

// the project's texts to search: [{ path, text, drawing, generated }] (the drawings' HDL files: generated, as the
// interface reads them when it opens the project, web/js/project.js)
async function projectTexts(name, pj) {
  const { findPaths } = await import('../core/find.js');
  const tree = await P.fileTree(name);
  const read = p => P.readFile(name, p).catch(() => null);
  const generated = new Set();
  for (const f of tree.filter(f => /\.(sch|asm|tt|bool|fsm|pn)\.json$/.test(f))) {
    try { const d = JSON.parse(await read(f)); if (d.generatedFile && tree.includes(d.generatedFile)) generated.add(d.generatedFile); } catch { /* unreadable */ }
  }
  const out = [];
  for (const { path, drawing } of findPaths(tree, pj.files || [], pj.constraints)) {
    const text = await read(path);
    if (text != null) out.push({ path, text, drawing, ...(drawing ? {} : { generated: generated.has(path) }) });
  }
  return out;
}

const hitJson = (f, m) => (f.drawing ? { where: m.where, col: m.col, length: m.length, text: m.text } : { line: m.line, col: m.col, length: m.length, text: m.text });

export const FIND_TOOLS = [
  {
    name: 'find_in_project', title: 'Find in Project',
    description: 'Search every source of a project, as Find in Project (the toolbar\'s Find, Ctrl+Shift+F) does: its HDL, constraints, test benches and data files (each result its line and column) and the texts of its drawings (names, labels, expressions, notes: each result where it is in the drawing, as states[2].label). With replace, Replace All: every match in the text sources is replaced and the files written; an HDL file generated from a drawing is found but not replaced (replace in its drawing: read_file / write_file).',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, text: STR('The text to find (a regular expression with regex).'),
      match_case: { type: 'boolean', description: 'Match case (default: not).' },
      whole_word: { type: 'boolean', description: 'Whole word (default: not).' },
      regex: { type: 'boolean', description: 'text is a regular expression (JavaScript\'s; default: not).' },
      replace: STR('Replace All with this text ($1… a regular expression\'s groups, with regex); left out: find only.'),
    }, required: ['project', 'text'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: name, text, match_case: matchCase = false, whole_word: word = false, regex = false, replace }) {
      const pj = await readProject(name);
      if (typeof text !== 'string' || !text) throw toolError('text: the text to find');
      const { findPattern, findInProject, replaceInText } = await import('../core/find.js');
      const opts = { text, matchCase, word, regex };
      const { re, error } = findPattern(opts);
      if (error) throw toolError(`Invalid regular expression: ${error}`);
      const found = findInProject(await projectTexts(name, pj), re);
      const count = found.reduce((s, f) => s + f.hits.length, 0);
      const lines = [];
      let listed = 0;
      const files = found.map(f => {
        const hits = f.hits.slice(0, Math.max(0, LISTED - listed));
        listed += hits.length;
        lines.push(`${f.path} (${f.hits.length})${f.generated ? ' generated from its drawing: replace in the drawing' : ''}`,
          ...hits.map(m => `  ${f.drawing ? m.where : `${m.line}:${m.col}`}: ${m.text.replace(/\r?\n/g, '\\n')}`));   // (a drawing's text on one line)
        return { path: f.path, drawing: f.drawing, generated: !!f.generated, count: f.hits.length, hits: hits.map(m => hitJson(f, m)) };
      });
      if (listed < count) lines.push(`(the first ${LISTED} results listed)`);
      lines.push(count ? `${count} result(s) in ${found.length} file(s)` : 'No results');
      const data = { project: name, text, count, files };
      if (replace === undefined) return { text: clip(lines.join('\n')), data, untrusted: count ? 'the lines of the project\'s files' : undefined };
      // Replace All (web/js/find-project.js replace): the text sources not generated from a drawing
      const { GateError, gateFile } = await import('../core/import-gate.js');
      const replaced = [];
      let n = 0;
      for (const f of found.filter(f => !f.drawing && !f.generated)) {
        const r = replaceInText(f.text, findPattern(opts).re, replace, { regex });
        if (r.text === f.text) continue;
        try { gateFile(f.path, r.text); } catch (e) { if (e instanceof GateError) { lines.push(`WARNING: ${e.path}: not written: ${e.reason}`); continue; } throw e; }
        await P.writeFile(name, f.path, r.text);
        replaced.push({ path: f.path, count: r.count });
        n += r.count;
      }
      lines.push(replaced.length ? `${n} replacement(s) in ${replaced.length} file(s)` : 'Nothing replaced');
      return { text: clip(lines.join('\n')), data: { ...data, replaced }, untrusted: count ? 'the lines of the project\'s files' : undefined };
    },
  },
];
