#!/usr/bin/env node
// Silinx command line: start the web UI, check / simulate projects from the terminal, serve the
// workspace's projects to an AI assistant (MCP).
import fs from 'node:fs';
import path from 'node:path';
import { within } from '../server/paths.js';

const [cmd = 'serve', ...args] = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };

const USAGE = `usage:
  silinx serve [--port 8642] [--host 127.0.0.1] [--open]   start the Project Navigator web UI
  silinx check <projectDir> [--top name]            parse + elaborate the design
  silinx sim   <projectDir> [--top tb] [--time ns] [--vcd out.vcd]   run a behavioural simulation
  silinx ucf   <projectDir> --board basys2|nexys2|s3e-starter [--part xc3s100e]   pins from the board
  silinx grade <exercise.json> <submission…> [--visible] [--json out.json] [--csv out.csv] [--quiet]
                                                    grade submissions (project folders, zips, or a folder of
                                                        them) on an exercise's tests: a report per submission
  silinx grade <exercise.json> --student-copy <out.exercise.json>   the exercise without its hidden tests
  silinx classroom template <exercise.json> [<starter project>] <out folder> [--silinx-version x.y.z]
                            [--language vhdl|verilog]   a GitHub Classroom assignment's template (docs/CLASSROOM.md)
  silinx classroom grade <exercise.json> --org <org> --assignment <name> --out <folder> [--before <date>]
                         [--csv grades.csv] [--json grades.json] [--issues]   every test on the students' repositories
  silinx toolchain [--docker <image>]                show / set the ISE toolchain (docker image)
  silinx mcp                                        an MCP server on stdin / stdout: the workspace's
                                                        projects for an AI assistant (Claude Desktop…)
  silinx help                                       this text`;

// A path silinx.json names: inside the project, as the server confines it (it may come from someone else's project)
function insideProject(dir, rel) {
  const full = path.resolve(dir, String(rel));
  if (full === path.resolve(dir) || !within(path.resolve(dir), full)) throw new Error(`path escapes the project: ${rel}`);
  return full;
}

async function loadProject(dir) {
  let pj;
  try { pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8')); }
  catch (e) { throw new Error(e.code === 'ENOENT' ? `no Silinx project in ${dir} (silinx.json not found)` : `cannot read ${path.join(dir, 'silinx.json')}: ${e.message}`); }
  pj.files ||= [];
  const sources = pj.files.map(f => ({ ...f, text: fs.readFileSync(insideProject(dir, f.path), 'utf8') }));
  return { pj, sources };
}

async function main() {
  // help never runs a command (`serve --help` must not start a server)
  if (['help', '--help', '-h'].includes(cmd) || args.includes('--help') || args.includes('-h')) { console.log(USAGE); return; }
  switch (cmd) {
    case 'serve': {
      const { startServer, openBrowser, tokenFile } = await import('../server/server.js');
      const port = +opt('port', process.env.PORT || 8642), host = opt('host', '127.0.0.1');
      const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
      let srv;
      try {
        srv = await startServer({ port, host });
      } catch (e) {
        if (e.code !== 'EADDRINUSE') throw e;
        // already running (e.g. the launcher was double-clicked twice): opened, with a one-time code it gives for
        // the token it wrote for its owner (#2564), only when it proves it holds that token (#2955): a server
        // another user started on the port first is another program
        const { holdsToken, openCodeUrl } = await import('../server/open-code.js');
        let token = null;
        try { token = fs.readFileSync(tokenFile(port), 'utf8').trim(); } catch { /* none written */ }
        if (!await holdsToken(url, token)) { console.error(`Port ${port} is used by another program. Start Silinx on another port: node bin/silinx.js serve --port ${port + 1}`); process.exit(1); }
        console.log(`Silinx is already running at ${url}`);
        if (args.includes('--open')) {
          const code = await fetch(`${url}/api/open-code`, { method: 'POST', headers: { 'X-Silinx-Token': token } })
            .then(r => (r.ok ? r.json() : {})).then(j => j.code, () => null);
          await openBrowser(openCodeUrl(url, code));
        }
        process.exit(0);
      }
      if (args.includes('--open')) await openBrowser(srv.silinxOpenUrl());
      console.log('Keep this window open while you use Silinx. To stop it, close the window or press Ctrl+C.');
      break;
    }
    case 'check': case 'sim': {
      const dir = path.resolve(args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true) || '.');
      const { pj, sources } = await loadProject(dir);
      const { compile, elaborate } = await import('../core/compile.js');
      const { Simulator, toVCD } = await import('../core/simulator.js');
      const top = opt('top', cmd === 'sim' ? pj.simTop : pj.top);
      const lib = compile(cmd === 'check' ? sources.filter(s => s.role !== 'sim') : sources);
      const design = elaborate(lib, top);
      const diags = [...lib.errors, ...design.diags];
      for (const d of diags) console.log(`${d.severity.toUpperCase()}: ${d.file}:${d.line}:${d.col}: ${d.message}`);
      if (diags.some(d => d.severity === 'error')) process.exit(1);
      if (cmd === 'check') { console.log(`OK: ${top} elaborated (${design.signals.length} signals, ${design.procs.length} processes)`); break; }
      const files = new Map(sources.map(s => [s.path, s.text]));
      const sim = new Simulator(design, { files, onLog: e => console.log(`[${(e.time / 1000).toFixed(3)} ns] ${e.kind === 'print' ? '' : e.kind.toUpperCase() + ': '}${e.text}`) });
      const until = parseFloat(opt('time', '1000')) * 1000;
      const st = sim.run(until);
      console.log(`Simulation stopped at ${st.now / 1000} ns${st.finished ? ` (${st.finished})` : ''}`);
      const vcd = opt('vcd');
      if (vcd) { fs.writeFileSync(vcd, toVCD(design, sim)); console.log(`VCD written to ${vcd}`); }
      if (st.finished === 'error' || sim.log.some(l => l.kind === 'error' || l.kind === 'failure')) process.exit(2);
      break;
    }
    case 'ucf': {
      // Generate the UCF of the top module from a board's pin table (and set the project board).
      const dir = path.resolve(args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) || '.');
      const { pj, sources } = await loadProject(dir);
      const { resolveBoard } = await import('../server/devices.js');
      const { compile, elaborate } = await import('../core/compile.js');
      const { boardAutoAssign, generateUcf } = await import('../packages/silinx-fpga/src/parts.js');
      const boardId = opt('board', pj.board);
      if (!boardId) { console.error('no board: give --board <id> (e.g. basys2, nexys2, s3e-starter) or set the board of the project'); process.exit(1); }
      const rb = resolveBoard(boardId, { part: opt('part') || pj.device?.part });
      const board = rb && { ...rb.board, device: rb.device, resources: rb.resources };
      if (!board) { console.error(`unknown board '${boardId}'`); process.exit(1); }
      const design = elaborate(compile(sources.filter(s => s.role !== 'sim')), pj.top);
      if (!design.top) { console.error(`cannot elaborate top '${pj.top}'`); process.exit(1); }
      const ports = design.top.ports.map(p => ({ name: p.name, dir: p.dir, width: p.sig.t.w, msb: p.sig.t.w > 1 ? p.sig.t.left : null, lsb: p.sig.t.w > 1 ? p.sig.t.right : null }));
      const { assignments, clocks, matched, unmatched } = boardAutoAssign(ports, board);
      const text = generateUcf({ ports, assignments, clocks, header: `UCF for top '${pj.top}' on ${board.name} (${board.device.part}${board.device.speed}-${board.device.package}), generated by Silinx` });
      pj.board = board.id; pj.device = { ...board.device };
      pj.constraints ||= 'constraints/top.ucf';
      const ucfFile = insideProject(dir, pj.constraints);
      fs.mkdirSync(path.dirname(ucfFile), { recursive: true });
      fs.writeFileSync(ucfFile, text);
      // atomic (temp + rename): a running server never reads a half-written silinx.json
      const tmpPj = path.join(dir, `.silinx.json.${process.pid}.tmp`);
      fs.writeFileSync(tmpPj, JSON.stringify(pj, null, 2) + '\n');
      fs.renameSync(tmpPj, path.join(dir, 'silinx.json'));
      console.log(`${pj.constraints}: ${matched.join(', ')} assigned for ${board.name}${unmatched.length ? `; NOT assigned: ${unmatched.join(', ')}` : ''}`);
      break;
    }
    case 'grade': {
      const { gradeCommand } = await import('../server/grade-cli.js');
      process.exitCode = await gradeCommand(args, { out: t => process.stdout.write(t), err: t => process.stderr.write(t) });
      break;
    }
    case 'classroom': {
      const { classroomCommand } = await import('../server/classroom-cli.js');
      process.exitCode = await classroomCommand(args, { out: t => process.stdout.write(t), err: t => process.stderr.write(t) });
      break;
    }
    case 'toolchain': {
      // silinx toolchain [--docker <image>] [--settings path]  : show / configure the ISE toolchain
      const { saveConfig, detectToolchain } = await import('../server/toolchain.js');
      const image = opt('docker');
      if (image) {
        await saveConfig({ mode: 'docker', docker: { image, platform: 'linux/amd64', settings: opt('settings', '/opt/Xilinx/14.7/ISE_DS/settings64.sh'), extraArgs: [] } });
        console.log(`Silinx configured to run Xilinx ISE from docker image '${image}'.`);
      }
      const t = await detectToolchain();
      console.log(`${t.ise.mode === 'silinx' ? 'toolchain' : 'ISE'} (${t.ise.mode}): ${t.ise.available ? 'available' : 'NOT available'} - ${t.ise.reason}`);
      console.log(`programmers: ${Object.entries(t.programmers).filter(([, v]) => v.found).map(([k]) => k).join(', ') || 'none'}`);
      if (image && !t.ise.available) process.exit(1);
      break;
    }
    case 'mcp': {
      // stdout is the protocol's: whatever a module prints goes to stderr
      console.log = console.info = (...a) => process.stderr.write(`${a.join(' ')}\n`);
      const { serveMcp } = await import('../server/mcp.js');
      await serveMcp();
      break;
    }
    default:
      console.error(`silinx: unknown command '${cmd}'\n${USAGE}`);
      process.exit(1);
  }
}
main().catch(e => { console.error(process.env.SILINX_DEBUG ? e : `silinx: ${e?.message || e}`); process.exit(1); });
