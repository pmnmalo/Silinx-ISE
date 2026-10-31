// Silinx HLS (#1893): the co-simulation's model of the AXI buses (core/c-cosim.js): a Verilog module with the function's
// own ports, as its test bench drives them, that drives the generated module through its AXI interfaces: a call's arguments
// written to the AXI4-Lite registers, its start, its end read back and its results; each channel's handshake now and then
// late. A response not OKAY is printed as a fault. Isomorphic ES module: no DOM and no Node APIs.
const W = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
const HS = ['ap_start', 'ap_done', 'ap_idle', 'ap_ready'];

export function axiBfm(gen) {
  const { lite, ret, view, buses } = gen.axi;
  const L = [`module ${view.top} (${view.ports.map((p) => `${p.dir === 'in' ? 'input' : 'output'} ${p.dir === 'out' && (HS.includes(p.name) || !gen.ports.some((q) => q.name === p.name)) ? 'reg ' : ''}${W(p.w)}${p.name}`).join(', ')});`];
  const hs = view.ports.some((p) => p.name === 'ap_start');
  if (hs) L.push('  initial begin ap_done = 0; ap_idle = 1; ap_ready = 0; end');
  const P = [{ name: 'ap_clk', v: 'ap_clk' }, { name: 'ap_rst_n', v: 'ap_rst_n' }];
  L.push('  wire ap_rst_n = !ap_rst;', '  reg [15:0] ap_lfsr = 16\'hace1;', '  always @(posedge ap_clk) ap_lfsr <= {ap_lfsr[14:0], ap_lfsr[15] ^ ap_lfsr[13] ^ ap_lfsr[12] ^ ap_lfsr[10]};');
  for (const m of lite) {
    const S = (n) => `s_axi_${m.bundle}_${n}`;
    L.push(`  reg ${S('AWVALID')} = 0, ${S('WVALID')} = 0, ${S('ARVALID')} = 0, ${S('RREADY')} = 0, ${S('BREADY')} = 0;`, `  reg [${m.aw - 1}:0] ${S('AWADDR')} = 0, ${S('ARADDR')} = 0;`, `  reg [31:0] ${S('WDATA')} = 0;`, `  reg [3:0] ${S('WSTRB')} = 0;`,
      `  wire ${S('AWREADY')}, ${S('WREADY')}, ${S('ARREADY')}, ${S('RVALID')}, ${S('BVALID')};`, `  wire [31:0] ${S('RDATA')};`, `  wire [1:0] ${S('RRESP')}, ${S('BRESP')};`,
      `  reg [31:0] rd_${m.bundle};`,
      // (each signal changed after the clock's edge; a READY or VALID seen at the falling edge holds at the next rising one)
      `  task wr_${m.bundle}(input [31:0] a, input [31:0] d); begin`,
      `    ${S('AWADDR')} = a; ${S('AWVALID')} = 1;`,
      `    @(negedge ap_clk); while (!${S('AWREADY')}) @(negedge ap_clk);`, `    @(posedge ap_clk); #2 ${S('AWVALID')} = 0;`,
      `    if (ap_lfsr[0]) begin @(posedge ap_clk); #2; end`,
      `    ${S('WDATA')} = d; ${S('WSTRB')} = 4'hf; ${S('WVALID')} = 1;`,
      `    @(negedge ap_clk); while (!${S('WREADY')}) @(negedge ap_clk);`, `    @(posedge ap_clk); #2 ${S('WVALID')} = 0;`,
      `    if (ap_lfsr[1]) begin @(posedge ap_clk); #2; end`,
      `    ${S('BREADY')} = 1;`,
      `    @(negedge ap_clk); while (!${S('BVALID')}) @(negedge ap_clk);`, `    if (${S('BRESP')} !== 0) $display("AXI fault: ${S('BRESP')}");`, `    @(posedge ap_clk); #2 ${S('BREADY')} = 0;`, '  end endtask',
      `  task rd_${m.bundle}_at(input [31:0] a); begin`,
      `    ${S('ARADDR')} = a; ${S('ARVALID')} = 1;`,
      `    @(negedge ap_clk); while (!${S('ARREADY')}) @(negedge ap_clk);`, `    @(posedge ap_clk); #2 ${S('ARVALID')} = 0;`,
      `    if (ap_lfsr[2]) begin @(posedge ap_clk); #2; end`,
      `    ${S('RREADY')} = 1;`,
      `    @(negedge ap_clk); while (!${S('RVALID')}) @(negedge ap_clk);`, `    rd_${m.bundle} = ${S('RDATA')}; if (${S('RRESP')} !== 0) $display("AXI fault: ${S('RRESP')}");`, `    @(posedge ap_clk); #2 ${S('RREADY')} = 0;`, '  end endtask');
    for (const p of litePorts0(m)) P.push({ name: p, v: p });
  }
  // the memories behind each master, an argument's at an address of its own, above 32 bits
  const keys = [...new Set((buses || []).flatMap((b) => b.clients.map((c) => c.key)))];
  const of = (x) => (buses || []).flatMap((b) => b.clients).filter((c) => c.offset === x).map((c) => c.key);
  const offs = new Set(of('off')), directs = new Set(of('direct'));
  const slots = new Map(keys.map((k, i) => [k, offs.has(k) ? 0 : i + 1]));
  const baseOf = (key) => BigInt(slots.get(key)) << 36n;
  // (offset=direct: the address a port of its own, driven from here; offset=off: 0)
  for (const k of keys.filter((x) => directs.has(x))) { L.push(`  wire [63:0] ap_base_${k} = 64'h${baseOf(k).toString(16)};`); P.push({ name: k, v: `ap_base_${k}` }); }
  for (const b of buses || []) L.push(...masterModel(b, slots, P));
  const direct = gen.ports.filter((p) => !['ap_clk', 'ap_rst_n', 'interrupt'].includes(p.name) && !/^[sm]_axi_/.test(p.name) && !directs.has(p.name));
  // (the block protocol's ports the module's own: driven from here, once the registers are written)
  const own = direct.filter((p) => HS.includes(p.name));
  if (own.length) L.push("  reg dut_ap_start = 0;", '  wire dut_ap_done, dut_ap_idle, dut_ap_ready;');
  for (const p of direct) P.push({ name: p.name, v: HS.includes(p.name) ? `dut_${p.name}` : p.name });
  if (gen.ports.some((p) => p.name === 'interrupt')) { L.push('  wire ap_interrupt;'); P.push({ name: 'interrupt', v: 'ap_interrupt' }); }
  L.push(`  ${gen.top} dut(${P.map((x) => `.${x.name}(${x.v})`).join(', ')});`);
  // a call
  const writes = lite.flatMap((m) => m.regs.filter((g) => g.dir === 'in').flatMap((g) => Array.from({ length: g.words }, (_, k) => {
    const hi = Math.min(32 * k + 31, g.w - 1);
    if (g.base) return `      wr_${m.bundle}(${m.aw}'h${(g.off + 4 * k).toString(16)}, 32'h${(k ? baseOf(g.param) >> 32n : baseOf(g.param) & 0xffffffffn).toString(16)});`;
    return `      wr_${m.bundle}(${m.aw}'h${(g.off + 4 * k).toString(16)}, ${g.port}${g.w > 1 ? `[${hi}:${32 * k}]` : ''});`;
  })));
  const reads = lite.flatMap((m) => m.regs.filter((g) => g.dir === 'out').flatMap((g) => {
    const parts = Array.from({ length: g.words }, (_, k) => {
      const hi = Math.min(32 * k + 31, g.w - 1);
      return `      rd_${m.bundle}_at(${g.off + 4 * k}); ${g.port}${g.w > 1 ? `[${hi}:${32 * k}]` : ''} = rd_${m.bundle};`;
    });
    if (!g.ret) parts.push(`      rd_${m.bundle}_at(${g.off + 4 * g.words}); ${g.port}_ap_vld = rd_${m.bundle}[0];`);
    return parts;
  }));
  const vlds = lite.flatMap((m) => m.regs.filter((g) => g.dir === 'out' && !g.ret).map((g) => `${g.port}_ap_vld`));
  const ctlB = lite.find((m) => m.bundle === ret)?.bundle;
  const run = ctlB !== undefined ? [`        wr_${ctlB}(0, 1);`, `        rd_${ctlB}_at(0); while (!rd_${ctlB}[1]) rd_${ctlB}_at(0);`]
    : ['        dut_ap_start = 1;', '        @(negedge ap_clk); while (!dut_ap_done) @(negedge ap_clk);', '        @(posedge ap_clk); #2 dut_ap_start = 0;'];
  L.push(...vlds.map((v) => `  initial ${v} = 0;`));
  if (hs) {
    L.push('  initial begin', '    forever begin', '      @(posedge ap_clk);', '      if (ap_start && !ap_rst) begin', '        #2 ap_idle = 0;', ...writes.map((s) => `  ${s}`),
      ...run, ...reads.map((s) => `  ${s}`), '        ap_done = 1; ap_ready = 1;', '        @(posedge ap_clk); #2 ap_done = 0; ap_ready = 0; ap_idle = 1;', ...vlds.map((v) => `        ${v} = 0;`), '      end', '    end', '  end');
  }
  L.push('endmodule');
  return L.join('\n');
}

/** A bundle's slave: its reads and writes, each a burst of ARLEN + 1 beats, on the test bench's memories. */
function masterModel(b, slots, P) {
  const M = (n) => `m_axi_${b.bundle}_${n}`, W1 = b.w, BY = W1 / 8, lg = Math.log2(BY);
  const out = [];
  for (const [n, w, dir] of [['AWVALID', 1], ['AWADDR', 64], ['AWID', 1], ['AWLEN', 8], ['AWSIZE', 3], ['AWBURST', 2], ['AWLOCK', 2], ['AWCACHE', 4], ['AWPROT', 3], ['AWQOS', 4], ['AWREGION', 4], ['AWUSER', 1],
    ['WVALID', 1], ['WDATA', W1], ['WSTRB', BY], ['WLAST', 1], ['WID', 1], ['WUSER', 1], ['ARVALID', 1], ['ARADDR', 64], ['ARID', 1], ['ARLEN', 8], ['ARSIZE', 3], ['ARBURST', 2], ['ARLOCK', 2], ['ARCACHE', 4], ['ARPROT', 3], ['ARQOS', 4], ['ARREGION', 4], ['ARUSER', 1], ['RREADY', 1], ['BREADY', 1]]) {
    out.push(`  wire ${W(w)}${M(n)};`);
    P.push({ name: M(n), v: M(n) });
    void dir;
  }
  for (const [n, w] of [['AWREADY', 1], ['WREADY', 1], ['ARREADY', 1], ['RVALID', 1], ['RDATA', W1], ['RLAST', 1], ['RID', 1], ['RUSER', 1], ['RRESP', 2], ['BVALID', 1], ['BRESP', 2], ['BID', 1], ['BUSER', 1]]) {
    out.push(`  reg ${W(w)}${M(n)} = 0;`);
    P.push({ name: M(n), v: M(n) });
  }
  const T = `${b.bundle}`;
  out.push(`  reg [63:0] ra_${T}, wa_${T}; reg [8:0] rn_${T}; reg [2:0] rs_${T}; integer ri_${T}, wi_${T}, rc_${T}, wc_${T}; reg [${lg + 2}:0] rl_${T}, wl_${T}; reg [63:0] re_${T}, we_${T};`);
  // (a beat's element, its client: from the address)
  const slot = (a) => `${a}[39:36]`;
  const reads = b.clients.filter((c) => c.read).map((c) => {
    const k = slots.get(c.key);
    return `        if (rc_${T} == ${k} && re_${T} % ${c.stride} == ${c.off}) begin ${c.name}_address0 = re_${T} / ${c.stride}; ${c.name}_ce0 = 1; ${c.written ? `${c.name}_we0 = 0; ` : ''}@(posedge ap_clk); #2 ${c.name}_ce0 = 0; ${M('RDATA')} = ${W1}'d0 | ${c.name}_q0; ${M('RDATA')} = ${M('RDATA')} << rl_${T}; end`;
  });
  const writes = b.clients.filter((c) => c.written).map((c) => {
    const k = slots.get(c.key);
    return `        if (wc_${T} == ${k} && we_${T} % ${c.stride} == ${c.off}) begin if (${M('WSTRB')} !== (${BY}'d${(1n << BigInt(c.bytes)) - 1n} << (wa_${T}[${lg - 1}:0]))) $display("AXI fault: ${M('WSTRB')}"); ${c.name}_address0 = we_${T} / ${c.stride}; ${c.name}_d0 = ${M('WDATA')} >> wl_${T}; ${c.name}_ce0 = 1; ${c.name}_we0 = 1; @(posedge ap_clk); #2 ${c.name}_ce0 = 0; ${c.name}_we0 = 0; end`;
  });
  out.push('  initial begin', '    forever begin',
    `      if (ap_lfsr[3]) begin @(posedge ap_clk); #2; end`, `      ${M('ARREADY')} = 1;`, `      @(negedge ap_clk); while (!${M('ARVALID')}) @(negedge ap_clk);`,
    `      ra_${T} = ${M('ARADDR')}; rn_${T} = ${M('ARLEN')}; rs_${T} = ${M('ARSIZE')}; rc_${T} = ${slot(`ra_${T}`)};`, `      if (${M('ARBURST')} !== 1) $display("AXI fault: ${M('ARBURST')}");`,
    `      @(posedge ap_clk); #2 ${M('ARREADY')} = 0;`,
    `      for (ri_${T} = 0; ri_${T} <= rn_${T}; ri_${T} = ri_${T} + 1) begin`, `        re_${T} = ra_${T}[35:0] + (ri_${T} << rs_${T}); rl_${T} = (ra_${T}[${lg - 1}:0] + (ri_${T} << rs_${T})) % ${BY} * 8;`, ...reads,
    `        if (ap_lfsr[4]) begin @(posedge ap_clk); #2; end`, `        ${M('RLAST')} = ri_${T} == rn_${T}; ${M('RVALID')} = 1;`, `        @(negedge ap_clk); while (!${M('RREADY')}) @(negedge ap_clk);`, `        @(posedge ap_clk); #2 ${M('RVALID')} = 0;`, '      end', '    end', '  end');
  out.push('  initial begin', '    forever begin',
    `      if (ap_lfsr[5]) begin @(posedge ap_clk); #2; end`, `      ${M('AWREADY')} = 1;`, `      @(negedge ap_clk); while (!${M('AWVALID')}) @(negedge ap_clk);`,
    `      wa_${T} = ${M('AWADDR')}; wc_${T} = ${slot(`wa_${T}`)}; rn_${T}w = ${M('AWLEN')}; rs_${T}w = ${M('AWSIZE')};`, `      if (${M('AWBURST')} !== 1) $display("AXI fault: ${M('AWBURST')}");`,
    `      @(posedge ap_clk); #2 ${M('AWREADY')} = 0;`,
    `      for (wi_${T} = 0; wi_${T} <= rn_${T}w; wi_${T} = wi_${T} + 1) begin`, `        if (ap_lfsr[6]) begin @(posedge ap_clk); #2; end`, `        ${M('WREADY')} = 1;`, `        @(negedge ap_clk); while (!${M('WVALID')}) @(negedge ap_clk);`,
    `        if (${M('WLAST')} !== (wi_${T} == rn_${T}w)) $display("AXI fault: ${M('WLAST')}");`, `        we_${T} = wa_${T}[35:0] + (wi_${T} << rs_${T}w); wl_${T} = (wa_${T}[${lg - 1}:0] + (wi_${T} << rs_${T}w)) % ${BY} * 8;`, `        @(posedge ap_clk); #2 ${M('WREADY')} = 0;`, ...writes, '      end',
    `      if (ap_lfsr[7]) begin @(posedge ap_clk); #2; end`, `      ${M('BVALID')} = 1;`, `      @(negedge ap_clk); while (!${M('BREADY')}) @(negedge ap_clk);`, `      @(posedge ap_clk); #2 ${M('BVALID')} = 0;`, '    end', '  end');
  out.unshift(`  reg [8:0] rn_${T}w; reg [2:0] rs_${T}w;`);
  return out;
}

const litePorts0 = (m) => ['AWVALID', 'AWREADY', 'AWADDR', 'WVALID', 'WREADY', 'WDATA', 'WSTRB', 'ARVALID', 'ARREADY', 'ARADDR', 'RVALID', 'RREADY', 'RDATA', 'RRESP', 'BVALID', 'BREADY', 'BRESP'].map((n) => `s_axi_${m.bundle}_${n}`);
