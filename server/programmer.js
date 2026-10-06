// JTAG scan + SRAM programming of Xilinx FPGA boards (Spartan-3/3A/3E/6, Virtex, 7-series).
//
// Supported tools (all run locally, spawned with argument arrays):
//   openFPGALoader  openFPGALoader -c <cable> --detect
//                   openFPGALoader -c <cable> [--index-chain N] file.bit        (SRAM load only for Spartan-3E)
//   xc3sprog        xc3sprog -c <cable> -j
//                   xc3sprog -c <cable> -v -p <pos> file.bit
//   djtgcfg         djtgcfg enum ; djtgcfg init -d <dev>
//                   djtgcfg prog -d <dev> -i <index> -f file.bit                (Digilent Adept 2 utilities)
//   impact          impact -batch <cmdfile>   with setMode -bs / setCable -port auto / Identify / assignFile / Program / quit
//   adepttool       python basys2_prog.py [--device N] file.bit ; python list.py
//                   (open-source driver for the Digilent Adept USB of the Basys2: github.com/mwkmwkmwk/adepttool,
//                    installed by scripts/install-adepttool.sh into ~/.xailinx/adepttool)
//
// Positions: iMPACT numbers chain devices from 1; xc3sprog, djtgcfg and openFPGALoader from 0.

import fs from 'node:fs/promises';
import fss from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand } from './jobs.js';
import { loadConfig, detectIse, resolveTool, which } from './toolchain.js';
import { findBoard, resolveBoard } from './devices.js';
import { splitBitPart, familyOfPart, familyName } from '../core/family.js';

export const TOOLS = ['openFPGALoader', 'xc3sprog', 'djtgcfg', 'impact', 'adepttool'];

// ---------------------------------------------------------------------------------------------
// Bitstream header
// ---------------------------------------------------------------------------------------------

/**
 * Parse a Xilinx .bit header:
 *   u16 len(9) + 9 magic bytes, u16 (=1), then fields:
 *   'a' u16 len  design name (e.g. "top.ncd;UserID=0xFFFFFFFF")
 *   'b' u16 len  part name   (e.g. "3s500efg320")
 *   'c' u16 len  date        (e.g. "2024/01/31")
 *   'd' u16 len  time        (e.g. "12:34:56")
 *   'e' u32      raw bitstream length, followed by the data
 */
export function parseBitHeader(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  let o = 0;
  const need = n => { if (o + n > buf.length) throw new Error('truncated .bit header'); };
  need(2);
  const l0 = buf.readUInt16BE(o); o += 2;
  if (l0 !== 9) throw new Error('not a Xilinx .bit file (bad header length)');
  need(9);
  const magic = buf.subarray(o, o + 9); o += 9;
  if (magic.toString('hex') !== '0ff00ff00ff00ff000') throw new Error('not a Xilinx .bit file (bad magic)');
  need(2);
  o += 2;                                       // u16 = 1
  const out = { designName: null, userId: null, part: null, date: null, time: null, dataLength: null, dataOffset: null };
  const str = () => { need(2); const n = buf.readUInt16BE(o); o += 2; need(n); const s = buf.subarray(o, o + n).toString('latin1').replace(/\0+$/, ''); o += n; return s; };
  while (o < buf.length) {
    const key = String.fromCharCode(buf[o]); o += 1;
    if (key === 'a') {
      const s = str();
      const [name, ...rest] = s.split(';');
      out.designName = name;
      for (const kv of rest) { const m = /^UserID=(.*)$/i.exec(kv); if (m) out.userId = m[1]; }
      out.rawDesign = s;
    } else if (key === 'b') out.part = str();
    else if (key === 'c') out.date = str();
    else if (key === 'd') out.time = str();
    else if (key === 'e') {
      need(4);
      out.dataLength = buf.readUInt32BE(o); o += 4;
      out.dataOffset = o;
      break;
    } else throw new Error(`unexpected .bit header field '${key}'`);
  }
  if (!out.part) throw new Error('.bit header has no part name');
  out.device = splitBitPart(out.part);
  return out;
}

/** "3s500efg320" -> { part: 'xc3s500e', package: 'fg320' }, "6slx9csg324" -> xc6slx9 / csg324. */
export { splitBitPart };

/** Compare a header to an expected device; returns a warning string or null. */
export function checkBitPart(header, device) {
  if (!header || !device?.part) return null;
  const want = `${String(device.part).toLowerCase().replace(/^xc/, '')}${String(device.package || '').toLowerCase()}`;
  const got = String(header.part).toLowerCase().replace(/^xc/, '');
  if (got === want) return null;
  // Same die, different package -> still wrong for this board.
  return `bitstream was built for '${header.part}' but the target device is '${device.part}-${device.package}'`;
}

export async function readBitInfo(file) {
  const fd = await fs.open(file, 'r');
  try {
    const { buffer, bytesRead } = await fd.read(Buffer.alloc(1024), 0, 1024, 0);
    const st = await fd.stat();
    return { path: file, size: st.size, mtime: st.mtime.toISOString(), ...parseBitHeader(buffer.subarray(0, bytesRead)) };
  } finally { await fd.close(); }
}

// ---------------------------------------------------------------------------------------------
// Command builders (pure; exported for tests)
// ---------------------------------------------------------------------------------------------

/** iMPACT batch script. `bitfile` + `position` (1-based) => program, otherwise scan only. */
export function impactScript({ bitfile, position = 1, cable = 'auto' } = {}) {
  const port = !cable || cable === 'auto' ? 'auto' : cable;   // e.g. auto, usb21, parport0
  if (!/^[\w]+$/.test(port)) throw new Error(`invalid iMPACT cable port '${cable}'`);
  const lines = ['setMode -bs', `setCable -port ${port}`, 'Identify -inferir', 'identifyMPM'];
  if (bitfile) {
    if (/["\r\n]/.test(bitfile)) throw new Error('bitfile path contains unsupported characters');
    const p = parseInt(position, 10) || 1;
    lines.push(`assignFile -p ${p} -file "${bitfile}"`, `Program -p ${p}`);
  }
  lines.push('closeCable', 'quit');
  return lines.join('\n') + '\n';
}

/**
 * Build the command(s) for a scan or program operation.
 * @returns {Array<{cmd:string,args:string[],impactScript?:string}>}
 */
export function buildCommands(op, { tool, cable, device, position, bitfile }) {
  const pos = position === undefined || position === null || position === '' ? null : parseInt(position, 10);
  if (pos !== null && (!Number.isInteger(pos) || pos < 0 || pos > 31)) throw new Error(`invalid chain position '${position}'`);
  const prog = op === 'program';
  if (prog && !bitfile) throw new Error('no bitstream file');
  switch (tool) {
    case 'openFPGALoader': {
      const base = cable ? ['-c', cable] : [];
      if (!prog) return [{ cmd: tool, args: [...base, '--detect'] }];
      const idx = pos !== null ? ['--index-chain', String(pos)] : [];
      return [{ cmd: tool, args: [...base, ...idx, bitfile] }];
    }
    case 'xc3sprog': {
      if (!cable) throw new Error('xc3sprog needs a cable (-c), e.g. xpc, jtaghs1, jtaghs2, ftdi, pp');
      if (!prog) return [{ cmd: tool, args: ['-c', cable, '-j'] }];
      if (bitfile.includes(':')) throw new Error('xc3sprog cannot handle bitstream paths containing ":"');
      return [{ cmd: tool, args: ['-c', cable, '-v', '-p', String(pos ?? 0), bitfile] }];
    }
    case 'djtgcfg': {
      if (!prog) {
        const cmds = [{ cmd: tool, args: ['enum'] }];
        if (device) cmds.push({ cmd: tool, args: ['init', '-d', device] });
        return cmds;
      }
      if (!device) throw new Error('djtgcfg needs a device name (-d), e.g. Nexys2 or Basys2 (see `djtgcfg enum`)');
      return [{ cmd: tool, args: ['prog', '-d', device, '-i', String(pos ?? 0), '-f', bitfile] }];
    }
    case 'impact':
      return [{ cmd: tool, args: ['-batch'], impactScript: impactScript({ bitfile: prog ? bitfile : null, position: pos ?? 1, cable }) }];
    case 'adepttool':
      if (!prog) return [{ cmd: tool, script: 'list.py', args: [] }];
      // --device is the USB board index (not the JTAG position: the FPGA is found in the chain).
      return [{ cmd: tool, script: 'basys2_prog.py', args: ['--device', String(parseInt(device, 10) || 0), bitfile] }];
    default:
      throw new Error(`unknown programming tool '${tool}' (valid: ${TOOLS.join(', ')})`);
  }
}

// ---------------------------------------------------------------------------------------------
// Option resolution
// ---------------------------------------------------------------------------------------------

/**
 * Merge request options with board defaults and the global config.
 * Precedence: explicit request > board programmer defaults > config.programmer.
 */
export function resolveOptions(req, cfg, boardId) {
  const b = boardId ? findBoard(boardId) : null;
  let tool = req.tool || (b?.programmer?.preferred) || cfg?.programmer?.tool || 'openFPGALoader';
  // Board default not installed: fall back to another installed tool that can use the board's own USB.
  if (!req.tool && b?.programmer?.tools && !toolAvailable(tool, cfg)) {
    const alt = Object.keys(b.programmer.tools).find(t => t !== tool && toolAvailable(t, cfg) && b.programmer.tools[t].onboard === true);
    if (alt) tool = alt;
  }
  if (!TOOLS.includes(tool)) throw Object.assign(new Error(`unknown programming tool '${tool}'`), { status: 400 });
  const bd = b?.programmer?.tools?.[tool] || {};
  const sameTool = !req.tool || req.tool === (b?.programmer?.preferred);
  return {
    tool,
    cable: req.cable || bd.cable || (cfg?.programmer?.tool === tool ? cfg.programmer.cable : '') || (tool === 'impact' ? 'auto' : ''),
    device: req.device || bd.device || '',
    position: req.position ?? bd.position ?? (tool === 'impact' ? 1 : 0),
    board: b?.id || null,
    note: bd.note || null,
    verified: bd.verified !== false,
    fromBoard: !!b && sameTool,
  };
}

// ---------------------------------------------------------------------------------------------
// Job bodies
// ---------------------------------------------------------------------------------------------

const XCF_PROG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'xcf_prog.py');
export const PROM_OPS = ['program', 'verify', 'erase', 'read', 'reconfigure'];

/**
 * Platform Flash (XCF0xS) operations through the board's Adept USB (adepttool + scripts/xcf_prog.py).
 * req: { op, bitfile?, outfile?, verify?, reconfigure?, device?, board?, expectDevice? }
 */
export async function promJob(job, req) {
  const cfg = await loadConfig();
  const op = req.op;
  if (!PROM_OPS.includes(op)) throw new Error(`unknown PROM operation '${op}' (valid: ${PROM_OPS.join(', ')})`);
  if (!adepttoolPaths(cfg).ok) throw new Error('PROM programming uses adepttool, which is not installed: run scripts/install-adepttool.sh');
  const args = ['--device', String(parseInt(req.device, 10) || 0), op];
  if (op === 'program' || op === 'verify') {
    if (!req.bitfile || !fss.existsSync(req.bitfile)) throw new Error(`bitstream not found: ${req.bitfile} (run Generate Programming File first)`);
    const info = await readBitInfo(req.bitfile);
    job.log(`PROM image ${req.bitfile}: design ${info.designName}, part ${info.part}, built ${info.date} ${info.time}`);
    const mismatch = checkBitPart(info, req.expectDevice);
    if (mismatch) job.log(`WARNING: ${mismatch}`);
    if (!/_prom\.bit$/i.test(req.bitfile)) job.log('WARNING: this does not look like a PROM bitstream (built with StartUpClk:Cclk); a JTAG-clock bitstream will not boot from flash.');
    args.push(req.bitfile);
    if (op === 'program' && req.verify === false) args.push('--no-verify');
  } else if (op === 'read') {
    if (!req.outfile) throw new Error('no output file for the PROM backup');
    await fs.mkdir(path.dirname(req.outfile), { recursive: true });
    args.push(req.outfile);
  }
  if (op === 'program' && req.reconfigure) args.push('--reconfigure');
  job.log(`Platform Flash: ${op}${req.reconfigure && op === 'program' ? ' + reload FPGA from PROM' : ''}`);
  const start = job.lines.length;
  const code = await execTool(job, { cmd: 'adepttool', script: XCF_PROG, args }, cfg);
  const log = job.lines.slice(start).join('\n');
  let fail = code !== 0 ? `xcf_prog exited with code ${code}` : null;
  if (!fail && (op === 'verify' || (op === 'program' && req.verify !== false)) && !/verify OK/.test(log)) fail = 'verification did not complete';
  if (!fail && (op === 'reconfigure' || (op === 'program' && req.reconfigure)) && !/STATUS: DONE/.test(log)) fail = 'the FPGA did not load from the PROM (mode jumper on ROM? PROM bitstream with StartUpClk:Cclk?)';
  if (fail) throw Object.assign(new Error(fail), { result: { op, code } });
  job.log(`Platform Flash ${op} finished.`);
  return { op, outfile: req.outfile || null };
}

// adepttool: a Python script run with its own virtualenv (libusb from Homebrew on macOS).
export function adepttoolPaths(cfg) {
  const root = cfg?.paths?.adepttool || path.join(configDirFor(), 'adepttool');
  const src = fss.existsSync(path.join(root, 'src', 'basys2_prog.py')) ? path.join(root, 'src') : root;
  const py = cfg?.paths?.adepttoolPython || path.join(root, 'venv', 'bin', 'python');
  const ok = fss.existsSync(path.join(src, 'basys2_prog.py')) && fss.existsSync(py);
  return { root, src, py, ok };
}
function configDirFor() { return process.env.XAILINX_CONFIG_DIR || path.join(os.homedir(), '.xailinx'); }

export function toolAvailable(name, cfg) {
  if (name === 'adepttool') return adepttoolPaths(cfg).ok;
  return !!resolveTool(name, cfg, detectIse(cfg));
}

async function execTool(job, c, cfg) {
  if (c.cmd === 'adepttool') {
    const a = adepttoolPaths(cfg);
    if (!a.ok) throw new Error(`adepttool is not installed (expected ${path.join(a.src, 'basys2_prog.py')} and ${a.py}). Run scripts/install-adepttool.sh.`);
    const libdirs = ['/opt/homebrew/lib', '/usr/local/lib'].filter(d => fss.existsSync(d));
    const env = { ...process.env, PYTHONPATH: a.src, DYLD_FALLBACK_LIBRARY_PATH: [process.env.DYLD_FALLBACK_LIBRARY_PATH, ...libdirs].filter(Boolean).join(':') };
    const script = path.isAbsolute(c.script) ? c.script : path.join(a.src, c.script);
    return runCommand(job, a.py, [script, ...c.args], { cwd: a.src, env });
  }
  const ise = detectIse(cfg);
  const bin = resolveTool(c.cmd, cfg, ise);
  let cmd = bin, args = c.args, cleanup = null;
  if (c.impactScript) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xailinx-impact-'));
    const file = path.join(dir, 'impact.cmd');
    await fs.writeFile(file, c.impactScript);
    job.log('iMPACT batch script:');
    for (const l of c.impactScript.trimEnd().split('\n')) job.log(`  ${l}`);
    args = [...args, file];
    cleanup = () => fs.rm(dir, { recursive: true, force: true });
    if (!bin) {
      // Not on PATH: source settings64.sh in a bash wrapper (values passed as positional args).
      const settings = cfg.local?.settings || ise.settings;
      if (!settings || !which('bash')) throw new Error('iMPACT not found: install ISE 14.7 / LabTools locally (programming needs local USB access), or put impact on PATH.');
      cmd = which('bash');
      args = ['-c', '. "$1" >/dev/null 2>&1; shift; exec impact "$@"', 'bash', settings, ...args];
      // cwd = temp dir so impact's _impact.log / cmd output stays out of the project.
      try { return await runCommand(job, cmd, args, { cwd: dir }); } finally { await cleanup(); }
    }
    try { return await runCommand(job, cmd, args, { cwd: dir }); } finally { await cleanup(); }
  }
  if (!bin) throw new Error(`${c.cmd} not found on PATH${cfg.paths?.[c.cmd] ? ` (configured path ${cfg.paths[c.cmd]} is not executable)` : ''}. Install it or set its path in the toolchain settings.`);
  return runCommand(job, cmd, args);
}

/** Job body for POST /jtag/scan. */
export async function scanJob(job, req) {
  const cfg = await loadConfig();
  const o = resolveOptions(req, cfg, req.board);
  job.log(`JTAG scan with ${o.tool}${o.cable ? ` (cable ${o.cable})` : ''}${o.device ? ` (device ${o.device})` : ''}`);
  if (o.note) job.log(`NOTE: ${o.note}`);
  const out = [];
  const lines = [];
  const start = job.lines.length;
  for (const c of buildCommands('scan', o)) {
    const code = await execTool(job, c, cfg);
    out.push({ cmd: c.cmd, args: c.args, code });
    if (code !== 0) throw Object.assign(new Error(`${c.cmd} exited with code ${code}`), { result: { options: o, commands: out } });
  }
  lines.push(...job.lines.slice(start));
  return { options: o, commands: out, devices: parseScanOutput(o.tool, lines) };
}

/** Best-effort extraction of detected chain devices from tool output. */
export function parseScanOutput(tool, lines) {
  const devs = [];
  for (const l of lines) {
    let m;
    if (tool === 'xc3sprog' && (m = /JTAG loc\.:\s*(\d+)\s+IDCODE:\s*(0x[0-9a-f]+)\s+Desc:\s*(\S+)/i.exec(l))) devs.push({ position: +m[1], idcode: m[2], name: m[3] });
    else if (tool === 'openFPGALoader' && (m = /idcode\s+(0x[0-9a-f]+)/i.exec(l))) devs.push({ idcode: m[1] });
    else if (tool === 'openFPGALoader' && (m = /model\s+(\S+)/i.exec(l)) && devs.length) devs[devs.length - 1].name = m[1];
    else if (tool === 'impact' && (m = /^'(\d+)':\s*:?\s*Manufacturer's ID\s*=\s*([^,]+),\s*Version\s*:\s*(\d+)/i.exec(l))) devs.push({ position: +m[1], name: m[2].trim(), version: +m[3] });
    else if (tool === 'impact' && (m = /INFO:iMPACT:1777 - Reading .*?\/(\w+)\.bsd/i.exec(l))) devs.push({ name: m[1] });
    else if (tool === 'adepttool' && (m = /JTAG IDCODE\s+([0-9a-f]{8})\s+\[(\w+)\]/i.exec(l))) devs.push({ position: devs.length, idcode: `0x${m[1]}`, name: m[2] });
    else if (tool === 'djtgcfg' && (m = /Device:\s*(\S+)/.exec(l))) devs.push({ adeptDevice: m[1] });
    else if (tool === 'djtgcfg' && (m = /Device\s+(\d+):\s*(\S+)/.exec(l))) devs.push({ position: +m[1], name: m[2] });
  }
  return devs;
}

/**
 * Job body for POST /program.
 * @param {object} req  { tool?, cable?, device?, position?, board?, bitfile (absolute), expectDevice? }
 */
export async function programJob(job, req) {
  const cfg = await loadConfig();
  const o = resolveOptions(req, cfg, req.board);
  const bitfile = req.bitfile;
  if (!bitfile || !fss.existsSync(bitfile)) throw new Error(`bitstream not found: ${bitfile}`);
  const info = await readBitInfo(bitfile);
  job.log(`Bitstream ${bitfile}`);
  job.log(`  design ${info.designName}  part ${info.part}  built ${info.date} ${info.time}  (${info.dataLength} bytes of configuration data)`);
  const warnings = [];
  const mismatch = checkBitPart(info, req.expectDevice);
  if (mismatch) { warnings.push(mismatch); job.log(`WARNING: ${mismatch}`); }
  const bp = splitBitPart(info.part);
  if (!bp || !familyOfPart(bp.part)) { const w = `unrecognised part '${info.part}' in the bitstream header`; warnings.push(w); job.log(`WARNING: ${w}`); }
  else job.log(`  device family: ${familyName(familyOfPart(bp.part))}`);
  if (/StartUpClk:Cclk|-g StartUpClk:CCLK/i.test(info.rawDesign || '')) { /* not encoded in header; nothing to check */ }
  if (o.note) job.log(`NOTE: ${o.note}`);
  if (!o.verified) job.log(`NOTE: the ${o.tool} defaults for this board are not verified on real hardware.`);
  job.log(`Programming (SRAM, volatile) with ${o.tool}${o.cable ? ` cable=${o.cable}` : ''}${o.device ? ` device=${o.device}` : ''} position=${o.position}`);

  const commands = [];
  let failText = null;
  const start = job.lines.length;
  for (const c of buildCommands('program', { ...o, bitfile })) {
    const code = await execTool(job, c, cfg);
    commands.push({ cmd: c.cmd, args: c.args, code });
    if (code !== 0) failText = `${c.cmd} exited with code ${code}`;
  }
  const log = job.lines.slice(start).join('\n');
  // iMPACT often exits 0 even when programming fails: check its messages.
  if (!failText && o.tool === 'impact' && !/Programmed successfully/i.test(log)) failText = 'iMPACT did not report "Programmed successfully"';
  if (!failText && /ERROR:iMPACT/i.test(log)) failText = 'iMPACT reported an error';
  // adepttool exits 0 even when configuration fails: the last STATUS line must show DONE.
  if (!failText && o.tool === 'adepttool') {
    const st = log.match(/STATUS: .*$/gm);
    if (!st || !/\bDONE\b/.test(st[st.length - 1])) failText = 'the FPGA did not assert DONE (configuration failed)';
  }
  const result = { options: o, bitfile, bitinfo: info, warnings, commands };
  if (failText) throw Object.assign(new Error(failText), { result });
  job.log('Programming finished.');
  return result;
}

/** Board/device helper used by the routes: expected device for a project or board. */
export function expectedDevice(project, boardId) {
  if (project?.device?.part) return project.device;
  const r = boardId ? resolveBoard(boardId) : null;
  return r?.device || null;
}
