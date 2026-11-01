// UI: the ASM chart editor's drawing of its chart (web/js/asm-render.js, #405: out of mountAsmEditor), mounted alone
// in the page on an SVG of its own with the editor's state given (the model of a new chart): the ASM blocks, the
// connections (a decision's 1 / 0, the one selected), the boxes (their kinds, the initial state, the selected one,
// those with problems, the state codes), the status line; the toolbar's state.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#405 ASM drawing: blocks, connections, boxes (kinds, initial, selected, problems, codes), the status line, the toolbar', E, async (page) => {
  const out = await page.eval(async () => {
    const { mountRender } = await import('/js/asm-render.js');
    const { newModel } = await import('/core/asm.js');
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.innerHTML = '<g class="b"></g><g class="e"></g><g class="n"></g>';
    const statusInfo = document.createElement('span');
    const mk = (tag) => document.createElement(tag);
    const delBtn = mk('button');
    const encSel = mk('select');
    encSel.innerHTML = '<option>binary</option><option>gray</option><option>onehot</option><option>enum</option>';
    document.body.append(svg, statusInfo);
    const M = newModel('ctl', 'verilog');
    const st = { M, sel: { nodes: new Set(['s2']), edge: 'e2' }, diags: [{ nodeId: 'd2', severity: 'warning' }, { nodeId: 'd2', severity: 'error' },
      { nodeId: 'o1', severity: 'warning' }, { severity: 'warning' }], hist: ['a', 'b'], hi: 1 };
    const nodeById = (id) => M.nodes.find((n) => n.id === id);
    const r = mountRender({ state: () => st, uid: 'asm9', gBlocks: svg.querySelector('.b'), gEdges: svg.querySelector('.e'), gNodes: svg.querySelector('.n'),
      statusInfo, delBtn, encSel, nodeById, caseExits: (id) => M.edges.filter((e) => e.from === id),
      exitsOf: (id) => M.edges.filter((e) => e.from === id), drawTarget: (e) => nodeById(e.to) });
    r.render(); r.updateToolbar();
    const q = (s) => [...svg.querySelectorAll(s)];
    const o = {};
    o.blocks = q('.asm-block').length;
    o.edges = q('.asm-edge').map((g) => `${g.dataset.edge}${g.classList.contains('sel') ? '*' : ''}`);
    o.labels = q('.asm-edge-label').map((t) => t.textContent);
    o.marker = q('.asm-edge.sel .asm-edge-line')[0].getAttribute('marker-end');
    o.nodes = q('.asm-node').map((g) => `${g.dataset.node}:${[...g.classList].filter((c) => c !== 'asm-node').join(',')}`);
    o.codes = q('.asm-statecode').map((t) => t.textContent);
    o.texts = q('[data-node=s3] .asm-text').map((t) => t.textContent);
    o.status = statusInfo.textContent;
    o.toolbar = [delBtn.disabled, encSel.value];
    // nothing selected, at the start of the history, one-hot: no Delete, no Undo, the codes one-hot
    st.sel = { nodes: new Set(), edge: null }; st.hi = 0; st.diags = []; M.encoding = 'onehot';
    r.render(); r.updateToolbar();
    o.toolbar2 = [delBtn.disabled, encSel.value];
    o.codes2 = q('.asm-statecode').map((t) => t.textContent);
    o.status2 = statusInfo.textContent;
    o.sel2 = q('.sel').length;
    // an enum encoding: no codes
    M.encoding = 'enum'; r.render();
    o.codes3 = q('.asm-statecode').length;
    return o;
  });
  assert.equal(out.blocks, 2);   // (IDLE's and RUN's: FINISH goes straight to a state, a block of one box is not outlined)
  assert.deepEqual(out.edges, ['e1', 'e2*', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8']);
  assert.deepEqual(out.labels, ['1', '0', '1', '0']);
  assert.equal(out.marker, 'url(#asm9-arr-sel)');
  assert.deepEqual(out.nodes, ['s1:asm-state,initial', 'd1:asm-decision', 'o1:asm-output,warn', 's2:asm-state,sel', 'd2:asm-decision,err', 's3:asm-state']);
  assert.deepEqual(out.codes, ['00', '01', '10']);
  assert.deepEqual(out.texts, ['busy = 1', 'ready = 1']);
  assert.equal(out.status, 'ctl · 3 states · 1 error · 3 warnings');
  assert.deepEqual(out.toolbar, [false, 'binary']);
  assert.deepEqual(out.toolbar2, [true, 'onehot']);
  assert.deepEqual(out.codes2, ['001', '010', '100']);
  assert.equal(out.status2, 'ctl · 3 states · 0 errors · 0 warnings');
  assert.equal(out.sel2, 0);
  assert.equal(out.codes3, 0);
});
