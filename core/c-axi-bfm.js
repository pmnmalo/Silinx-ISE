// Silinx HLS (#1893): the co-simulation's model of the AXI buses (core/c-cosim.js): a Verilog module with the function's
// own ports, as its test bench drives them, that drives the generated module through its AXI interfaces: a call's arguments
// written to the AXI4-Lite registers, its start, its end read back and its results; each channel's handshake now and then
// late. A response not OKAY is printed as a fault. Isomorphic ES module: no DOM and no Node APIs.
const W = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
const HS = ['ap_start', 'ap_done', 'ap_idle', 'ap_ready'];

export function axiBfm(gen) {
  const { lite, ret, view } = gen.axi;
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
  const direct = gen.ports.filter((p) => !['ap_clk', 'ap_rst_n', 'interrupt'].includes(p.name) && !/^s_axi_/.test(p.name));
  // (the block protocol's ports the module's own: driven from here, once the registers are written)
  const own = direct.filter((p) => HS.includes(p.name));
  if (own.length) L.push("  reg dut_ap_start = 0;", '  wire dut_ap_done, dut_ap_idle, dut_ap_ready;');
  for (const p of direct) P.push({ name: p.name, v: HS.includes(p.name) ? `dut_${p.name}` : p.name });
  if (gen.ports.some((p) => p.name === 'interrupt')) { L.push('  wire ap_interrupt;'); P.push({ name: 'interrupt', v: 'ap_interrupt' }); }
  L.push(`  ${gen.top} dut(${P.map((x) => `.${x.name}(${x.v})`).join(', ')});`);
  // a call
  const writes = lite.flatMap((m) => m.regs.filter((g) => g.dir === 'in').flatMap((g) => Array.from({ length: g.words }, (_, k) => {
    const hi = Math.min(32 * k + 31, g.w - 1);
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

const litePorts0 = (m) => ['AWVALID', 'AWREADY', 'AWADDR', 'WVALID', 'WREADY', 'WDATA', 'WSTRB', 'ARVALID', 'ARREADY', 'ARADDR', 'RVALID', 'RREADY', 'RDATA', 'RRESP', 'BVALID', 'BREADY', 'BRESP'].map((n) => `s_axi_${m.bundle}_${n}`);
