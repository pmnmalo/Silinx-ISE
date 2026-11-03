// The MCP server's modules (#2674): server/mcp.js split by area, the projects' tools (mcp-projects.js), their
// settings' (mcp-settings.js), their sources' (mcp-sources.js), their import and export (mcp-transfer.js), the
// HDL's (mcp-hdl.js), the processes' (mcp-processes.js) and their helpers (mcp-util.js). The server's tools are
// those of the modules, the ones of before the split in their order; server/mcp.js still exports what it did. The
// tools themselves are tested through the protocol in mcp.test.js, mcp-settings.test.js, mcp-sources.test.js and
// mcp-transfer.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mcp = await import('../server/mcp.js');
const { PROJECT_TOOLS } = await import('../server/mcp-projects.js');
const { SETTINGS_TOOLS } = await import('../server/mcp-settings.js');
const { SOURCE_TOOLS } = await import('../server/mcp-sources.js');
const { TRANSFER_TOOLS } = await import('../server/mcp-transfer.js');
const { HDL_TOOLS } = await import('../server/mcp-hdl.js');
const { PROCESS_TOOLS, PROCESSES, REPORT_FILES, OPEN_REPORTS } = await import('../server/mcp-processes.js');
const U = await import('../server/mcp-util.js');

const names = tools => tools.map(t => t.name);

test('server/mcp.js exports what it did before the split', () => {
  assert.deepEqual(Object.keys(mcp).sort(), ['OPEN_REPORTS', 'PROTOCOL_VERSIONS', 'TOOLS', 'handle', 'serveMcp']);
  assert.equal(mcp.OPEN_REPORTS, OPEN_REPORTS);
  assert.deepEqual(mcp.PROTOCOL_VERSIONS, ['2025-06-18', '2025-03-26', '2024-11-05']);
});

test('the tools: those of the areas, the ones of before the split in their order', () => {
  assert.deepEqual(names(PROJECT_TOOLS), ['list_examples', 'list_projects', 'new_project_from_example', 'new_project', 'set_top', 'project_info', 'read_file', 'write_file']);
  assert.deepEqual(names(SETTINGS_TOOLS), ['list_devices', 'set_design_properties', 'set_process_properties', 'set_source_properties']);
  assert.deepEqual(names(SOURCE_TOOLS), ['unset_top', 'remove_from_project', 'add_to_project', 'rename_file', 'rename_module', 'delete_file', 'delete_project']);
  assert.deepEqual(names(TRANSFER_TOOLS), ['export_project', 'import_project']);
  assert.deepEqual(names(HDL_TOOLS), ['check_syntax', 'simulate']);
  assert.deepEqual(names(PROCESS_TOOLS), ['run_process', 'get_report']);
  assert.deepEqual(mcp.TOOLS, [...PROJECT_TOOLS, ...SETTINGS_TOOLS, ...SOURCE_TOOLS, ...TRANSFER_TOOLS, ...HDL_TOOLS, ...PROCESS_TOOLS]);
  assert.equal(new Set(names(mcp.TOOLS)).size, mcp.TOOLS.length);
  for (const t of mcp.TOOLS) {
    assert.equal(typeof t.run, 'function', t.name);
    assert.equal(t.inputSchema.type, 'object', t.name);
    assert.equal(t.inputSchema.additionalProperties, false, t.name);
    for (const r of t.inputSchema.required || []) assert.ok(Object.hasOwn(t.inputSchema.properties, r), `${t.name}: ${r}`);
  }
});

test('the processes: run_process\'s choices, and a report for each of the two toolchains', () => {
  assert.deepEqual(PROCESS_TOOLS.find(t => t.name === 'run_process').inputSchema.properties.process.enum, Object.keys(PROCESSES));
  assert.deepEqual(PROCESSES.implement, ['synth', 'translate', 'map', 'par']);
  assert.deepEqual(Object.keys(REPORT_FILES.open), Object.keys(REPORT_FILES.ise));
  assert.equal(REPORT_FILES.ise.timing('top'), 'build/top.twr');
  assert.equal(REPORT_FILES.open.timing('top'), 'build/open/timing.txt');
  assert.equal(REPORT_FILES.open.map, null);
});

test('the helpers: a tool\'s error, the clipped text, the boards, the diagnostics\' lines', async () => {
  const e = U.toolError('no project');
  assert.equal(e.toolError, true);
  assert.equal(e.message, 'no project');
  assert.equal(U.clip('abc'), 'abc');
  assert.equal(U.clip('x'.repeat(U.MAX_TEXT + 5)), `${'x'.repeat(U.MAX_TEXT)}\n… (5 more characters)`);
  assert.equal(U.deviceName({ part: 'xc3s250e', package: 'cp132', speed: '-4' }), 'xc3s250ecp132-4');
  assert.equal(U.deviceName(null), 'no device');
  assert.deepEqual(await U.boardDevice('basys2', '100'), { board: 'basys2', device: { family: 'spartan3e', part: 'xc3s100e', package: 'cp132', speed: '-4' } });
  await assert.rejects(U.boardDevice('nosuch'), { toolError: true, message: "unknown board 'nosuch' (basys2, nexys2)" });
  await assert.rejects(U.readProject(''), { toolError: true, message: 'project: the name of a project of the workspace (list_projects)' });
  const d = { severity: 'warning', file: 'src/a.vhd', line: 3, message: 'unused signal' };
  assert.equal(U.diagLine(d), 'WARNING:HDLCompiler - "src/a.vhd" Line 3: unused signal');
  assert.deepEqual(U.diagJson(d), { severity: 'warning', file: 'src/a.vhd', line: 3, col: null, tool: 'HDLCompiler', message: 'unused signal' });
});
