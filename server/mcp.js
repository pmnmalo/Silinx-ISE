// Silinx as an MCP server (Model Context Protocol, #134): an AI assistant (Claude Desktop, Claude Code,
// any MCP client) opens and inspects the projects of the Silinx workspace, reads and writes their
// files, checks their syntax, simulates them and runs the processes (synthesis, implementation,
// bitstream, timing, power, pins), then reads their reports, warnings and errors.
//   silinx-ise mcp        (bin/silinx-ise.js): JSON-RPC 2.0 over stdin / stdout, one message a line
// A thin layer over the server's own functions (server/projects.js, impl-routes.js
// startImplementation / projectReports, ise.js viewSources) and core/ (compile, elaborate, the design
// checks of core/lint.js, the simulator): the results are the application's. The projects are the
// workspace's (SILINX_WORKSPACE, as for `silinx-ise serve`): every path stays inside its project
// (symbolic links included); nothing runs but Silinx's own processes; programming a board is left out.
// The ISE machine's address never appears in a result (the logs are redacted).
import readline from 'node:readline';
import { VERSION } from '../core/version.js';
import { redactor } from './mcp-util.js';
import { PROJECT_TOOLS } from './mcp-projects.js';
import { HDL_TOOLS } from './mcp-hdl.js';
import { PROCESS_TOOLS } from './mcp-processes.js';
import { SETTINGS_TOOLS } from './mcp-settings.js';
import { SOURCE_TOOLS } from './mcp-sources.js';
import { NEW_SOURCE_TOOLS } from './mcp-new-source.js';
import { TRANSFER_TOOLS } from './mcp-transfer.js';

export { OPEN_REPORTS } from './mcp-processes.js';

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'silinx-ise', title: 'Silinx ISE', version: VERSION };
const INSTRUCTIONS = 'Silinx ISE: FPGA design for teaching (Spartan-3E; Basys2, Nexys2). Projects live in the Silinx workspace: '
  + 'list_projects, new_project_from_example, or new_project (empty) then new_source / write_file and set_top; then read_file / write_file, check_syntax, simulate (the project\'s test bench), '
  + 'set_design_properties (board, device: list_devices) and set_process_properties, remove_from_project / add_to_project, rename_file / rename_module, delete_file, import_project / export_project, '
  + 'run_process (synthesize, implement, bitstream, timing, power, pins) and get_report. The Silinx toolchain needs no Xilinx ISE.';

// the tools, by area: the projects and their files (mcp-projects.js), their settings (mcp-settings.js), their
// new sources (mcp-new-source.js), their sources (mcp-sources.js), their import and export (mcp-transfer.js), the HDL (mcp-hdl.js), the processes (mcp-processes.js)
export const TOOLS = [...PROJECT_TOOLS, ...SETTINGS_TOOLS, ...NEW_SOURCE_TOOLS, ...SOURCE_TOOLS, ...TRANSFER_TOOLS, ...HDL_TOOLS, ...PROCESS_TOOLS];

// ------------------------------------------------------------------ the protocol
/** One request (or notification) of a client: its answer, or null for a notification. */
export async function handle(msg, state = {}) {
  const reply = result => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'invalid request');
  const isNotification = msg.id === undefined;
  if (isNotification) return null;   // notifications/initialized, notifications/cancelled…: nothing to answer
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      state.initialized = true;
      return reply({ protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS.map(({ run, ...t }) => t) });
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === msg.params?.name);
      if (!tool) return fail(-32602, `unknown tool '${msg.params?.name}'`);
      const args = msg.params?.arguments || {};
      const known = Object.keys(tool.inputSchema.properties);
      const extra = Object.keys(args).filter(k => !known.includes(k));
      const missing = (tool.inputSchema.required || []).filter(k => args[k] === undefined);
      if (extra.length || missing.length) return reply({ content: [{ type: 'text', text: `${tool.name}: ${[missing.length ? `missing ${missing.join(', ')}` : '', extra.length ? `unknown ${extra.join(', ')}` : ''].filter(Boolean).join('; ')}` }], isError: true });
      try {
        const r = await tool.run(args);
        return reply({ content: [{ type: 'text', text: r.text }], structuredContent: r.data, isError: !!r.isError });
      } catch (e) {
        // a tool's failure is the tool's result (the model reads it), not a protocol error
        const redact = await redactor();
        return reply({ content: [{ type: 'text', text: redact(`${tool.name}: ${e.message || e}`) }], isError: true });
      }
    }
    default: return fail(-32601, `method not found: ${msg.method}`);
  }
}

/** Serve MCP on a pair of streams (stdin / stdout): one JSON-RPC message a line; the log on stderr. */
export function serveMcp({ input = process.stdin, output = process.stdout } = {}) {
  const state = {};
  const send = m => output.write(`${JSON.stringify(m)}\n`);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let pending = Promise.resolve();
  rl.on('line', line => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); return; }
    // (one at a time, in order: a process and a read of its report do not overlap)
    pending = pending.then(async () => {
      const batch = Array.isArray(msg) ? msg : [msg];
      const out = (await Promise.all(batch.map(m => handle(m, state)))).filter(Boolean);
      if (out.length) send(Array.isArray(msg) ? out : out[0]);
    }).catch(e => process.stderr.write(`silinx-ise mcp: ${e?.stack || e}\n`));
  });
  return new Promise(resolve => rl.on('close', () => pending.then(resolve)));
}
