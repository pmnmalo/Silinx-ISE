// The MCP server's tools of a design's link (#2826, server/mcp.js, #2674), as the interface's Share Project… and the
// opening of a link: project_link makes a project's link (the project inside it, core/design-link.js; the view, the
// module, a guided lab opened beside it), open_link makes a project of a link (the design inside it, or an example),
// as the interface does when it is opened at that address: a project of the workspace that differs is never replaced
// (#2829), one that is the same is the link's. A zip at an address is not fetched (the MCP server reaches nothing on the
// network but GitHub's API): the client downloads it into the exchange folder and imports it (import_project). A short
// link (#3223, core/gist-link.js): project_link short makes one (a secret gist of the account of the server's GH_TOKEN),
// open_link opens one (its gist read through GitHub's API, no token needed).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';
import { projectNameError } from '../core/project-name.js';
import { QR_MAX_BYTES, qrSvg } from '../core/qr.js';
import { BOARD_RE, MODULE_RE, LINK_LIMITS, LINK_VIEWS, SITE_URL, decodeDesign, encodeDesign, makeLink, parseLink, sameFiles, viewProblem } from '../core/design-link.js';

const VIEW_NAMES = { try: 'Try it', simulate: 'the simulation', emulate: 'the board emulator' };
const NEXT = { simulate: 'simulate runs its test bench', emulate: 'run_process bitstream builds it for the board', try: 'Try it is the interface\'s: a schematic\'s live simulation, a state diagram\'s, a Petri net\'s or an ASM chart\'s simulation' };
const text = d => (typeof d === 'string' ? d : Buffer.from(d).toString('utf8'));

// a project's files as { path: text } (silinx.json left out)
async function projectFiles(name) {
  const out = {};
  for (const rel of await P.fileTree(name)) out[rel] = await fsp.readFile(P.safeJoin(P.projectDir(name), rel), 'utf8');
  return out;
}
const linkFail = e => (e.linkError ? toolError(e.message) : e);
// the ids of the guided labs a project can run (core/labs.js listLabs, #3179)
async function labIds(name) {
  const { listLabs } = await import('../core/labs.js');
  return (await listLabs(await P.fileTree(name), rel => P.readFile(name, rel), { example: name })).labs.map(l => l.id);
}

export const LINK_TOOLS = [
  {
    name: 'project_link', title: 'A project\'s link (Share Project…, a copy)',
    description: `The link that opens a project in Silinx, as Share Project… does with A copy chosen (Share Module… with top) (for lecture slides): the whole project inside the link (compressed; the HDL its drawings make again left out), and what it opens in: view try (Try it: a schematic's live simulation, a state diagram's, a Petri net's or an ASM chart's simulation), simulate (its test bench's simulation) or emulate (the board emulator); top: the module (default the project's top). A link longer than ${LINK_LIMITS.slides} characters works in a browser but some slide tools cut it; one above ${LINK_LIMITS.maxEncoded} cannot be made (export_project kind silinx, a zip hosted elsewhere, and its link #open=<its https address>). Anyone with the link has the whole project, its comments included.`,
    inputSchema: { type: 'object', properties: {
      project: PROJECT, view: { type: 'string', enum: LINK_VIEWS, description: 'What the link opens: try, simulate or emulate (default: the project only).' },
      top: STR('The module to open (default: the project\'s top); with view simulate, the test bench to simulate (default: the project\'s); a test bench only with simulate.'),
      base: STR(`The address of Silinx the link opens (default ${SITE_URL}, the site's latest release; e.g. a local server's http://localhost:3000/).`),
      lab: STR('A guided lab of the project to open beside it (its id: lab action list).'),
      short: { type: 'boolean', description: 'A short link (#gist=…, about 140 characters): the project encrypted and saved as a secret gist of the GitHub account of the server\'s token (GH_TOKEN); only the link opens it.' },
      qr: { type: 'boolean', description: `The link's QR code too, as the interface shows it (#3637): qr, an SVG (black on white). A link longer than a QR code holds (${QR_MAX_BYTES} bytes) has none, a warning saying so (a short link has one).` },
      expires_days: { type: 'integer', minimum: 0, maximum: 3650, description: 'With short: the link expires after this many days, opening it then refused (0 or none: never; Share Project… offers 7, 30, 182, 365). Making a short link deletes the account\'s expired Silinx gists.' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run({ project: name, view, top, base = SITE_URL, lab, short = false, expires_days: days = 0, qr = false }) {
      const pj = await readProject(name);
      if (view !== undefined && !LINK_VIEWS.includes(view)) throw toolError(`view: one of ${LINK_VIEWS.join(', ')}`);
      let url;
      try { url = new URL(base); } catch { throw toolError(`base: '${base}' is not an address`); }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw toolError(`base: '${base}' is not an http(s) address`);
      const files = await projectFiles(name);
      const problem = viewProblem(pj, files, { view, top });
      if (problem) throw toolError(problem);
      if (lab !== undefined) { const ids = await labIds(name); if (!ids.includes(lab)) throw toolError(`lab: no lab '${lab}' in the project '${name}' (${ids.join(', ') || 'none'})`); }
      const { exportProjectZip } = await import('./project-zip.js');
      const { gateZip } = await import('../core/import-gate.js');
      const { NODE_CODEC } = await import('./impl-routes.js');
      const entries = (await gateZip((await exportProjectZip(P, name, 'silinx')).zip, NODE_CODEC)).files;
      let e, link;
      try {
        e = await encodeDesign(entries);
        link = makeLink(url.href, { design: e.design, view, top, lab });
      } catch (err) { throw linkFail(err); }
      if (days && !short) throw toolError('expires_days: only a short link expires (give short: true)');
      if (short) {
        const GH = await import('./git-github.js');
        let g;
        try { g = await GH.makeGist(e.design, { days }); } catch (err) { throw toolError([err.message, ...(err.hint ? [`Hint: ${err.hint}`] : [])].join('\n')); }
        link = makeLink(url.href, { gist: `${g.id}.${g.key}`, view, top, lab });
        const svg = qr ? qrSvg(link) : null;
        return { text: `${svg ? 'With its QR code (qr, an SVG). ' : ''}The short link of '${name}'${view ? `, opening ${VIEW_NAMES[view]}` : ''}${top ? ` of ${top}` : ''}${lab ? `, with the lab '${lab}'` : ''} (${link.length} characters; the project encrypted in a secret gist${g.url ? `, ${g.url}` : ''}${g.expires ? `; it expires on ${g.expires.slice(0, 10)}` : ''}):\n${link}${g.deleted.length ? `\n${g.deleted.length} expired short link${g.deleted.length > 1 ? 's' : ''} deleted from the account's gists.` : ''}`, data: { project: name, link, length: link.length, view: view || null, top: top || null, ...(lab ? { lab } : {}), left: e.left, warnings: [], gist: g.id, expires: g.expires, deleted: g.deleted, ...(svg ? { qr: svg } : {}) } };
      }
      const warnings = link.length > LINK_LIMITS.slides ? [`WARNING: the link is ${link.length} characters long: some slide tools cut a link longer than ${LINK_LIMITS.slides} (a zip hosted elsewhere makes a short one)`] : [];
      const svg = qr ? qrSvg(link) : null;
      if (qr && !svg) warnings.push(`WARNING: the link is ${link.length} characters, too long for a QR code (at most ${QR_MAX_BYTES}): a short link (short: true) has one`);
      const lines = [...warnings, `The link of '${name}'${view ? `, opening ${VIEW_NAMES[view]}` : ''}${top ? ` of ${top}` : ''}${lab ? `, with the lab '${lab}'` : ''} (${link.length} characters${e.left.length ? `; ${e.left.join(', ')} made again from ${e.left.length > 1 ? 'their drawings' : 'its drawing'}` : ''}${svg ? '; its QR code: qr, an SVG' : ''}):`, link];
      return { text: lines.join('\n'), data: { project: name, link, length: link.length, view: view || null, top: top || null, ...(lab ? { lab } : {}), left: e.left, warnings, ...(svg ? { qr: svg } : {}) } };
    },
  },
  {
    name: 'open_link', title: 'Open a design from a link',
    description: 'Make a project of the workspace from a Silinx link (#design=… with the project inside it, #gist=… a short link\'s, or #open=example:<name>), as the interface does when opened at that link; returns what the link opens (view, top, lab: a guided lab). The project is named after the design (or name); one of that name with the same files is the link\'s already (kept as it is), one that differs is never replaced (give another name, or delete_project first). A link to a zip at an address (#open=https://…) is not fetched: download it into the exchange folder and import_project it.',
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
      const { source, view, top, board, lab = null } = opts;
      if (source.kind === 'zip') throw toolError(`the link opens a zip at ${source.url}: the MCP server fetches nothing from the network (download it into the exchange folder, then import_project)`);
      // (a short link: its gist read from GitHub, then the design as a design link's)
      if (source.kind === 'gist') {
        try { opts.source = { kind: 'design', design: await (await import('./git-github.js')).readGist(source) }; } catch (e) { throw linkFail(e); }
        return LINK_TOOLS[1].run({ link: makeLink(SITE_URL, { design: opts.source.design, view: view || null, top: top || null, board: board || null, lab }), name });
      }
      if (name !== undefined && projectNameError(String(name))) throw toolError(projectNameError(String(name)));
      const warnings = [];
      let pjName, files, project, make;
      if (source.kind === 'design') {
        let d;
        try { d = await decodeDesign(source.design); } catch (e) { throw linkFail(e); }
        warnings.push(...d.warnings.map(w => `WARNING: ${w}`));
        pjName = name || d.name;
        project = d.project;
        // (the design's own board and modules checked as names, as the link's board= and top= are, #3528)
        for (const k of ['top', 'simTop']) if (project[k] != null && project[k] !== '' && !(typeof project[k] === 'string' && MODULE_RE.test(project[k]))) throw toolError(`the link's design: its ${k} is not a module name`);
        if (project.board != null && project.board !== '' && !(typeof project.board === 'string' && BOARD_RE.test(project.board))) throw toolError('the link\'s design: its board is not a board name');
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
          if (other) { const { resolveBoard } = await import('./devices.js'); await P.createProject({ name: pjName, template: source.name, board, device: resolveBoard(board).device, madeBy: 'mcp' }); }
          else await P.createProject({ name: pjName, template: source.name, madeBy: 'mcp' });   // (untrusted, #2981)
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
      if (lab && !(await labIds(pjName)).includes(lab)) warnings.push(`WARNING: the project has no lab '${lab}' (lab action list)`);
      const lines = [...warnings, `${created ? 'Opened the link as the new project' : 'The link\'s design is the project'} '${pjName}'${created ? '' : ' already (unchanged)'}: top ${pj.top || '(none)'}, ${pj.board || 'no board'}${view ? `; the link opens ${VIEW_NAMES[view]}${top ? ` of ${top}` : ''} (${NEXT[view]})` : ''}${lab ? `; the link opens the lab '${lab}' (lab action show)` : ''}.`];
      // (a design's names and its warnings, which name its files: the link's own text, #3528)
      return { text: lines.join('\n'), data: { project: pjName, created, view, top, board: pj.board || null, ...(lab ? { lab } : {}), warnings },
        untrusted: source.kind === 'design' ? 'the link\'s design: its names, and the warnings, which name its files' : warnings.length ? 'the warnings' : undefined };
    },
  },
  // File ▸ Short Links… (#3635, web/js/short-links.js): the short links of the account of the server's GH_TOKEN
  {
    name: 'short_links', title: 'Short Links (list)',
    description: 'The short links (#gist=…) of the GitHub account of the server\'s token (GH_TOKEN), as File ▸ Short Links… lists them: its Silinx gists, the newest first, each with when it was made, when it expires (or never) and whether it has expired. The link itself is not on GitHub (its key is only in the link): project_link short\'s answer is the only copy.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run() {
      const GH = await import('./git-github.js');
      let list;
      try { list = await GH.listShortLinks(); } catch (err) { throw toolError([err.message, ...(err.hint ? [`Hint: ${err.hint}`] : [])].join('\n')); }
      const day = iso => String(iso || '').slice(0, 10);
      const lines = list.length ? [`${list.length} short link${list.length > 1 ? 's' : ''}, the newest first:`, ...list.map(g => `${g.id}: made ${day(g.created) || '?'}, ${g.expires ? `${g.expired ? 'expired' : 'expires'} ${day(g.expires)}` : 'never expires'} (${g.url})`)] : ['No short link in the account.'];
      return { text: lines.join('\n'), data: { links: list } };
    },
  },
  {
    name: 'delete_short_link', title: 'Short Links (delete)',
    description: 'Delete short links of the account of the server\'s token (GH_TOKEN), as Short Links…\'s Delete Selected and Delete Expired do: gists (their ids, from short_links), or the expired ones (expired: true); only Silinx\'s gists of the account, any other id refused before anything is deleted. A deleted link no longer opens.',
    inputSchema: { type: 'object', properties: {
      gists: { type: 'array', items: { type: 'string' }, description: 'The gists\' ids (short_links).' },
      expired: { type: 'boolean', description: 'Delete every expired short link instead.' },
    }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async run({ gists = [], expired = false }) {
      if (!expired && !gists.length) throw toolError('give gists (their ids: short_links) or expired: true');
      if (expired && gists.length) throw toolError('give gists or expired: true, not both');
      const GH = await import('./git-github.js');
      let deleted;
      try { deleted = await GH.deleteShortLinks({ ids: gists, expired }); } catch (err) { throw toolError([err.message, ...(err.hint ? [`Hint: ${err.hint}`] : [])].join('\n')); }
      return { text: `${deleted.length} short link${deleted.length === 1 ? '' : 's'} deleted${expired ? ' (the expired ones)' : ''}${deleted.length ? `: ${deleted.join(', ')}` : ''}.`, data: { deleted } };
    },
  },
];
