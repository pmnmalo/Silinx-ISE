// Silinx - the test bench of a counterexample of Verify (#3177, core/verify.js): the module verified and its reference
// side by side, the counterexample's inputs applied cycle by cycle and both modules' outputs compared; at the first
// difference it reports each output that differs and stops with "VERIFY FAILED". The simulator replays it, and so shows
// the difference the solver found in the waveform viewer, with nothing taken from the solver but the inputs.
//
// A clock cycle k (from 1), of period CLK_PERIOD, the clock low at its start: its inputs applied, the outputs compared a
// quarter of a period later (their values in that cycle, before the rising edge), the rising edge at half a period.
// Combinational modules (no clock): the inputs applied, the outputs compared 10 ns later.
// The VHDL is VHDL-93, the Verilog Verilog-2001, as the Test Bench Wizard's (core/testbench.js).
// A counterexample of the module's own assertions (core/verify-assert.js, no reference): the module alone, the inputs
// applied in the same way; the module's assertion that fails reports it.

export const PERIOD = 20;
const SETTLE = 10;

/** The name of a counterexample's test bench of module `top`. */
export const benchName = top => `verify_${top}`;

/**
 * The test bench text. r: verifyEquivalence's failed result ({ top, reference, ports, clocks, cycles, cycle }); name:
 * the test bench's (benchName); lang: 'vhdl' | 'verilog' (default: the module's language).
 */
export function counterexampleBench(r, { name = benchName(r.top), lang = r.lang || 'vhdl', about = null, prelude = '', checks = [] } = {}) {
  if (r.status !== 'failed' || !r.cycles?.length) throw new Error('no counterexample to replay');
  const clocks = new Set(r.clocks || []);
  const ins = r.ports.filter(p => p.dir === 'in' && !clocks.has(p.name));
  const outs = r.ports.filter(p => p.dir === 'out');
  const clks = r.ports.filter(p => clocks.has(p.name));
  const fold = s => (lang === 'verilog' ? s : s.toLowerCase());
  const taken = new Set([name, r.top, r.reference, ...r.ports.map(p => p.name)].filter(Boolean).map(fold));
  const own = n => { let m = n; while (taken.has(fold(m))) m = `tb_${m}`; taken.add(fold(m)); return m; };
  const N = Object.fromEntries(['uut', 'reference', 'CLK_PERIOD', 'chr', 'check', 'errors', 'cycle', 'stim'].map(n => [n, own(n)]));
  // the reference's signal of each port: the module's own when both types are written alike, else one of its own
  const same = p => p.dir === 'in' && (lang === 'verilog' || vtype(p.uut) === vtype(p.ref));
  const alone = !r.reference;
  const refName = new Map(alone ? [] : r.ports.map(p => [p.name, same(p) ? p.name : own(`ref_${p.name}`)]));
  const timing = clks.length ? ` (clock ${clks.map(p => p.name).join(', ')}, ${PERIOD} ns: the inputs at the start of a cycle, its rising edge at half the period)` : ' (combinational: an input change every 10 ns)';
  const header = c => (alone ? [
    `${c} Counterexample of Verify (Silinx): ${about || `an assertion of '${r.top}' fails at clock cycle ${r.cycle}`}.`,
    `${c} The module gets the counterexample's inputs, cycle by cycle${timing};`,
    `${c} its assertion that fails reports it.`,
    // (a module of the file's own before the test bench: a drawing's HDL with its property, core/verify-props.js)
    ...(prelude ? ['', prelude.trimEnd()] : []),
  ] : [
    `${c} Counterexample of Verify (Silinx): '${r.top}' differs from its reference '${r.reference}' at clock cycle ${r.cycle}${r.differs?.length ? ` (${r.differs.join(', ')})` : ''}.`,
    `${c} Both modules get the same inputs, cycle by cycle${clks.length ? ` (clock ${clks.map(p => p.name).join(', ')}, ${PERIOD} ns: the inputs at the start of a cycle, the outputs compared before its rising edge)` : ' (combinational: the outputs compared 10 ns after each input change)'};`,
    `${c} the first difference of their outputs is reported, and the simulation stops with VERIFY FAILED.`,
  ]).join('\n');
  return lang === 'verilog' ? verilog() : vhdl();

  function vhdl() {
    const range = p => `(${p.left} ${p.desc ? 'downto' : 'to'} ${p.right})`;
    const lit = (p, b) => (p.kind === 'sl' ? `'${b}'` : p.kind === 'int' ? String(intOf(p, b)) : `"${b}"`);
    // a port's value as bits: a std_logic for one bit, a std_logic_vector for more
    const bits = (p, e) => (p.width === 1 ? (p.kind === 'sl' ? e : p.kind === 'int' ? `to_unsigned(${e}, 1)(0)` : `${e}(${p.right})`)
      : p.kind === 'int' ? `std_logic_vector(to_${p.signedInt ? '' : 'un'}signed(${e}, ${p.width}))` : `std_logic_vector(${e})`);
    const span = p => (p.desc ? Array.from({ length: p.left - p.right + 1 }, (_, i) => p.left - i) : Array.from({ length: p.right - p.left + 1 }, (_, i) => p.left + i));
    const text = (p, e) => (p.kind === 'sl' ? `${N.chr}(${e})` : p.kind === 'int'
      ? Array.from({ length: p.width }, (_, i) => `${N.chr}(to_${p.signedInt ? '' : 'un'}signed(${e}, ${p.width})(${p.width - 1 - i}))`).join(' & ')
      : span(p).map(i => `${N.chr}(${e}(${i}))`).join(' & '));
    // the reference's input from the module's (types written differently): through their bits
    const conv = p => {
      const b = bits(p.uut, p.name), q = p.ref;
      if (q.kind === 'sl') return `  ${refName.get(p.name)} <= ${b};`;
      if (p.width === 1 && q.kind !== 'int') return `  ${refName.get(p.name)}(${q.right}) <= ${b};`;
      const v = p.width === 1 ? `(0 => ${b})` : b;
      return `  ${refName.get(p.name)} <= ${q.kind === 'slv' ? v : q.kind === 'int' ? `to_integer(${q.signedInt ? '' : 'un'}signed(std_logic_vector'(${v})))` : `${q.kind}(${v})`};`;
    };
    const L = [header('--'), '', 'library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '',
      `entity ${name} is`, `end ${name};`, '', `architecture test of ${name} is`, ''];
    for (const p of r.ports) {
      L.push(`  signal ${p.name} : ${vtype(p.uut, range)}${p.dir === 'in' ? init(p.uut) : ''};`);
      if (!alone && refName.get(p.name) !== p.name) L.push(`  signal ${refName.get(p.name)} : ${vtype(p.ref, range)};`);
    }
    if (clks.length) L.push(`  constant ${N.CLK_PERIOD} : time := ${PERIOD} ns;`);
    L.push('', '  -- a bit as a character (VHDL-93 has no to_string)',
      `  function ${N.chr}(b : std_logic) return character is`, '  begin',
      "    case b is when '0' => return '0'; when '1' => return '1'; when 'Z' => return 'Z'; when 'U' => return 'U'; when '-' => return '-'; when others => return 'X'; end case;",
      '  end function;', '', 'begin', '',
      `  ${N.uut} : entity work.${r.top}`, `    port map (${r.ports.map(p => `${p.name} => ${p.name}`).join(', ')});`);
    if (alone) return vhdlAlone(L);
    L.push(`  ${N.reference} : entity work.${r.reference}`, `    port map (${r.ports.map(p => `${p.name} => ${refName.get(p.name)}`).join(', ')});`);
    const convs = r.ports.filter(p => p.dir === 'in' && refName.get(p.name) !== p.name).map(conv);
    if (convs.length) L.push('  -- the reference\'s inputs (its ports\' types)', ...convs);
    L.push('', `  ${N.stim} : process`, `    variable ${N.errors} : integer := 0;`,
      `    -- the outputs of both modules compared: each difference reported`,
      `    procedure ${N.check}(${N.cycle} : integer) is`, '    begin');
    for (const p of outs) {
      L.push(`      if ${bits(p.uut, p.name)} /= ${bits(p.ref, refName.get(p.name))} then`,
        `        report "clock cycle " & integer'image(${N.cycle}) & ": ${p.name} = " & ${text(p.uut, p.name)} & ", the reference's ${p.name} = " & ${text(p.ref, refName.get(p.name))} severity error;`,
        `        ${N.errors} := ${N.errors} + 1;`, '      end if;');
    }
    L.push('      if ' + N.errors + ' > 0 then',
      `        report "VERIFY FAILED: '${r.top}' differs from its reference '${r.reference}' at clock cycle " & integer'image(${N.cycle}) severity failure;`,
      '      end if;', '    end procedure;', '  begin');
    r.cycles.forEach((c, i) => {
      L.push(`    -- clock cycle ${i + 1}`);
      for (const p of clks) L.push(`    ${p.name} <= '0';`);
      for (const p of ins) L.push(`    ${p.name} <= ${lit(p.uut, bitsOf(c, p))};`);
      if (clks.length) {
        L.push(`    wait for ${N.CLK_PERIOD} / 4;`, `    ${N.check}(${i + 1});`, ...clks.map(p => `    ${p.name} <= '1';`),
          `    wait for ${N.CLK_PERIOD} / 2;`, ...clks.map(p => `    ${p.name} <= '0';`), `    wait for ${N.CLK_PERIOD} / 4;`);
      } else L.push(`    wait for ${SETTLE} ns;`, `    ${N.check}(${i + 1});`);
    });
    L.push(`    report "VERIFY: no difference in ${r.cycles.length} clock cycle(s): the simulation does not show the counterexample" severity warning;`,
      '    wait;', '  end process;', '', 'end test;', '');
    return L.join('\n');
  }

  // the module alone: the inputs of each cycle, its own assertions checking it
  function vhdlAlone(L) {
    const lit = (p, b) => (p.kind === 'sl' ? `'${b}'` : p.kind === 'int' ? String(intOf(p, b)) : `"${b}"`);
    // (checks: concurrent statements of the bench's own, on its signals)
    if (checks.length) L.push('', ...checks.map(c => `  ${c}`));
    L.push('', `  ${N.stim} : process`, '  begin');
    r.cycles.forEach((c, i) => {
      L.push(`    -- clock cycle ${i + 1}`);
      for (const p of clks) L.push(`    ${p.name} <= '0';`);
      for (const p of ins) L.push(`    ${p.name} <= ${lit(p.uut, bitsOf(c, p))};`);
      if (clks.length) L.push(`    wait for ${N.CLK_PERIOD} / 2;`, ...clks.map(p => `    ${p.name} <= '1';`), `    wait for ${N.CLK_PERIOD} / 2;`);
      else L.push(`    wait for ${SETTLE} ns;`);
    });
    L.push(`    report "VERIFY: ${r.cycles.length} clock cycle(s) replayed" severity note;`, '    wait;', '  end process;', '', 'end test;', '');
    return L.join('\n');
  }

  function verilog() {
    const decl = p => `${p.width > 1 ? ` [${p.width - 1}:0]` : ''}`;
    const L = [header('//'), '', '`timescale 1ns / 1ps', '', `module ${name};`, ''];
    for (const p of r.ports) {
      if (p.dir === 'in') L.push(`  reg${decl(p)} ${p.name} = 0;`);
      else L.push(`  wire${decl(p)} ${p.name};`, ...(alone ? [] : [`  wire${decl(p)} ${refName.get(p.name)};`]));
    }
    if (clks.length) L.push(`  localparam ${N.CLK_PERIOD} = ${PERIOD};`);
    if (alone) return verilogAlone(L);
    L.push(`  integer ${N.errors} = 0;`, '',
      `  ${r.top} ${N.uut} (${r.ports.map(p => `.${p.name}(${p.name})`).join(', ')});`,
      `  ${r.reference} ${N.reference} (${r.ports.map(p => `.${p.name}(${refName.get(p.name)})`).join(', ')});`, '',
      '  // the outputs of both modules compared: each difference reported',
      `  task ${N.check}(input integer ${N.cycle});`, '  begin');
    for (const p of outs) {
      L.push(`    if (${p.name} !== ${refName.get(p.name)}) begin`,
        `      $display("clock cycle %0d: ${p.name} = %b, the reference's ${p.name} = %b", ${N.cycle}, ${p.name}, ${refName.get(p.name)});`,
        `      ${N.errors} = ${N.errors} + 1;`, '    end');
    }
    L.push(`    if (${N.errors} > 0) begin`,
      `      $display("VERIFY FAILED: '${r.top}' differs from its reference '${r.reference}' at clock cycle %0d", ${N.cycle});`,
      '      $finish;', '    end', '  end', '  endtask', '', '  initial begin');
    r.cycles.forEach((c, i) => {
      L.push(`    // clock cycle ${i + 1}`);
      for (const p of clks) L.push(`    ${p.name} = 0;`);
      for (const p of ins) L.push(`    ${p.name} = ${p.width}'b${bitsOf(c, p)};`);
      if (clks.length) L.push(`    #(${N.CLK_PERIOD} / 4) ${N.check}(${i + 1});`, ...clks.map(p => `    ${p.name} = 1;`),
        `    #(${N.CLK_PERIOD} / 2);`, ...clks.map(p => `    ${p.name} = 0;`), `    #(${N.CLK_PERIOD} / 4);`);
      else L.push(`    #${SETTLE} ${N.check}(${i + 1});`);
    });
    L.push(`    $display("VERIFY: no difference in ${r.cycles.length} clock cycle(s): the simulation does not show the counterexample");`,
      '    $finish;', '  end', '', 'endmodule', '');
    return L.join('\n');
  }
  function verilogAlone(L) {
    L.push('', `  ${r.top} ${N.uut} (${r.ports.map(p => `.${p.name}(${p.name})`).join(', ')});`, ...checks.map(c => `  ${c}`), '', '  initial begin');
    r.cycles.forEach((c, i) => {
      L.push(`    // clock cycle ${i + 1}`);
      for (const p of clks) L.push(`    ${p.name} = 0;`);
      for (const p of ins) L.push(`    ${p.name} = ${p.width}'b${bitsOf(c, p)};`);
      if (clks.length) L.push(`    #(${N.CLK_PERIOD} / 2);`, ...clks.map(p => `    ${p.name} = 1;`), `    #(${N.CLK_PERIOD} / 2);`);
      else L.push(`    #${SETTLE};`);
    });
    L.push(`    $display("VERIFY: ${r.cycles.length} clock cycle(s) replayed");`, '    $finish;', '  end', '', 'endmodule', '');
    return L.join('\n');
  }
}

// a port's VHDL type (range: its index range's text)
function vtype(p, range = q => `(${q.left} ${q.desc ? 'downto' : 'to'} ${q.right})`) {
  return { sl: 'std_logic', slv: `std_logic_vector${range(p)}`, unsigned: `unsigned${range(p)}`, signed: `signed${range(p)}`, int: 'integer' }[p.kind];
}
const init = p => (p.kind === 'sl' ? " := '0'" : p.kind === 'int' ? ' := 0' : " := (others => '0')");
// an input's bits in cycle c (MSB first; a bit the solver left free, 0)
const bitsOf = (c, p) => (c.in[p.name] ?? '').replace(/[^01]/g, '0').padStart(p.width, '0').slice(-p.width);
// an integer port's value of bits b
function intOf(p, b) {
  const v = BigInt(`0b${b}`);
  return String(p.signedInt && b[0] === '1' ? v - (1n << BigInt(b.length)) : v);
}
