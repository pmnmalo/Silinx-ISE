// The MCP server's modules (#2674): server/mcp.js split by area, the projects' tools (mcp-projects.js), their
// settings' (mcp-settings.js), their sources' (mcp-sources.js), their import and export (mcp-transfer.js), their links (mcp-link.js), their sharing (mcp-collab.js, #3181), the
// HDL's (mcp-hdl.js), the wave configurations' (mcp-wcfg.js, #2839), the processes' (mcp-processes.js) and their helpers (mcp-util.js). The server's tools are
// those of the modules, the ones of before the split in their order; server/mcp.js still exports what it did. The
// tools themselves are tested through the protocol in mcp.test.js, mcp-settings.test.js, mcp-sources.test.js and
// mcp-transfer.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mcp = await import('../server/mcp.js');
const { PROJECT_TOOLS } = await import('../server/mcp-projects.js');
const { SETTINGS_TOOLS } = await import('../server/mcp-settings.js');
const { NEW_SOURCE_TOOLS } = await import('../server/mcp-new-source.js');
const { WIZARD_TOOLS } = await import('../server/mcp-wizards.js');
const { CONSTRAINTS_TOOLS } = await import('../server/mcp-constraints.js');
const { TEST_BENCH_TOOLS } = await import('../server/mcp-test-bench.js');
const { CONVERT_TOOLS } = await import('../server/mcp-convert.js');
const { VIEW_TOOLS } = await import('../server/mcp-views.js');
const { TABLE_TOOLS } = await import('../server/mcp-tables.js');
const { GRADE_TOOLS } = await import('../server/mcp-grade.js');
const { CHECK_TOOLS } = await import('../server/mcp-check.js');
const { SCHEMATIC_TOOLS } = await import('../server/mcp-schematic.js');
const { SIMULATE_DRAWING_TOOLS } = await import('../server/mcp-simulate-drawing.js');
const { SOURCE_TOOLS } = await import('../server/mcp-sources.js');
const { TRANSFER_TOOLS } = await import('../server/mcp-transfer.js');
const { FIND_TOOLS } = await import('../server/mcp-find.js');
const { LINK_TOOLS } = await import('../server/mcp-link.js');
const { COLLAB_TOOLS } = await import('../server/mcp-collab.js');
const { GIT_TOOLS } = await import('../server/mcp-git.js');
const { HDL_TOOLS } = await import('../server/mcp-hdl.js');
const { WCFG_TOOLS } = await import('../server/mcp-wcfg.js');
const { HLS_TOOLS } = await import('../server/mcp-hls.js');
const { VERIFY_TOOLS } = await import('../server/mcp-verify.js');
const { PROCESS_TOOLS, PROCESSES, REPORT_FILES, OPEN_REPORTS } = await import('../server/mcp-processes.js');
const { LAB_TOOLS } = await import('../server/mcp-labs.js');
const { TIMING_TOOLS } = await import('../server/mcp-timing.js');
const { CAPTURE_TOOLS } = await import('../server/mcp-capture.js');
const { BOARD_TOOLS } = await import('../server/mcp-board.js');
const { SYMBOL_TOOLS } = await import('../server/mcp-symbol.js');
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
  assert.deepEqual(names(NEW_SOURCE_TOOLS), ['new_source']);
  assert.deepEqual(names(WIZARD_TOOLS), ['clock_manager', 'block_memory', 'constraints_wizard']);
  assert.deepEqual(names(CONSTRAINTS_TOOLS), ['check_constraints']);   // (Check Constraints, #2296)
  assert.deepEqual(names(TEST_BENCH_TOOLS), ['test_bench_wizard']);
  assert.deepEqual(names(CONVERT_TOOLS), ['convert_module', 'convert_drawing']);
  assert.deepEqual(names(VIEW_TOOLS), ['related_view']);
  assert.deepEqual(names(TABLE_TOOLS), ['set_output_logic']);
  assert.deepEqual(names(CHECK_TOOLS), ['check_drawing']);
  assert.deepEqual(names(SCHEMATIC_TOOLS), ['rearrange_wires', 'rearrange_schematic']);
  assert.deepEqual(names(SYMBOL_TOOLS), ['read_symbol', 'edit_symbol', 'update_symbols']);   // (a module's symbol, #3755)
  assert.deepEqual(names(SIMULATE_DRAWING_TOOLS), ['simulate_drawing']);
  assert.deepEqual(names(SOURCE_TOOLS), ['unset_top', 'remove_from_project', 'add_to_project', 'rename_file', 'rename_module', 'delete_file', 'delete_project']);
  assert.deepEqual(names(FIND_TOOLS), ['find_in_project']);   // (Find in Project, #3546)
  assert.deepEqual(names(TRANSFER_TOOLS), ['export_project', 'import_project', 'import_source']);
  assert.deepEqual(names(LINK_TOOLS), ['project_link', 'open_link', 'short_links', 'delete_short_link']);
  assert.deepEqual(names(COLLAB_TOOLS), ['share_project', 'follow_project']);
  assert.deepEqual(names(GIT_TOOLS), ['git_clone', 'git_init', 'git_status', 'git_commit', 'git_push', 'git_pull', 'git_log', 'git_diff']);
  assert.deepEqual(names(HDL_TOOLS), ['check_syntax', 'simulate']);
  assert.deepEqual(names(VERIFY_TOOLS), ['verify']);
  assert.deepEqual(names(WCFG_TOOLS), ['save_wave_config', 'load_wave_config']);
  assert.deepEqual(names(HLS_TOOLS), ['c_simulation', 'c_cosimulation', 'c_synthesis_report', 'c_generated']);
  assert.deepEqual(names(PROCESS_TOOLS), ['run_process', 'get_report']);
  assert.deepEqual(names(BOARD_TOOLS), ['program_board']);   // (Configure Target Device, #2674, #2298)
  assert.deepEqual(names(CAPTURE_TOOLS), ['capture_settings', 'capture']);   // (the logic analyzer, #3176)
  assert.deepEqual(names(TIMING_TOOLS), ['timing_paths']);
  assert.deepEqual(names(LAB_TOOLS), ['lab']);   // (the guided labs, #3179)
  assert.deepEqual(names(GRADE_TOOLS), ['grade']);   // (automatic grading, #3192)
  assert.deepEqual(mcp.TOOLS, [...PROJECT_TOOLS, ...SETTINGS_TOOLS, ...NEW_SOURCE_TOOLS, ...WIZARD_TOOLS, ...CONSTRAINTS_TOOLS, ...TEST_BENCH_TOOLS, ...CONVERT_TOOLS, ...VIEW_TOOLS, ...TABLE_TOOLS, ...CHECK_TOOLS, ...SCHEMATIC_TOOLS, ...SYMBOL_TOOLS, ...SIMULATE_DRAWING_TOOLS, ...SOURCE_TOOLS, ...FIND_TOOLS, ...TRANSFER_TOOLS, ...LINK_TOOLS, ...GIT_TOOLS, ...COLLAB_TOOLS, ...HDL_TOOLS, ...VERIFY_TOOLS, ...WCFG_TOOLS, ...HLS_TOOLS, ...PROCESS_TOOLS, ...BOARD_TOOLS, ...CAPTURE_TOOLS, ...TIMING_TOOLS, ...LAB_TOOLS, ...GRADE_TOOLS]);
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
  await assert.rejects(U.boardDevice('nosuch'), { toolError: true, message: "unknown board 'nosuch' (list_devices)" });
  await assert.rejects(U.readProject(''), { toolError: true, message: 'project: the name of a project of the workspace (list_projects)' });
  const d = { severity: 'warning', file: 'src/a.vhd', line: 3, message: 'unused signal' };
  assert.equal(U.diagLine(d), 'WARNING:HDLCompiler - "src/a.vhd" Line 3: unused signal');
  assert.deepEqual(U.diagJson(d), { severity: 'warning', file: 'src/a.vhd', line: 3, col: null, tool: 'HDLCompiler', message: 'unused signal' });
});

test('#2795 processText: the errors and warnings, then … and the log\'s end; no … when there is none', async () => {
  const { processText } = await import('../server/mcp-processes.js');
  const head = 'Process "implement" of <gates> completed successfully (Silinx toolchain).';
  const lines = ['=== SILINX STEP par ===', 'All signals are completely routed.', 'Flow finished.'];
  assert.equal(processText({ errors: [], warnings: [], lines, head, logLines: 2 }), 'All signals are completely routed.\nFlow finished.\n' + head);
  assert.equal(processText({ errors: [], warnings: ['WARNING:Silinx - an input is unused'], lines, head, logLines: 1 }),
    'WARNING:Silinx - an input is unused\n…\nFlow finished.\n' + head);
  assert.equal(processText({ errors: ['ERROR:Silinx - no top'], warnings: ['WARNING:Silinx - w'], lines: ['x'], head: 'failed', logLines: 5 }),
    'ERROR:Silinx - no top\nWARNING:Silinx - w\n…\nx\nfailed');
});
