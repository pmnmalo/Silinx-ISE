// The MCP server's board programming (#2674, #2298): Configure Target Device's Program FPGA / Program Flash, through the
// server's own function (impl-routes.js startProgramming: the project trusted, its file, its board, its device checked, then
// server/programmer.js programJob), so with the same checks and messages as the interface's. The project's file is the one
// its flow makes: a Xilinx .bit and an ECP5's .bit loaded into the FPGA's SRAM (JTAG), a Gowin's .fs into its SRAM, an
// iCE40's .bin written into the board's SPI flash. Destructive: the client asks before each call.
import { toolError, readProject, redactor, PROJECT } from './mcp-util.js';
import { TOOLS } from './programmer-values.js';

// (the most a programming waits: openFPGALoader writing a flash of 16 MB, iMPACT's Identify)
const TIMEOUT_MS = 600000;

export const BOARD_TOOLS = [
  {
    name: 'program_board', title: 'Program the board',
    description: 'Program the project\'s board (Configure Target Device: Program FPGA, or Program Flash on an iCE40) with the file Generate Programming File made (run_process bitstream first): a Spartan-3E / 6 or 7-series .bit and an ECP5\'s .bit (the ULX3S) loaded into the FPGA (SRAM, until the board is powered off), a Gowin\'s .fs (the Tang Nano 9K) into its SRAM, an iCE40\'s .bin (the iCEBreaker) written into the board\'s SPI flash (kept at power-up). Through the board\'s USB, with the board\'s programmer (openFPGALoader, Digilent\'s djtgcfg, adepttool, xc3sprog or iMPACT; tool to choose another). A bitstream built for another device than the project\'s is refused unless force. Only a trusted project. Returns the programmer\'s log.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      tool: { type: 'string', enum: TOOLS, description: 'The programmer (default: the board\'s, else Toolchain Settings\').' },
      force: { type: 'boolean', description: 'Program a bitstream built for another device than the project\'s anyway (default false), warned.' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async run({ project: name, tool, force = false }, { signal } = {}) {
      const pj = await readProject(name);
      if (!pj.top) throw toolError(`'${name}' has no top module: set_top first`);
      const { startProgramming } = await import('./impl-routes.js');
      let job;
      try { job = await startProgramming({ project: name, ...(tool && { tool }), force }); } catch (e) { throw toolError(e.message); }
      const end = Date.now() + TIMEOUT_MS;
      while (job.status === 'running' && Date.now() < end && !signal?.aborted) await new Promise(r => setTimeout(r, 100));
      if (job.status === 'running') {
        const { cancelJob } = await import('./jobs.js');
        cancelJob(job.id);
        throw toolError(signal?.aborted ? 'programming was cancelled: stopped' : `programming did not end in ${TIMEOUT_MS / 1000} s: stopped`);
      }
      const redact = await redactor(), lines = job.lines.map(redact), ok = job.status === 'ok', r = job.result || {};
      const warnings = r.warnings || [], file = r.bitfile ? `build/${r.bitfile.split(/[\\/]/).pop()}` : null;
      const head = ok ? `Programmed the board${pj.board ? ` (${pj.board})` : ''} with ${file}${r.target === 'flash' ? ' (its SPI flash)' : ''}.` : `Programming failed: ${redact(job.error || 'see the log')}`;
      return { text: [head, ...warnings.map(w => `WARNING: ${w}`), '', ...lines.slice(-40)].join('\n'), isError: !ok,
        data: { project: name, board: pj.board || null, ok, file, tool: r.options?.tool || null, target: r.target || 'sram', warnings, commands: r.commands || [], log: lines },
        untrusted: 'the programmer\'s log, which quotes the project\'s file names' };
    },
  },
];
