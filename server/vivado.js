// AMD Vivado ML Standard (2025.2) as the back end of the Artix-7 boards (the Basys 3, the Nexys A7: #1649), as Xilinx ISE is the Spartan-3E's
// (server/ise.js): a batch Tcl flow in non-project mode (UG894, UG835).
//
// generateVivadoBuild() writes <project>/build/:
//   src/...      the design's sources (ise.js generateBuild's copies: the folder is self-contained for docker / ssh)
//   <top>.xdc    the project's constraints (an XDC: #3142's writer)
//   run.tcl      the flow: synth_design, opt_design, place_design, route_design, write_bitstream, and the reports
//   run.sh       sources Vivado's settings64.sh and runs run.tcl in batch mode
// ISE's step names are kept (the Processes pane's and the MCP server's processes, #2674), each Vivado's command:
//   synth -> synth_design (and its utilization)    translate -> the constraints (read with the synthesis)
//   map -> opt_design                              par -> place_design, route_design (route status, DRC, utilization)
//   trce -> report_timing_summary                  xpwr -> report_power      pin2ucf -> report_io
//   bitgen -> write_bitstream                      (prombit: the same .bit, openFPGALoader writes it to the flash)
// Each step's design is saved as a checkpoint (post_synth.dcp, post_opt.dcp, post_route.dcp), which a later run of
// the next steps opens. runVivado() runs run.sh in Toolchain Settings' Vivado mode (vivado.mode: docker, ssh or
// local, as ISE's modes: server/toolchain.js) inside a job, then parses the reports into build/reports.json
// (server/vivado-reports.js). None of Vivado's files is part of Silinx (CLAUDE.md).

import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { vivadoDevice } from '../packages/silinx-fpga/src/parts.js';
import { generateBuild, collectReports, runDocker, runSsh } from './ise.js';
import { loadConfig, which } from './toolchain.js';
import { capture, runCommand } from './jobs.js';
import { IDENT } from './ident.js';
import { parseUtilization, utilizationSummary, summaryRows, parseRouteStatus, parseTimingSummary, parseDrc, parsePower, logMessages, logCommands } from './vivado-reports.js';

export const VIVADO_VERSION = '2025.2';
/** Is a device's family one Vivado implements (the Artix-7: its back end in FAMILY_INFO, packages/silinx-fpga/src/family.js)? ISE's flow is
 *  not used for them. */
export const isVivadoDevice = vivadoDevice;

// the steps Vivado runs (ISE's names), in order; the default flow (an empty request) and the ones it does not have
export const VIVADO_STEPS = ['synth', 'translate', 'map', 'par', 'trce', 'pin2ucf', 'xpwr', 'bitgen', 'prombit'];
const DEFAULT_STEPS = ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'];
const NOT_IN_VIVADO = { postsynth: 'post-synthesis simulation model', posttrans: 'post-translate simulation model', postmap: 'post-map simulation model', postpar: 'post-place & route simulation model', fpgaview: 'FPGA view' };

/** The settings scripts Vivado's run.sh looks for when VIVADO_SETTINGS is not set and vivado is not on PATH. */
export const SETTINGS_GLOBS = ['/tools/Xilinx/*/Vivado/settings64.sh', '/tools/Xilinx/Vivado/*/settings64.sh', '/opt/Xilinx/*/Vivado/settings64.sh', '/opt/Xilinx/Vivado/*/settings64.sh'];
/** What Vivado needs in a container besides ISE's isolation (#2305): sysfs's buses, classes and devices hidden, or its
 *  licence manager crashes in libudev after routing under x86 emulation ("realloc(): invalid pointer"). */
export const VIVADO_DOCKER_ARGS = Object.freeze(['--tmpfs', '/sys/bus', '--tmpfs', '/sys/class', '--tmpfs', '/sys/devices']);

/** The steps of a request in Vivado's order (normalizeSteps's, ise.js); a step Vivado does not have: an error. */
export function vivadoSteps(steps) {
  const list = !steps || !steps.length ? DEFAULT_STEPS : steps;
  for (const s of list) if (NOT_IN_VIVADO[s]) throw Object.assign(new Error(`Vivado's flow has no ${NOT_IN_VIVADO[s]} (${s})`), { status: 400 });
  const set = new Set(list);
  if (set.has('par')) set.add('trce');   // the timing whenever place & route runs, as ISE's
  return VIVADO_STEPS.filter(s => set.has(s));
}

/** Vivado's part name of a device: xc7a35tcpg236-1 (an error for a malformed one: it goes into run.tcl). */
export function vivadoPart(device) {
  const part = String(device?.part || '').trim().toLowerCase(), pkg = String(device?.package || '').trim().toLowerCase();
  const speed = String(device?.speed ?? '').trim().replace(/^-/, '');
  if (!/^xc7[akvzs]\d+[a-z]*$/.test(part) || !/^[a-z]+\d+$/.test(pkg) || !/^\d[a-z0-9]{0,2}$/i.test(speed))
    throw Object.assign(new Error(`invalid 7-series device '${device?.part}' / '${device?.package}' / '${device?.speed}'`), { status: 400 });
  return `${part}${pkg}-${speed.toLowerCase()}`;
}

/** The device configuration a board needs (its CFGBVS and configuration voltage, its flash's bus width and rate):
 *  the board description's `config` ({ cfgbvs, configVoltage, spiBuswidth, configRate }), else 3.3 V banks (VCCO). */
export function configProperties(board = {}) {
  const c = board?.config || {};
  const props = [['CFGBVS', /^(VCCO|GND)$/.test(c.cfgbvs) ? c.cfgbvs : 'VCCO'], ['CONFIG_VOLTAGE', [1.8, 2.5, 3.3].includes(+c.configVoltage) ? String(+c.configVoltage) : '3.3']];
  if ([1, 2, 4].includes(+c.spiBuswidth)) props.push(['BITSTREAM.CONFIG.SPI_BUSWIDTH', String(+c.spiBuswidth)]);
  if (/^\d+(\.\d+)?$/.test(String(c.configRate ?? ''))) props.push(['BITSTREAM.CONFIG.CONFIGRATE', String(c.configRate)]);
  return props;
}

// the properties an XDC sets on the design itself: left to it (the property's name escaped in full, #3280)
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const xdcSets = (xdc, prop) => new RegExp(`set_property\\s+(?:-dict\\s*\\{[^}]*\\b${reEsc(prop)}\\b|${reEsc(prop)}\\s)[^\\n]*current_design`, 'i').test(xdc || '');

/** A path in braces in Tcl: none of the characters that would end it (ise.js's scriptSafe already refuses "{} and controls). */
const tclPath = p => { if (/[{}\\\r\n]/.test(p)) throw Object.assign(new Error(`file path not allowed in Vivado's script: ${JSON.stringify(p)}`), { status: 400 }); return `{${p}}`; };

/**
 * run.tcl: the flow of the steps given on its command line (-tclargs; none: the default flow).
 * o: { top, part, sources: [{ lang, buildPath }], includeDirs, xdc (the file's name, or null), xdcText, goal ('fast' |
 * 'area' | 'speed'), board (its config) }.
 */
export function vivadoTcl({ top, part, sources, includeDirs = [], xdc = null, xdcText = '', goal = 'speed', board = null }) {
  if (!IDENT.test(top)) throw Object.assign(new Error(`invalid top module name '${top}'`), { status: 400 });
  const synthDirective = { fast: 'RuntimeOptimized', area: 'AreaOptimized_high' }[goal] || 'Default';
  const implDirective = goal === 'fast' ? 'RuntimeOptimized' : 'Default';
  const read = sources.map(s => (s.lang === 'vhdl' ? `read_vhdl -library work ${tclPath(s.buildPath)}`
    : `read_verilog ${/\.sv$/i.test(s.buildPath) ? '-sv ' : ''}${tclPath(s.buildPath)}`));
  const inc = includeDirs.length ? ` -include_dirs [list ${includeDirs.map(tclPath).join(' ')}]` : '';
  const props = configProperties(board).filter(([p]) => !xdcSets(xdcText, p)).map(([p, v]) => `set_property ${p} ${v} [current_design]`);
  const f = n => tclPath(`${top}${n}`);
  return `# Generated by Silinx - AMD Vivado ${VIVADO_VERSION} batch flow for ${part} (top: ${top}).
# vivado -mode batch -source run.tcl -tclargs [${VIVADO_STEPS.join(' ')}]   (no arguments = ${DEFAULT_STEPS.join(' ')})
set steps [expr {[llength $argv] ? $argv : {${DEFAULT_STEPS.join(' ')}}}]
proc has {s} { global steps; expr {[lsearch -exact $steps $s] >= 0} }
# a step: its marker, its body; a Tcl error ends the flow with its marker (Vivado's own ERROR line is in the log)
proc step {name body} {
  puts "=== SILINX STEP $name ==="
  if {[catch {uplevel 1 $body} e]} { puts "ERROR: \\[Silinx\\] $name: $e"; puts "=== SILINX FAILED $name (exit 1) ==="; exit 1 }
}
# the design of an earlier run, when this one starts after its step
proc design {dcp} {
  if {[catch {current_design}]} {
    if {![file exists $dcp]} { error "$dcp not found: run the step before first" }
    open_checkpoint $dcp
  }
}
set_param general.maxThreads 2
set part ${part}
if {[has synth]} {
  step synth {
${[...read, ...(xdc ? [`read_xdc ${tclPath(xdc)}`] : []), `synth_design -top ${top} -part $part -directive ${synthDirective}${inc}`, ...props,
  'write_checkpoint -force post_synth.dcp', `report_utilization -file ${f('_synth_util.rpt')}`].map(l => `    ${l}`).join('\n')}
  }
}
if {[has translate]} { step translate { design post_synth.dcp } }
if {[has map]} {
  step map {
    design post_synth.dcp
    opt_design -directive ${implDirective}
    write_checkpoint -force post_opt.dcp
  }
}
if {[has par]} {
  step par {
    design post_opt.dcp
    place_design -directive ${implDirective}
    route_design -directive ${implDirective}
    write_checkpoint -force post_route.dcp
    report_route_status -file ${f('_route.rpt')}
    report_drc -file ${f('_drc.rpt')}
    report_utilization -file ${f('_util.rpt')}
  }
}
if {[has trce]} { step trce { design post_route.dcp; report_timing_summary -max_paths 10 -report_unconstrained -file ${f('_timing.rpt')} } }
if {[has pin2ucf]} { step pin2ucf { design post_route.dcp; report_io -file ${f('_io.rpt')} } }
if {[has xpwr]} { step xpwr { design post_route.dcp; report_power -file ${f('_power.rpt')} } }
if {[has bitgen]} { step bitgen { design post_route.dcp; write_bitstream -force ${f('.bit')} } }
puts "=== SILINX DONE ==="
`;
}

/** run.sh: Vivado's settings sourced (VIVADO_SETTINGS, else the first install found), then run.tcl in batch mode. */
export function vivadoRunSh({ top, part }) {
  return `#!/usr/bin/env bash
# Generated by Silinx - AMD Vivado ${VIVADO_VERSION} flow for ${part} (top: ${top}).
# Usage: ./run.sh [${VIVADO_STEPS.join(' ')}]   (no arguments = ${DEFAULT_STEPS.join(' ')})
# Environment: VIVADO_SETTINGS=/path/to/Vivado/settings64.sh (sourced when vivado is not on PATH)
cd "$(dirname "$0")" || exit 1
STEPS=("$@")
if ! command -v vivado >/dev/null 2>&1; then
  S="\${VIVADO_SETTINGS:-$(ls -d ${SETTINGS_GLOBS.join(' ')} 2>/dev/null | head -1)}"
  if [ -n "$S" ] && [ -f "$S" ]; then
    # never a file of the build folder (its files come from the project, #3032)
    here="$(pwd -P)"; real="$(cd -P "$(dirname "$S")" 2>/dev/null && pwd -P)/$(basename "$S")"
    case "$real" in "$here"/*) echo "ERROR: VIVADO_SETTINGS ($S) is a file of the build folder: not sourced." >&2; exit 126 ;; esac
    set --
    # shellcheck disable=SC1090
    . "$S" >/dev/null 2>&1
  fi
fi
if ! command -v vivado >/dev/null 2>&1; then
  echo "ERROR: AMD Vivado (vivado) not found. Put Vivado on PATH or set VIVADO_SETTINGS to its settings64.sh." >&2
  exit 127
fi
# Vivado writes its settings under HOME: a writable one
[ -n "$HOME" ] && [ -w "$HOME" ] || export HOME="$PWD/.home"
mkdir -p "$HOME"
rm -rf .Xil
exec vivado -mode batch -nojournal -notrace -log vivado.log -source run.tcl -tclargs "\${STEPS[@]}"
`;
}

/** The build folder for Vivado: the sources (ise.js), the constraints as <top>.xdc, run.tcl and run.sh. */
export async function generateVivadoBuild(project, projectDir, { board = null } = {}) {
  const part = vivadoPart(project.device);
  const gen = await generateBuild(project, projectDir, { sourcesOnly: true });
  const { buildDir, top } = gen;
  const warnings = [...gen.warnings];
  const xdcOut = path.join(buildDir, `${top}.xdc`);
  let xdcText = '';
  const cons = project.constraints && path.resolve(projectDir, project.constraints);
  if (cons && /\.xdc$/i.test(cons) && fss.existsSync(cons)) xdcText = await fs.readFile(cons, 'utf8');
  else if (cons && /\.ucf$/i.test(cons) && fss.existsSync(cons))
    throw Object.assign(new Error(`${project.constraints} is a UCF: Vivado reads an XDC. Update the constraints for the board (Design Properties) or write ${project.constraints.replace(/\.ucf$/i, '.xdc')}.`), { status: 400 });
  else warnings.push(`no constraints file (${project.constraints || 'project.constraints not set'}): Vivado chooses the pins - do NOT program real hardware with this bitstream`);
  if (gen.constraintsFile && gen.constraintsFile !== `${top}.xdc`) await fs.rm(path.join(buildDir, gen.constraintsFile), { force: true });
  if (xdcText) await fs.writeFile(xdcOut, xdcText); else await fs.rm(xdcOut, { force: true });
  const includeDirs = [...new Set(gen.sources.filter(s => s.lang === 'verilog').map(s => path.posix.dirname(s.buildPath)))].sort();
  const { synthGoal } = await import('../packages/silinx-fpga/src/index.js');
  const files = {
    'run.tcl': vivadoTcl({ top, part, sources: gen.sources, includeDirs, xdc: xdcText ? `${top}.xdc` : null, xdcText, goal: synthGoal(project.impl || {}), board }),
    'run.sh': vivadoRunSh({ top, part }),
  };
  for (const [name, text] of Object.entries(files)) await fs.writeFile(path.join(buildDir, name), text);
  await fs.chmod(path.join(buildDir, 'run.sh'), 0o755);
  return { buildDir, top, device: project.device, part, sources: gen.sources, files: [...Object.keys(files), ...(xdcText ? [`${top}.xdc`] : [])], warnings };
}

// ---------------------------------------------------------------------------------------------
// The modes (Toolchain Settings' vivado: { mode, image, settings }; ISE's docker and ssh settings for the rest)
// ---------------------------------------------------------------------------------------------

/** The configuration ISE's runners take, made from Vivado's: its image and settings, sysfs hidden in its container
 *  (docker mode: as docker's own arguments; the ssh host's container: runSsh's dockerArgs, vivadoSshOptions). */
export function vivadoRunConfig(cfg) {
  const v = cfg.vivado || {};
  const env = v.settings ? ['-e', `VIVADO_SETTINGS=${v.settings}`] : [];
  return {
    ...cfg,
    mode: v.mode || 'docker',
    local: { ...cfg.local, settings: '' },
    docker: { ...cfg.docker, image: v.image || '', settings: '', extraArgs: [...VIVADO_DOCKER_ARGS, ...env, ...(cfg.docker?.extraArgs || [])] },
    ssh: { ...cfg.ssh, image: v.image || '', settings: '' },
  };
}
/** runSsh's options for Vivado: its container's arguments, its settings in the environment. */
export const vivadoSshOptions = cfg => ({ dockerArgs: [...VIVADO_DOCKER_ARGS], env: cfg.vivado?.settings ? { VIVADO_SETTINGS: cfg.vivado.settings } : {} });

/** A local Vivado: on PATH, or its settings64.sh (vivado.settings, else one of SETTINGS_GLOBS'). */
export function detectVivado(cfg) {
  const bin = which('vivado');
  if (bin) return { found: true, path: bin, settings: null };
  const cands = cfg?.vivado?.settings ? [cfg.vivado.settings] : [];
  for (const g of SETTINGS_GLOBS) {
    const [root, rest] = g.split('/*/');
    try { for (const d of fss.readdirSync(root).sort().reverse()) cands.push(path.join(root, d, rest)); } catch { /* none */ }
  }
  const settings = cands.find(f => fss.existsSync(f)) || null;
  return { found: !!settings, path: null, settings };
}

/** Can Vivado's flow run in its mode? { mode, available, reason, help }. det: { vivado, helpers, dockerImage? }. */
export function vivadoStatus(cfg, det) {
  const mode = cfg.vivado?.mode || 'docker', image = cfg.vivado?.image || '', help = VIVADO_HELP[mode] || VIVADO_HELP.docker;
  if (mode === 'local') {
    if (!det.helpers.bash) return { mode, available: false, reason: 'bash not found (the flow script run.sh needs bash)', help };
    if (det.vivado?.found) return { mode, available: true, reason: det.vivado.path ? `Vivado found on PATH` : `Vivado found via ${det.vivado.settings}`, help };
    return { mode, available: false, reason: `AMD Vivado not found (looked for vivado on PATH and settings64.sh under ${SETTINGS_GLOBS.join(', ')}).${process.platform === 'darwin' ? ' Vivado does not run on macOS; use the docker or ssh mode.' : ''}`, help };
  }
  if (mode === 'docker') {
    if (!det.helpers.docker) return { mode, available: false, reason: `'${cfg.docker?.command || 'docker'}' command not found`, help };
    if (!image) return { mode, available: false, reason: 'no Vivado docker image configured (vivado.image)', help };
    if (det.dockerImage && !det.dockerImage.present) return { mode, available: false, reason: `docker image '${image}' not present locally (docker image inspect failed). Build it yourself; Silinx never pulls images.`, help };
    return { mode, available: true, reason: `docker image ${image}`, help };
  }
  if (mode === 'ssh') {
    if (!det.helpers.ssh) return { mode, available: false, reason: 'ssh not found', help };
    if (!det.helpers.tar) return { mode, available: false, reason: 'tar not found (used to copy the build directory over ssh)', help };
    if (!cfg.ssh?.host) return { mode, available: false, reason: 'no ssh host configured (ssh.host)', help };
    return { mode, available: true, reason: `the ssh host${image ? ` (docker image ${image})` : ''}`, help };
  }
  return { mode, available: false, reason: `unknown Vivado mode '${mode}'`, help: VIVADO_HELP.docker };
}

export const VIVADO_HELP = {
  docker: 'Set {"vivado":{"mode":"docker","image":"<your-vivado-image>"}} in ~/.silinx/config.json or via PUT /api/toolchain: an x86-64 image with AMD Vivado ML Standard 2025.2 (free for the small 7-series parts) under /tools/Xilinx, such as scripts/vitis-hls-image/ makes. Silinx never pulls or builds images; the build directory is mounted at /work.',
  ssh: 'Set {"vivado":{"mode":"ssh","image":"<image on the host, or empty>"}} with the ssh host of Toolchain Settings (ssh.host, ssh.user, ssh.remoteDir): the build directory is streamed with tar over ssh, Vivado runs there (in that docker image, or installed on the host), and the results come back.',
  local: 'Install AMD Vivado ML Standard 2025.2 on this Linux or Windows machine and put it on PATH, or set "vivado.settings" to its settings64.sh, with {"vivado":{"mode":"local"}}.',
};

/** The Vivado section of GET /api/toolchain: { mode, available, reason, help, version, dockerImage }. */
export async function detectVivadoToolchain(cfg, helpers) {
  const vivado = detectVivado(cfg);
  let dockerImage = null;
  if ((cfg.vivado?.mode || 'docker') === 'docker' && helpers.docker && cfg.vivado?.image) {
    const r = await capture(helpers.docker, ['image', 'inspect', '--format', '{{.Id}}', cfg.vivado.image], { timeoutMs: 5000 });
    dockerImage = { image: cfg.vivado.image, present: r.code === 0 };
  }
  return { ...vivadoStatus(cfg, { vivado, helpers, dockerImage }), version: VIVADO_VERSION, dockerImage };
}

// ---------------------------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------------------------

/** Job body of an implementation on an Artix-7 device: { project, projectDir, steps, board?, generateOnly? }. */
export async function runVivado(job, { project, projectDir, steps, board = null, generateOnly = false }) {
  const st = vivadoSteps(steps);
  job.log(`Silinx implementation (AMD Vivado): ${project.name} top=${project.top} part=${vivadoPart(project.device)}`);
  const gen = await generateVivadoBuild(project, projectDir, { board });
  for (const w of gen.warnings) job.log(`WARNING: ${w}`);
  job.log(`Generated ${gen.files.join(', ')} in ${gen.buildDir}`);
  const result = { buildDir: gen.buildDir, generated: gen.files, steps: st, warnings: gen.warnings, mode: null, reports: null, completedSteps: [], failedStep: null, toolchain: 'vivado' };
  if (generateOnly) { job.log('Scripts generated only (generateOnly). Run build/run.sh on a machine with Vivado.'); return result; }
  const cfg0 = await loadConfig(), cfg = vivadoRunConfig(cfg0);
  const helpers = { bash: which('bash'), docker: which(cfg.docker.command || 'docker'), ssh: which('ssh'), tar: which('tar') };
  const status = vivadoStatus(cfg0, { vivado: detectVivado(cfg0), helpers });
  result.mode = cfg.mode;
  if (!status.available) {
    job.log(`Vivado is not available in mode '${cfg.mode}': ${status.reason}`);
    job.log(`How to fix: ${status.help}`);
    throw Object.assign(new Error(`AMD Vivado not available (${cfg.mode} mode): ${status.reason.replace(/\.$/, '')}. Configure it in Toolchain Settings (vivado in ~/.silinx/config.json, PUT /api/toolchain), or run ${path.join(gen.buildDir, 'run.sh')} on a machine with Vivado.`), { result });
  }
  job.log(`Running the Vivado flow in '${cfg.mode}' mode: ${status.reason}`);
  const onLine = line => {
    let m = /^=== SILINX STEP (\w+) ===/.exec(line);
    if (m) { if (result.currentStep) result.completedSteps.push(result.currentStep); result.currentStep = m[1]; job.result = result; }
    m = /^=== SILINX FAILED (\w+)/.exec(line);
    if (m) { result.failedStep = m[1]; result.currentStep = null; }
    if (/^=== SILINX DONE ===/.test(line)) { if (result.currentStep) result.completedSteps.push(result.currentStep); result.currentStep = null; }
  };
  // the reports of an earlier run are not this one's
  if (st.includes('synth')) for (const f of await fs.readdir(gen.buildDir)) if (/\.(rpt|dcp|bit)$/.test(f) || f === 'vivado.log') await fs.rm(path.join(gen.buildDir, f), { force: true });
  let code;
  try {
    if (cfg.mode === 'local') {
      const s = cfg0.vivado?.settings;
      code = await runCommand(job, helpers.bash || 'bash', ['run.sh', ...st], { cwd: gen.buildDir, env: s ? { VIVADO_SETTINGS: s } : {}, onLine });
    } else if (cfg.mode === 'docker') code = await runDocker(job, cfg, gen, st, onLine);
    else code = await runSsh(job, cfg, { helpers }, project, gen, st, onLine, vivadoSshOptions(cfg0));
  } finally {
    try {
      result.reports = await collectVivadoReports(gen.buildDir, gen.top, gen.device);
      await fs.writeFile(path.join(gen.buildDir, 'reports.json'), JSON.stringify(result.reports, null, 2) + '\n');
    } catch (e) { job.log(`WARNING: report parsing failed: ${e.message}`); }
  }
  if (code !== 0) throw Object.assign(new Error(`Vivado flow failed${result.failedStep ? ` in step '${result.failedStep}'` : ''} (exit code ${code})`), { result });
  job.log(result.reports?.bit ? `Bitstream: ${result.reports.bit.path}` : 'Flow finished.');
  return result;
}

async function readIf(p) { try { return await fs.readFile(p, 'utf8'); } catch { return null; } }

/** The reports of build/ (Vivado's) in the shape of ise.js collectReports, with source 'vivado'. */
export async function collectVivadoReports(buildDir, top, device) {
  const base = await collectReports(buildDir, top, device);   // the .bit and its header
  const out = { generatedAt: base.generatedAt, top, device: device || null, source: 'vivado' };
  const log = await readIf(path.join(buildDir, 'vivado.log'));
  const cmds = log ? logCommands(log) : [];
  const cmd = name => cmds.filter(c => c.command === name).at(-1) || null;
  const msgs = log ? logMessages(log) : [];
  const su = await readIf(path.join(buildDir, `${top}_synth_util.rpt`));
  if (su || cmd('synth_design')) {
    const utilization = su ? summaryRows(parseUtilization(su)) : [];
    const c = cmd('synth_design');
    out.synthesis = { utilization, summary: utilizationSummary(utilization), errors: c ? c.errors : null, warnings: c ? c.warnings + c.criticalWarnings : null };
  }
  const iu = await readIf(path.join(buildDir, `${top}_util.rpt`));
  if (iu) {
    const utilization = summaryRows(parseUtilization(iu));
    // (the implementation's messages: opt_design's, place_design's and route_design's)
    const impl = cmds.filter(c => ['opt_design', 'place_design', 'route_design'].includes(c.command));
    const sum = k => impl.reduce((a, c) => a + c[k], 0);
    out.map = { utilization, summary: utilizationSummary(utilization), errors: impl.length ? sum('errors') : null, warnings: impl.length ? sum('warnings') + sum('criticalWarnings') : null };
  }
  const rs = await readIf(path.join(buildDir, `${top}_route.rpt`));
  if (rs) out.par = { ...parseRouteStatus(rs), done: !!cmd('route_design')?.ok };
  const drc = await readIf(path.join(buildDir, `${top}_drc.rpt`));
  if (drc) out.drc = parseDrc(drc);
  const tm = await readIf(path.join(buildDir, `${top}_timing.rpt`));
  if (tm) out.timing = parseTimingSummary(tm);
  const pw = await readIf(path.join(buildDir, `${top}_power.rpt`));
  if (pw) out.power = parsePower(pw);
  if (base.bit) out.bit = base.bit;
  if (fss.existsSync(path.join(buildDir, `${top}_io.rpt`))) out.pinsReport = { path: `build/${top}_io.rpt` };
  out.messages = { errors: msgs.filter(m => m.severity === 'ERROR').length, criticalWarnings: msgs.filter(m => m.severity === 'CRITICAL WARNING').length, warnings: msgs.filter(m => m.severity === 'WARNING').length };
  out.summary = {
    synthesized: !!out.synthesis,
    mapped: !!out.map,
    routed: out.par ? out.par.routed : null,
    timingMet: out.timing ? out.timing.met : null,
    maxFreqMHz: out.timing?.maxFreqMHz ?? null,
    utilization: out.map?.summary || out.synthesis?.summary || null,
    drc: out.drc ? { errors: out.drc.errors, warnings: out.drc.criticalWarnings + out.drc.warnings } : null,
    bitstream: !!out.bit,
  };
  return out;
}
