// Silinx HLS (#1706): a stream of structs of a DATAFLOW top, one word as Vitis HLS makes it (#1668: its ap_fifo port one
// word, its axis port's TDATA, TKEEP, … its parts, core/c-axis.js), while its processes, modules of their own made flat,
// read or write each member through a FIFO of its own, each in a state of its own. Between them, an adapter:
//   an input word: each member's dout its bits, its empty_n the word's until that member is read; the word read once
//   every member a process uses is;
//   an output word: each member's value held once written; the word written once every member a process uses is.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   wordAdapter(name, word, lang, stall) -> the adapter's module, its lines
//     word: { dir: 'in' | 'out', w, members: [{ off, w }] } (its ports w_dout / w_empty_n / w_read, or w_din / w_full_n /
//     w_write; each member k's m<k>_dout / m<k>_empty_n / m<k>_read, or m<k>_din / m<k>_full_n / m<k>_write)

/** The adapter's ports: [name, dir, w], the clock's first. */
export function wordPorts(word, stall = false) {
  const P = [['ap_clk', 'in', 1], ['ap_rst', 'in', 1], ...(stall ? [['ap_ce', 'in', 1]] : [])];
  if (word.dir === 'in') P.push(['w_dout', 'in', word.w], ['w_empty_n', 'in', 1], ['w_read', 'out', 1]);
  else P.push(['w_din', 'out', word.w], ['w_full_n', 'in', 1], ['w_write', 'out', 1]);
  word.members.forEach((m, k) => {
    if (word.dir === 'in') P.push([`m${k}_dout`, 'out', m.w], [`m${k}_empty_n`, 'out', 1], [`m${k}_read`, 'in', 1]);
    else P.push([`m${k}_din`, 'in', m.w], [`m${k}_full_n`, 'out', 1], [`m${k}_write`, 'in', 1]);
  });
  return P;
}

export function wordAdapter(name, word, lang, stall = false) {
  return (lang === 'vhdl' ? vhdlWord : verilogWord)(name, word, stall);
}

function vhdlWord(name, word, stall) {
  const T = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
  const ps = wordPorts(word, stall);
  const ks = word.members.map((m, k) => k);
  const bits = (s, m) => (m.w === 1 && word.w === 1 ? s : m.w === 1 ? `${s}(${m.off})` : `${s}(${m.off + m.w - 1} downto ${m.off})`);
  const ce = stall ? " and ap_ce = '1'" : '';
  const L = [`-- a stream of structs of the top, one word (#pragma HLS DATAFLOW): its members' FIFOs, ${word.dir === 'in' ? 'each read once a word' : 'each held until all are written'}`,
    'library ieee;', 'use ieee.std_logic_1164.all;', '', `entity ${name} is`, '  port ('];
  ps.forEach(([n, d, w], i) => L.push(`    ${n} : ${d} ${T(w)}${i < ps.length - 1 ? ';' : ''}`));
  L.push('  );', `end ${name};`, '', `architecture behav of ${name} is`, '  signal ap_all : std_logic;');
  if (word.dir === 'in') {
    L.push(`  signal ${ks.map((k) => `m${k}_taken`).join(', ')} : std_logic := '0';`, '  signal w_take : std_logic;', 'begin');
    for (const [k, m] of word.members.entries()) L.push(`  m${k}_dout <= ${bits('w_dout', m)};`, `  m${k}_empty_n <= w_empty_n and not m${k}_taken;`);
    L.push(`  ap_all <= ${ks.map((k) => `(m${k}_taken or m${k}_read)`).join(' and ')};`, `  w_take <= '1' when w_empty_n = '1' and ap_all = '1'${ce} else '0';`, '  w_read <= w_take;',
      '  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', "      if ap_rst = '1' then", ...ks.map((k) => `        m${k}_taken <= '0';`),
      ...(stall ? ["      elsif ap_ce = '0' then", '        null;'] : []), "      elsif w_take = '1' then", ...ks.map((k) => `        m${k}_taken <= '0';`), '      else',
      ...ks.map((k) => `        if m${k}_read = '1' and w_empty_n = '1' then m${k}_taken <= '1'; end if;`), '      end if;', '    end if;', '  end process;', 'end behav;', '');
    return L;
  }
  L.push(`  signal ${ks.map((k) => `m${k}_have`).join(', ')} : std_logic := '0';`, ...word.members.map((m, k) => `  signal m${k}_hold, m${k}_val : ${T(m.w)};`),
    '  signal w_word : std_logic_vector(' + (word.w - 1) + ' downto 0);', '  signal w_put : std_logic;', 'begin');
  for (const [k] of word.members.entries()) L.push(`  m${k}_val <= m${k}_hold when m${k}_have = '1' else m${k}_din;`, `  m${k}_full_n <= not m${k}_have;`);
  // (the bits of a member no process writes: 0)
  L.push("  process (" + ks.map((k) => `m${k}_val`).join(', ') + ')', '  begin', "    w_word <= (others => '0');",
    ...word.members.map((m, k) => `    w_word(${m.w === 1 ? m.off : `${m.off + m.w - 1} downto ${m.off}`}) <= m${k}_val;`), '  end process;');
  L.push(`  w_din <= ${word.w === 1 ? 'w_word(0)' : 'w_word'};`, `  ap_all <= ${ks.map((k) => `(m${k}_have or m${k}_write)`).join(' and ')};`, `  w_put <= '1' when ap_all = '1'${ce} else '0';`, '  w_write <= w_put;',
    '  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', "      if ap_rst = '1' then", ...ks.map((k) => `        m${k}_have <= '0';`),
    ...(stall ? ["      elsif ap_ce = '0' then", '        null;'] : []), "      elsif w_put = '1' and w_full_n = '1' then", ...ks.map((k) => `        m${k}_have <= '0';`), '      else',
    ...ks.map((k) => `        if m${k}_write = '1' and m${k}_have = '0' then m${k}_have <= '1'; m${k}_hold <= m${k}_din; end if;`), '      end if;', '    end if;', '  end process;', 'end behav;', '');
  return L;
}

function verilogWord(name, word, stall) {
  const W = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const ps = wordPorts(word, stall);
  const ks = word.members.map((m, k) => k);
  const bits = (s, m) => (word.w === 1 ? s : m.w === 1 ? `${s}[${m.off}]` : `${s}[${m.off + m.w - 1}:${m.off}]`);
  const ce = stall ? ' && ap_ce' : '';
  const L = [`// a stream of structs of the top, one word (#pragma HLS DATAFLOW): its members' FIFOs, ${word.dir === 'in' ? 'each read once a word' : 'each held until all are written'}`,
    `module ${name} (${ps.map(([n, d, w]) => `${d === 'in' ? 'input' : 'output'} wire ${W(w)}${n}`).join(', ')});`];
  if (word.dir === 'in') {
    L.push(`  reg ${ks.map((k) => `m${k}_taken = 1'b0`).join(', ')};`);
    for (const [k, m] of word.members.entries()) L.push(`  assign m${k}_dout = ${bits('w_dout', m)};`, `  assign m${k}_empty_n = w_empty_n & ~m${k}_taken;`);
    L.push(`  wire w_take = w_empty_n & ${ks.map((k) => `(m${k}_taken | m${k}_read)`).join(' & ')}${ce ? ' & ap_ce' : ''};`, '  assign w_read = w_take;',
      '  always @(posedge ap_clk) begin', `    if (ap_rst) begin ${ks.map((k) => `m${k}_taken <= 1'b0;`).join(' ')} end`, ...(stall ? ['    else if (!ap_ce) ;'] : []),
      `    else if (w_take) begin ${ks.map((k) => `m${k}_taken <= 1'b0;`).join(' ')} end`, `    else begin ${ks.map((k) => `if (m${k}_read && w_empty_n) m${k}_taken <= 1'b1;`).join(' ')} end`, '  end', 'endmodule', '');
    return L;
  }
  L.push(`  reg ${ks.map((k) => `m${k}_have = 1'b0`).join(', ')};`, ...word.members.map((m, k) => `  reg ${W(m.w)}m${k}_hold;`));
  for (const [k, m] of word.members.entries()) L.push(`  wire ${W(m.w)}m${k}_val = m${k}_have ? m${k}_hold : m${k}_din;`, `  assign m${k}_full_n = ~m${k}_have;`);
  // (the bits of a member no process writes: 0)
  const parts = [];
  let at = word.w;
  for (const [k, m] of [...word.members.entries()].sort((a, b) => b[1].off - a[1].off)) {
    if (at > m.off + m.w) parts.push(`${at - m.off - m.w}'d0`);
    parts.push(`m${k}_val`);
    at = m.off;
  }
  if (at > 0) parts.push(`${at}'d0`);
  L.push(`  assign w_din = {${parts.join(', ')}};`, `  wire w_put = ${ks.map((k) => `(m${k}_have | m${k}_write)`).join(' & ')}${ce ? ' & ap_ce' : ''};`, '  assign w_write = w_put;',
    '  always @(posedge ap_clk) begin', `    if (ap_rst) begin ${ks.map((k) => `m${k}_have <= 1'b0;`).join(' ')} end`, ...(stall ? ['    else if (!ap_ce) ;'] : []),
    `    else if (w_put && w_full_n) begin ${ks.map((k) => `m${k}_have <= 1'b0;`).join(' ')} end`, `    else begin ${ks.map((k) => `if (m${k}_write && !m${k}_have) begin m${k}_have <= 1'b1; m${k}_hold <= m${k}_din; end`).join(' ')} end`, '  end', 'endmodule', '');
  return L;
}
