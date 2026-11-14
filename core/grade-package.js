// An exercise packaged for its students (#3191, #3841): the project a student starts from, made from the statement (the
// top module with the statement's ports and an empty body, in VHDL or Verilog), and the GitHub Classroom assignment's
// template repository, file by file: the starter project, the student's copy of the exercise (visibleCopy: no hidden
// test, no reference) with the files its visible tests read, the students' README and the workflow
// (core/classroom-template.js). Isomorphic: server/classroom.js makeTemplate writes these files to a folder, the
// Exercise document zips them in the page, the MCP server's `grade template` writes them to its exchange folder.
import { visibleCopy } from './grade-format.js';
import { workflowYaml, readmeText, WORKFLOW } from './classroom-template.js';
import { VERSION } from './version.js';

export const STARTER_LANGUAGES = ['vhdl', 'verilog'];
const DEVICE = Object.freeze({ family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' });

function vhdlTop(ex) {
  const type = p => (p.width === 1 ? 'std_logic' : `std_logic_vector(${p.width - 1} downto 0)`);
  const ports = ex.ports.map((p, k) => `    ${p.name} : ${p.dir} ${type(p)}${k < ex.ports.length - 1 ? ';' : ''}`);
  return ['library ieee;', 'use ieee.std_logic_1164.all;', '',
    `-- ${ex.top}: the exercise's top module, with the statement's ports. Its design is yours to write.`,
    `entity ${ex.top} is`, '  port (', ...ports, '  );', 'end entity;', '',
    `architecture rtl of ${ex.top} is`, 'begin', 'end architecture;', ''].join('\n');
}

function verilogTop(ex) {
  const ports = ex.ports.map((p, k) => `  ${p.dir === 'inout' ? 'inout' : p.dir === 'in' ? 'input' : 'output'} wire ${p.width > 1 ? `[${p.width - 1}:0] ` : ''}${p.name}${k < ex.ports.length - 1 ? ',' : ''}`);
  return [`// ${ex.top}: the exercise's top module, with the statement's ports. Its design is yours to write.`,
    `module ${ex.top} (`, ...ports, ');', 'endmodule', ''].join('\n');
}

/**
 * The starter project of an exercise: Map path -> text (its silinx.json and src/<top>.vhd or .v). `lang`: vhdl or
 * verilog; `board`, `device`: the teacher's project's (the Basys2's XC3S250E by default).
 */
export function starterProject(ex, { lang = 'vhdl', board = 'basys2', device = DEVICE } = {}) {
  if (!STARTER_LANGUAGES.includes(lang)) throw new Error(`the starter's language: ${STARTER_LANGUAGES.join(' or ')} (${lang})`);
  const file = `src/${ex.top}.${lang === 'vhdl' ? 'vhd' : 'v'}`;
  const pj = { name: ex.id, version: 1, device, ...(board && { board }), top: ex.top, preferredLanguage: lang, files: [{ path: file, lang, role: 'design' }] };
  return new Map([['silinx.json', `${JSON.stringify(pj, null, 2)}\n`], [file, lang === 'vhdl' ? vhdlTop(ex) : verilogTop(ex)]]);
}

/** The files the student's copy's visible tests read beside it (their `file`s), by their paths from the exercise's folder. */
export function besideFiles(copy) {
  return copy.tests.flatMap(t => [...(typeof t.file === 'string' ? [t.file] : []), ...(t.files || []).filter(f => typeof f?.file === 'string').map(f => f.file)]);
}

/**
 * The template repository of an exercise: Map path -> text, in the order makeTemplate writes them. `ex`: the exercise
 * read (its texts); `raw`: as its file writes it (the copy keeps its files beside it); `starter`: Map path -> text (a
 * project's files: its exercises, hidden files and build/ left out); `beside(rel)`: a file's text beside the exercise.
 */
export function templateFiles(ex, raw, { starter, beside, version = VERSION }) {
  const name = `${ex.id}.exercise.json`;
  const workflow = workflowYaml(name, { version });
  if (!starter.has('silinx.json')) throw new Error('the starter project has no silinx.json');
  const copy = visibleCopy(raw);
  const out = new Map();
  const hidden = rel => rel.split('/').some(s => s.startsWith('.')) || /^build(\/|$)/.test(rel) || /\.exercise\.json$/i.test(rel);
  for (const [rel, text] of starter) if (!hidden(rel)) out.set(rel, text);
  for (const rel of besideFiles(copy)) out.set(rel, beside(rel));
  out.set(name, `${JSON.stringify(copy, null, 2)}\n`);
  out.set('README.md', readmeText(ex, name));
  out.set('.gitignore', 'build/\n');
  out.set(WORKFLOW, workflow);
  return out;
}
