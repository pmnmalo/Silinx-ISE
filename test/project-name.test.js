// A project's name (#3538, core/project-name.js): one rule and one message for the New Project wizard, the import
// dialogs, the browser's stores, the local server, the design links and the MCP server; one name made from an import's
// file; a project of the name in another case is the same project (one folder on a case-insensitive file system).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { PROJECT_NAME_RE, projectNameError, projectNameFrom, sameProject } from '../core/project-name.js';
import { NAME_RE as STORE_RE, browserStore, projectOps } from '../web/js/project-store.js';
import { PROJECT_NAME_RE as IDENT_RULE, FILE_RE } from '../core/ident.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-project-name-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const P = await import('../server/projects.js');
const { handle } = await import('../server/mcp.js');

const RULE = 'a letter, then up to 63 letters, digits, - and _';
const GOOD = ['a', 'lab-1', 'lab_1', 'Z9', 'A'.repeat(64), 'x-'];
const BAD = ['', '1lab', '-a', '_a', 'a b', 'a.b', 'a/b', '../x', 'ação', 'A'.repeat(65), 'lab!'];

test('#3538 the rule and its message', () => {
  for (const n of GOOD) { assert.equal(projectNameError(n), null, n); assert.ok(PROJECT_NAME_RE.test(n), n); }
  for (const n of BAD) assert.equal(projectNameError(n), `invalid project name '${n}': ${RULE}`, n);
  for (const v of [undefined, null, 7, {}]) assert.equal(projectNameError(v), `invalid project name '${v}': ${RULE}`);
  assert.equal(STORE_RE, PROJECT_NAME_RE, 'the browser\'s stores take the same rule');
  assert.equal(IDENT_RULE, PROJECT_NAME_RE, 'core/ident.js\'s rule (#3545)');
  for (const n of [...GOOD, ...BAD]) if (n.length <= 64) assert.equal(PROJECT_NAME_RE.test(n), FILE_RE.test(n), `${n}: a new file's characters`);
});

test('#3538 a name made from an import\'s file, always a valid one (or none)', () => {
  const cases = [
    ['2026-lab.zip', 'p_2026-lab'], ['lab-1.zip', 'lab-1'], ['ZipSrc-silinx.zip', 'ZipSrc'], ['blinky.xise', 'blinky'], ['lab-2.silinx.json', 'lab-2'], ['old.JSON', 'old'],
    ['my project (2).zip', 'my_project__2_'], ['dir/sub\\lab.ZIP', 'lab'], ['_x.zip', 'p__x'], ['ação.zip', 'a__o'],
    [`${'a'.repeat(80)}.zip`, 'a'.repeat(64)], ['folder', 'folder'], ['', ''], [undefined, ''], ['.zip', ''],
  ];
  for (const [f, n] of cases) {
    assert.equal(projectNameFrom(f), n, String(f));
    if (n) assert.equal(projectNameError(n), null, n);
  }
});

test('#3538 sameProject: by any case, names or { name }', () => {
  assert.equal(sameProject(['a1', 'b'], 'A1'), 'a1');
  assert.deepEqual(sameProject([{ name: 'Lab' }], 'lab'), { name: 'Lab' });
  assert.equal(sameProject([{ name: 'Lab' }], 'lab2'), undefined);
  assert.equal(sameProject([], 'x'), undefined);
});

const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
let id = 0;
const mcp = async (name, args) => (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;

test('#3538 the server, the browser\'s store and the MCP: the same names, the same message; an existing project in another case', async () => {
  const ops = projectOps(() => browserStore(memStorage()), {});
  const store = browserStore(memStorage()), ops2 = projectOps(() => store, {});
  for (const n of ['lab-1', 'A'.repeat(64)]) {
    await P.createProject({ name: n });
    await ops2.create({ name: n });
    assert.equal((await mcp('new_project', { name: `${n.slice(0, 60)}-m` })).isError, false, n);
  }
  for (const n of ['1lab', 'A'.repeat(65), 'a.b']) {
    const msg = `invalid project name '${n}': ${RULE}`;
    await assert.rejects(P.createProject({ name: n }), { status: 400, message: msg });
    await assert.rejects(ops.create({ name: n }), { message: msg });
    const r = await mcp('new_project', { name: n });
    assert.deepEqual([r.isError, r.content[0].text], [true, `new_project: ${msg}`]);
  }
  // a1 there: A1 is the same project, on every system
  await P.createProject({ name: 'a1' });
  await ops2.create({ name: 'a1' });
  await assert.rejects(P.createProject({ name: 'A1' }), { status: 409, message: "project 'a1' already exists" });
  await assert.rejects(ops2.create({ name: 'A1' }), { message: "project 'a1' already exists" });
  const r = await mcp('new_project', { name: 'A1' });
  assert.deepEqual([r.isError, r.content[0].text], [true, "new_project: project 'a1' already exists"]);
  assert.deepEqual((await P.listProjects()).map(p => p.name).filter(n => /^a1$/i.test(n)), ['a1']);
});
