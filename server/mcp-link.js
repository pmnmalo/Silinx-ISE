// The MCP server's tools of a design's link (#2826, server/mcp.js, #2674), as the interface's Copy Link… and the
// opening of a link: project_link makes a project's link (the project inside it, core/design-link.js; the view, the
// module), open_link makes a project of a link (the design inside it, or an example), as the interface does when it
// is opened at that address: a project of the workspace that differs is never replaced (#2829), one that is the same
// is the link's. A zip at an address is not fetched (the MCP server reaches nothing on the network): the client
// downloads it into the exchange folder and imports it (import_project).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';
import { LINK_LIMITS, LINK_VIEWS, SITE_URL, decodeDesign, encodeDesign, makeLink, parseLink, sameFiles, viewProblem } from '../core/design-link.js';

const VIEW_NAMES = { try: 'Try it', simulate: 'the simulation', emulate: 'the board emulator' };
const NEXT = { simulate: 'simulate runs its test bench', emulate: 'run_process bitstream builds it for the board', try: 'Try it is the interface\'s: a schematic\'s live simulation, a state diagram\'s or a Petri net\'s Simulate' };
const text = d => (typeof d === 'string' ? d : Buffer.from(d).toString('utf8'));

// a project's files as { path: text } (silinx.json left out)
async function projectFiles(name) {
  const out = {};
  for (const rel of await P.fileTree(name)) out[rel] = await fsp.readFile(P.safeJoin(P.projectDir(name), rel), 'utf8');
  return out;
}
const linkFail = e => (e.linkError ? toolError(e.message) : e);

export const LINK_TOOLS = [
  {
    name: 'project_link', title: 'Copy Link (a project\'s link)',
    description: `The link that opens a project in Silinx, as Copy Link… does (for lecture slides): the whole project inside the link (compressed; the HDL its drawings make again left out), and what it opens in: view try (Try it: a schematic's live simulation, a state diagram's or a Petri net's Simulate), simulate (its test bench's simulation) or emulate (the board emulator); top: the module (default the project's top). A link longer than ${LINK_LIMITS.slides} characters works in a browser but some slide tools cut it; one above ${LINK_LIMITS.maxEncoded} cannot be made (export_project kind silinx, a zip hosted elsewhere, and its link #open=<its https address>). Anyone with the link has the whole project, its comments included.`,
    inputSchema: { type: 'object', properties: {
      project: PROJECT, view: { type: 'string', enum: LINK_VIEWS, description: 'What the link opens: try, simulate or emulate (default: the project only).' },
      top: STR('The module to open (default: the project\'s top).'),
      base: STR(`The address of Silinx the link opens (default ${SITE_URL}, the site's latest release; e.g. a local server's http://localhost:3000/).`),
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, view, top, base = SITE_URL }) {
      const pj = await readProject(name);
      if (view !== undefined && !LINK_VIEWS.includes(view)) throw toolError(`view: one of ${LINK_VIEWS.join(', ')}`);
      let url;
      try { url = new URL(base); } catch { throw toolError(`base: '${base}' is not an address`); }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw toolError(`base: '${base}' is not an http(s) address`);
      const files = await projectFiles(name);
      const problem = viewProblem(pj, files, { view, top });
      if (problem) throw toolError(problem);
      const { exportProjectZip } = await import('./project-zip.js');
      const { gateZip } = await import('../core/import-gate.js');
      const { NODE_CODEC } = await import('./impl-routes.js');
      const entries = (await gateZip((await exportProjectZip(P, name, 'silinx')).zip, NODE_CODEC)).files;
      let e, link;
      try {
        e = await encodeDesign(entries);
        link = makeLink(url.href, { design: e.design, view, top });
      } catch (err) { throw linkFail(err); }
      const warnings = link.length > LINK_LIMITS.slides ? [`WARNING: the link is ${link.length} characters long: some slide tools cut a link longer than ${LINK_LIMITS.slides} (a zip hosted elsewhere makes a short one)`] : [];
      const lines = [...warnings, `The link of '${name}'${view ? `, opening ${VIEW_NAMES[view]}` : ''}${top ? ` of ${top}` : ''} (${link.length} characters${e.left.length ? `; ${e.left.join(', ')} made again from ${e.left.length > 1 ? 'their drawings' : 'its drawing'}` : ''}):`, link];
      return { text: lines.join('\n'), data: { project: name, link, length: link.length, view: view || null, top: top || null, left: e.left, warnings } };
    },
  },
  {
    name: 'open_link', title: 'Open a design from a link',
    description: 'Make a project of the workspace from a Silinx link (#design=… with the project inside it, or #open=example:<name>), as the interface does when opened at that link; returns what the link opens (view, top). The project is named after the design (or name); one of that name with the same files is the link\'s already (kept as it is), one that differs is never replaced (give another name, or delete_project first). A link to a zip at an address (#open=https://…) is not fetched: download it into the exchange folder and import_project it.',
    inputSchema: { type: 'object', properties: {
      link: STR('The link (the whole address, or its part from #).'),
      name: STR('The new project\'s name (default: the design\'s, or the example\'s).'),
    }, required: ['link'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ link, name }) {
      if (typeof link !== 'string' || !link) throw toolError('link: a Silinx link');
      let opts;
      try { opts = parseLink(link.includes('#') ? link.slice(link.indexOf('#')) : link); } catch (e) { throw linkFail(e); }
      if (!opts) throw toolError('the link has no design (#design=… or #open=…)');
      const { source, view, top, board } = opts;
      if (source.kind === 'zip') throw toolError(`the link opens a zip at ${source.url}: the MCP server fetches nothing from the network (download it into the exchange folder, then import_project)`);
      if (name !== undefined && !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(String(name))) throw toolError(`name: '${name}' is not a project name (a letter, then letters, digits, - and _)`);
      const warnings = [];
      let pjName, files, project, make;
      if (source.kind === 'design') {
        let d;
        try { d = await decodeDesign(source.design); } catch (e) { throw linkFail(e); }
        warnings.push(...d.warnings.map(w => `WARNING: ${w}`));
        pjName = name || d.name;
        project = d.project;
        files = Object.fromEntries(d.entries.filter(x => x.path !== 'silinx.json').map(x => [x.path, text(x.data)]));
        if (board && board !== project.board) warnings.push(`WARNING: the link's board ${board} is not the design's (${project.board || 'none'}): the design's kept`);
        make = async () => {
          const { importProjectEntries } = await import('./project-zip.js');
          // (the gate's result of decodeDesign, #2830; its refusals already among the link's warnings)
          const r = await importProjectEntries(P, pjName, d.gated, toolError);
          warnings.push(...r.warnings.filter(w => !d.warnings.includes(w)).map(w => `WARNING: ${w}`), ...r.missing.map(m => `WARNING: ${m}: listed by the project, not found`));
        };
      } else {
        const dir = path.join(P.EXAMPLES_DIR, source.name);
        if (!fs.existsSync(path.join(dir, 'silinx.json'))) throw toolError(`the link names no example '${source.name}' (list_examples)`);
        pjName = name || source.name;
        ({ project, files } = P.exampleFiles(source.name));
        const { BOARDS } = await import('./devices.js');
        if (board && !BOARDS.some(b => b.id === board)) throw toolError(`the link's board '${board}' is not a board (list_devices)`);
        const other = board && board !== project.board;
        // (on another board: New Project from the example for it, its pins the board's)
        make = async () => {
          if (other) { const { resolveBoard } = await import('./devices.js'); await P.createProject({ name: pjName, template: source.name, board, device: resolveBoard(board).device }); }
          else await P.createProject({ name: pjName, template: source.name });
        };
        if (other) project = { ...project, board };
      }
      const problem = viewProblem(project, files, { view, top });
      if (problem) throw toolError(problem);
      let created = false;
      if (fs.existsSync(P.projectDir(pjName))) {
        // the same project already (its files, silinx.json left out): the link's; else never replaced (#2829)
        const same = sameFiles(await projectFiles(pjName), files);
        if (!same) throw toolError(`project '${pjName}' exists and differs from the link's design: it is not replaced (give another name, or delete_project first)`);
      } else { await make(); created = true; }
      const pj = await P.readProject(pjName);
      const lines = [...warnings, `${created ? 'Opened the link as the new project' : 'The link\'s design is the project'} '${pjName}'${created ? '' : ' already (unchanged)'}: top ${pj.top || '(none)'}, ${pj.board || 'no board'}${view ? `; the link opens ${VIEW_NAMES[view]}${top ? ` of ${top}` : ''} (${NEXT[view]})` : ''}.`];
      return { text: lines.join('\n'), data: { project: pjName, created, view, top, board: pj.board || null, warnings } };
    },
  },
];
