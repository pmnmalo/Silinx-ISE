// Silinx - self-checking test bench generator (Test Bench Wizard).
//
// A test bench applies a list of input vectors to the Unit Under Test and compares its outputs
// with the expected values of each vector (bits '-' / blank = not checked). Combinational designs:
// apply, wait a settling time, check. Sequential designs (a clock port): inputs change at the
// falling edge of the clock, the design reacts at the rising edge, outputs are checked at the next
// falling edge. Each mismatch is reported with the vector number, the inputs, the expected and the
// actual outputs; the run ends with "TEST PASSED" or "TEST FAILED" and stops.
// Bidirectional (inout) ports: the bench declares a resolved signal (VHDL std_logic /
// std_logic_vector, Verilog wire) and, per vector, either DRIVES it (a value, like an input) or
// RELEASES it ('Z') so that the design can drive it; the value on the bus is then checked like
// an output (its expected value, '-' = not checked).
// The generated VHDL is VHDL-93 (it also runs in Xilinx ISim); the Verilog is Verilog-2001.

export const MAX_VECTORS = 4096;

// ------------------------------------------------------------------ ports
const CLOCK_RE = /^(clk|clock|clk_?\w*|\w*_clk|mclk|sysclk)$/i;
const RESET_RE = /^(rst|reset|rst_?n|resetn|rst_\w+|\w*_rst|clr|clear)$/i;

/**
 * Ports of the elaborated top `design.top` as the generator sees them:
 * { name, dir, width, left, right, kind: 'sl'|'slv'|'unsigned'|'signed'|'int'|'other', bus }.
 * `typeTexts` (optional): VHDL type text of each port by name (from the source), which tells
 * std_logic_vector / unsigned / signed / integer apart.
 */
export function tbPorts(design, typeTexts = {}) {
  return design.top.ports.map(p => {
    const t = p.sig.t;
    const tt = String(typeTexts[p.name] || typeTexts[p.name.toLowerCase()] || '').toLowerCase().replace(/\s+/g, '');
    const bus = t.kind === 'logic' && !(t.w === 1 && t.scalar);
    let kind;
    if (t.kind === 'int') kind = 'int';
    else if (t.kind !== 'logic') kind = 'other';
    else if (!bus) kind = 'sl';
    else if (/^unsigned/.test(tt)) kind = 'unsigned';
    else if (/^signed/.test(tt)) kind = 'signed';
    else kind = 'slv';
    const width = kind === 'int' ? Math.min(32, Math.max(1, t.w || 32)) : t.w;
    const left = bus ? t.left : null, right = bus ? t.right : null;
    return { name: p.name, dir: p.dir, width, left, right, desc: t.desc !== false, kind, bus };
  });
}

/** Guess the clock and reset ports: { clock: name|null, reset: name|null, resetActive: '1'|'0' }. */
export function guessClockReset(ports, clockSigs = new Set()) {
  const ins = ports.filter(p => p.dir === 'in' && p.kind === 'sl');
  const clock = ins.find(p => clockSigs.has(p.name)) || ins.find(p => CLOCK_RE.test(p.name));
  const reset = ins.find(p => p !== clock && RESET_RE.test(p.name));
  return { clock: clock?.name || null, reset: reset?.name || null, resetActive: reset && /(_n|n)$/i.test(reset.name) && !/^(rst|reset)$/i.test(reset.name) ? '0' : '1' };
}

// ------------------------------------------------------------------ values
/**
 * Bits (MSB first, `width` characters of 0 1 - ) of a value typed in the vector table:
 * binary "0101" (shorter: zero-extended; '-', 'x' or 'X' = don't care), hex "0x1F" / "h1F",
 * decimal "d12" / "#12" / "12" (plain digits with a 2-9 in them: "10" is binary), or a negative
 * decimal "-3" (two's complement). "" -> null (not checked).
 * Throws on a value that does not fit or cannot be read.
 */
export function parseValue(text, width) {
  let s = String(text ?? '').trim().replace(/_/g, '');
  if (!s) return null;
  let bits;
  let m;
  // every bit given, with a don't care ("-000": how the table shows a value read back with an X / Z
  // bit): binary, not a negative decimal
  if (/^[01xX-]+$/.test(s) && /[xX-]/.test(s) && s.length === width) bits = s.replace(/[xX]/g, '-');
  else if ((m = /^(?:0x|h|x")?([0-9a-f]+)"?$/i.exec(s)) && /^(0x|h|x")/i.test(s)) bits = BigInt(`0x${m[1]}`).toString(2);
  else if ((m = /^(?:d|#)(-?\d+)$/i.exec(s)) || (m = /^(-\d+)$/.exec(s))) {
    let v = BigInt(m[1]);
    if (v < 0n) { if (-v > 1n << BigInt(width - 1)) throw new Error(`${s} does not fit in ${width} bit(s)`); v += 1n << BigInt(width); }
    bits = v.toString(2);
  } else if (/^[01xX-]+$/.test(s)) bits = s.replace(/[xX]/g, '-');
  else if (/^\d+$/.test(s)) bits = BigInt(s).toString(2);   // plain decimal (has a digit 2-9: not binary)
  else throw new Error(`cannot read '${text}' (binary 0101, hex 0x1F, decimal d12 or 12)`);
  if (bits.length > width) {
    const extra = bits.slice(0, bits.length - width);
    if (/[1-]/.test(extra)) throw new Error(`'${text}' does not fit in ${width} bit(s)`);
    bits = bits.slice(bits.length - width);
  }
  return bits.padStart(width, '0');
}

/**
 * Bits (MSB first, `width` characters of 0 1 Z) the bench drives on a bidirectional port:
 * "" or "Z" -> all Z (released: the design may drive the bus); binary with Z digits ("ZZ01", a
 * shorter value is extended with 0, or with Z when it starts with Z); hex / decimal as parseValue().
 */
export function parseDrive(text, width) {
  const s = String(text ?? '').trim().replace(/_/g, '');
  if (!s || /^z+$/i.test(s)) return 'Z'.repeat(width);
  if (/^[01zZ]+$/.test(s) && /z/i.test(s)) {
    const b = s.toUpperCase();
    if (b.length > width) {
      if (/[1Z]/.test(b.slice(0, b.length - width))) throw new Error(`'${text}' does not fit in ${width} bit(s)`);
      return b.slice(b.length - width);
    }
    return b.padStart(width, b[0] === 'Z' ? 'Z' : '0');
  }
  const bits = parseValue(s, width);
  if (/-/.test(bits)) throw new Error(`'${text}': a driven bit cannot be '-' (Z releases the bus)`);
  return bits;
}

/** Display of bits in the table: binary up to 16 bits, hex above (with '-' digits kept binary). */
export function showValue(bits, width) {
  if (bits == null) return '';
  if (width <= 16 || /-/.test(bits)) return bits;
  return `0x${BigInt(`0b${bits}`).toString(16).toUpperCase().padStart(Math.ceil(width / 4), '0')}`;
}

// ------------------------------------------------------------------ stimulus
function rng(seed) {
  let x = (seed >>> 0) || 0x9e3779b9;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
}

/**
 * Input vectors: [{ in: { port: bits }, drv?: { port: bits } }].
 *   mode 'exhaustive': every combination of all input bits (first input = most significant)
 *   mode 'count': `count` consecutive values counting from 0 (all inputs as one number)
 *   mode 'random': `count` random vectors (seed)
 *   mode 'walking': all 0, all 1, then a walking 1 and a walking 0 over all input bits
 * Bidirectional ports (dir 'inout') among `inputs`: the stimulus drives them like inputs (their
 * bits are part of the combinations, in `drv`), and every such "drive" vector is followed by a
 * "read" vector with the same inputs and the bidirectional ports released (all Z), so that the
 * design can drive the bus and its value is checked (count / random: `count` vectors in all).
 */
export function makeVectors(inputs, opts = {}) {
  const ios = inputs.filter(p => p.dir === 'inout');
  if (!ios.length) return makeInVectors(inputs, opts);
  const { mode = 'exhaustive', count = 16 } = opts;
  const total = inputs.reduce((n, p) => n + p.width, 0);
  if (mode === 'exhaustive' && 2 ** (total + 1) > MAX_VECTORS) throw new Error(`${total} input and bidirectional bits give ${2 ** (total + 1)} vectors with the read vectors (more than ${MAX_VECTORS}): use random vectors`);
  const half = ['count', 'random'].includes(mode) ? { ...opts, count: Math.ceil(Math.max(1, count | 0) / 2) } : opts;
  const out = [];
  for (const v of makeInVectors(inputs, half)) {
    const inp = {}, drv = {}, rel = {};
    for (const p of inputs) {
      if (p.dir === 'inout') { drv[p.name] = v.in[p.name]; rel[p.name] = 'Z'.repeat(p.width); } else inp[p.name] = v.in[p.name];
    }
    out.push({ in: inp, drv }, { in: { ...inp }, drv: rel });
  }
  const n = ['count', 'random'].includes(mode) ? Math.max(1, Math.min(MAX_VECTORS, count | 0)) : MAX_VECTORS;
  return out.slice(0, n);
}

function makeInVectors(inputs, { mode = 'exhaustive', count = 16, seed = 1 } = {}) {
  const total = inputs.reduce((n, p) => n + p.width, 0);
  const split = (bits) => {
    const o = {};
    let k = 0;
    for (const p of inputs) { o[p.name] = bits.slice(k, k + p.width); k += p.width; }
    return { in: o };
  };
  const num = (v) => v.toString(2).padStart(total, '0').slice(-total);
  if (!total) return mode === 'exhaustive' || mode === 'walking' ? [split('')] : Array.from({ length: Math.max(1, count) }, () => split(''));
  if (mode === 'exhaustive') {
    if (total > Math.log2(MAX_VECTORS)) throw new Error(`${total} input bits give ${2 ** total} combinations (more than ${MAX_VECTORS}): use random vectors`);
    return Array.from({ length: 2 ** total }, (_, i) => split(num(BigInt(i))));
  }
  const n = Math.max(1, Math.min(MAX_VECTORS, count | 0));
  if (mode === 'count') return Array.from({ length: n }, (_, i) => split(num(BigInt(i))));
  if (mode === 'random') {
    const r = rng(seed);
    return Array.from({ length: n }, () => split(Array.from({ length: total }, () => (r() & 1 ? '1' : '0')).join('')));
  }
  if (mode === 'walking') {
    const out = [split('0'.repeat(total)), split('1'.repeat(total))];
    for (let i = 0; i < total; i++) out.push(split('0'.repeat(i) + '1' + '0'.repeat(total - i - 1)));
    for (let i = 0; i < total; i++) out.push(split('1'.repeat(i) + '0' + '1'.repeat(total - i - 1)));
    return out.slice(0, MAX_VECTORS);
  }
  throw new Error(`unknown stimulus mode '${mode}'`);
}

// ------------------------------------------------------------------ generation
const ident = (s) => /^[A-Za-z][A-Za-z0-9_]*$/.test(s);

/**
 * The test bench text.
 *   opts: { name, lang: 'vhdl'|'verilog', uut: { name, params: [{ name, value }] }, ports (tbPorts),
 *           clock: { port, periodNs } | null, reset: { port, active: '1'|'0', cycles } | null,
 *           vectors: [{ in: { port: bits }, drv: { port: bits of 0 1 Z }, exp: { port: bits|null } }],
 *           settleNs, trace }
 * `drv` (bidirectional ports): the bits the bench drives on the bus, Z = released (missing: all Z);
 * `exp` holds the expected values of the outputs and of the bidirectional ports (the bus).
 * `trace`: also print every vector's outputs (then the bidirectional buses) as "@TB <k> <bits>"
 * (used to fill in the expected values from a simulation of the current design).
 */
export function generateTestbench(opts) {
  const { name, lang = 'vhdl', uut, ports, clock = null, reset = null, vectors, settleNs = 10, trace = false } = opts;
  if (!ident(name)) throw new Error(`invalid test bench name '${name}'`);
  if (!vectors?.length) throw new Error('no vectors');
  if (vectors.length > MAX_VECTORS) throw new Error(`too many vectors (${vectors.length}, at most ${MAX_VECTORS})`);
  const bad = ports.filter(p => p.kind === 'other');
  if (bad.length) throw new Error(`port(s) of a type the wizard cannot drive: ${bad.map(p => p.name).join(', ')}`);
  const badIo = ports.filter(p => p.dir === 'inout' && !['sl', 'slv', 'unsigned', 'signed'].includes(p.kind));
  if (badIo.length) throw new Error(`bidirectional port(s) of a type the wizard cannot drive (std_logic / vectors only): ${badIo.map(p => p.name).join(', ')}`);
  const special = new Set([clock?.port, reset?.port].filter(Boolean).map(s => s.toLowerCase()));
  const ins = ports.filter(p => p.dir === 'in' && !special.has(p.name.toLowerCase()));
  const ios = ports.filter(p => p.dir === 'inout');            // bidirectional: driven / released, then read
  const outs = ports.filter(p => p.dir === 'out');
  const chk = [...outs, ...ios];                               // checked: the outputs, then the buses
  const NIN = Math.max(1, ins.reduce((n, p) => n + p.width, 0));
  const NIO = Math.max(1, ios.reduce((n, p) => n + p.width, 0));
  const NOUT = Math.max(1, chk.reduce((n, p) => n + p.width, 0));
  const inBits = vectors.map(v => (ins.length ? ins.map(p => v.in?.[p.name] ?? '0'.repeat(p.width)).join('') : '0'));
  const drvBits = vectors.map(v => (ios.length ? ios.map(p => String(v.drv?.[p.name] ?? 'Z'.repeat(p.width)).toUpperCase()).join('') : 'Z'));
  const expBits = vectors.map(v => (chk.length ? chk.map(p => v.exp?.[p.name] ?? '-'.repeat(p.width)).join('') : '-'));
  for (const [k, b] of inBits.entries()) if (b.length !== NIN || !/^[01]+$/.test(b)) throw new Error(`vector ${k}: inputs must be 0/1 bits (${b})`);
  for (const [k, b] of drvBits.entries()) if (b.length !== NIO || !/^[01Z]+$/.test(b)) throw new Error(`vector ${k}: bidirectional ports must be 0/1/Z bits (${b})`);
  for (const [k, b] of expBits.entries()) if (b.length !== NOUT || !/^[01-]+$/.test(b)) throw new Error(`vector ${k}: bad expected bits (${b})`);
  const checked = expBits.some(b => /[01]/.test(b));
  const period = clock ? Math.max(2, Math.round(clock.periodNs || 20)) : 0;
  const settle = Math.max(1, Math.round(settleNs || 10));
  const header = (c) => [
    `${c} Test bench for '${uut.name}', generated by the Silinx Test Bench Wizard.`,
    `${c} ${vectors.length} vector(s)${clock ? `, clock ${clock.port} (${period} ns): inputs change at the falling edge, outputs checked at the next falling edge` : `, combinational: outputs checked ${settle} ns after each input change`}.`,
    `${c} ${checked ? 'Expected values: bits - are not checked.' : 'No expected values: the outputs are only reported.'} Ends with TEST PASSED / TEST FAILED.`,
    ...(ios.length ? [`${c} Bidirectional port(s) ${ios.map(p => p.name).join(', ')}: in each vector the bench drives the bus (a value) or releases it`,
      `${c} (Z, the design may drive it); the value on the bus is checked like an output.`] : []),
  ].join('\n');
  return lang === 'verilog' ? verilogTb() : vhdlTb();

  // ---------------------------------------------------------------- VHDL
  function vhdlTb() {
    const range = (p) => `(${p.left} ${p.desc ? 'downto' : 'to'} ${p.right})`;
    const vtype = (p) => ({ sl: 'std_logic', slv: `std_logic_vector${range(p)}`, unsigned: `unsigned${range(p)}`, signed: `signed${range(p)}`, int: 'integer' })[p.kind];
    const init = (p) => (p.kind === 'sl' ? " := '0'" : p.kind === 'int' ? ' := 0' : " := (others => '0')");
    // slice of a vector variable (MSB first, `at` = offset of the port's first bit) for a port
    const slice = (v, p, at, N) => (p.width === 1 && p.kind === 'sl' ? `${v}(${N - 1 - at})` : `${v}(${N - 1 - at} downto ${N - p.width - at})`);
    const fromBits = (p, s) => ({ sl: s, slv: s, unsigned: `unsigned(${s})`, signed: `signed(${s})`, int: `to_integer(unsigned(${s}))` })[p.kind];
    const toBits = (p) => ({ sl: p.name, slv: `std_logic_vector(${p.name})`, unsigned: `std_logic_vector(${p.name})`, signed: `std_logic_vector(${p.name})`, int: `std_logic_vector(to_unsigned(${p.name}, ${p.width}))` })[p.kind];
    const lit = (b) => (b.length === 1 ? `"${b}"` : `"${b}"`);
    const table = (nm, arr) => arr.map((b, k) => `    ${k} => ${lit(b)}`).join(',\n');
    let at = 0;
    const apply = ins.map(p => { const s = `      ${p.name} <= ${fromBits(p, slice('VIN(k)', p, at, NIN))};`; at += p.width; return s; });
    at = 0;
    const applyIo = ios.map(p => { const s = `      ${p.name} <= ${fromBits(p, slice('VDRV(k)', p, at, NIO))};   -- drive the bus (Z = release it)`; at += p.width; return s; });
    // text of the bits of a port / vector variable, one chr() per bit (no sized string variable)
    const bitsOf = (expr, idx) => idx.map(i => `chr(${expr}(${i}))`).join(' & ');
    const span = (hi, lo) => Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);
    const portText = (p) => {
      if (p.kind === 'sl') return `chr(${p.name})`;
      if (p.kind === 'int') return bitsOf(`to_unsigned(${p.name}, ${p.width})`, span(p.width - 1, 0));
      const idx = p.desc ? span(p.left, p.right) : Array.from({ length: p.right - p.left + 1 }, (_, i) => p.left + i);
      return bitsOf(p.name, idx);
    };
    const report = (ps) => ps.map(p => `" ${p.name}=" & ${portText(p)}`).join(' & ') || '""';
    const vecText = (v, n) => bitsOf(v, span(n - 1, 0));
    at = 0;
    const ioText = ios.map(p => { const idx = p.kind === 'sl' ? [NIO - 1 - at] : span(NIO - 1 - at, NIO - p.width - at); at += p.width; return `" ${p.name}:drive=" & ${bitsOf('VDRV(k)', idx)}`; });
    const L = [];
    L.push(header('--'), '', 'library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '',
      `entity ${name} is`, `end ${name};`, '', `architecture test of ${name} is`, '');
    for (const p of ports) {
      if (p.dir === 'inout') L.push(`  signal ${p.name} : ${vtype(p)} := ${p.kind === 'sl' ? "'Z'" : "(others => 'Z')"};   -- bidirectional: the bench drives it or releases it ('Z')`);
      else L.push(`  signal ${p.name} : ${vtype(p)}${p.dir === 'in' ? init(p) : ''};`);
    }
    L.push('', `  constant NV : integer := ${vectors.length};`);
    if (clock) L.push(`  constant CLK_PERIOD : time := ${period} ns;`);
    L.push(`  type vin_t is array (0 to NV - 1) of std_logic_vector(${NIN - 1} downto 0);`,
      `  type vout_t is array (0 to NV - 1) of std_logic_vector(${NOUT - 1} downto 0);`,
      '  -- inputs of each vector' + (ins.length ? `: ${ins.map(p => `${p.name}(${p.width})`).join(' & ')}` : ' (none)'),
      `  constant VIN : vin_t := (\n${table('VIN', inBits)}\n  );`,
      ...(ios.length ? [`  type vdrv_t is array (0 to NV - 1) of std_logic_vector(${NIO - 1} downto 0);`,
        `  -- what the bench drives on the bidirectional port(s) ${ios.map(p => `${p.name}(${p.width})`).join(' & ')}: 'Z' = released (the design may drive it)`,
        `  constant VDRV : vdrv_t := (\n${table('VDRV', drvBits)}\n  );`] : []),
      '  -- expected outputs' + (chk.length ? `: ${chk.map(p => `${p.name}(${p.width})`).join(' & ')}` : ' (none)'),
      `  constant VEXP : vout_t := (\n${table('VEXP', expBits.map(b => b.replace(/-/g, '0')))}\n  );`,
      "  -- bits checked ('1') of each vector: a '0' bit is not checked",
      `  constant VMASK : vout_t := (\n${table('VMASK', expBits.map(b => b.replace(/[01]/g, '1').replace(/-/g, '0')))}\n  );`,
      `  constant ZERO : std_logic_vector(${NOUT - 1} downto 0) := (others => '0');`,
      '  signal done : boolean := false;', '',
      '  -- a bit as a character (VHDL-93 has no to_string)',
      '  function chr(b : std_logic) return character is',
      '  begin',
      "    case b is when '0' => return '0'; when '1' => return '1'; when 'Z' => return 'Z'; when 'U' => return 'U'; when '-' => return '-'; when others => return 'X'; end case;",
      '  end function;',
      '  -- an expected bit as a character: - when it is not checked',
      '  function ech(e, m : std_logic) return character is',
      '  begin',
      "    if m = '1' then return chr(e); else return '-'; end if;",
      '  end function;',
      '', 'begin', '',
      `  uut : entity work.${uut.name}${uut.params?.length ? `\n    generic map (${uut.params.map(g => `${g.name} => ${g.value}`).join(', ')})` : ''}`,
      `    port map (${ports.map(p => `${p.name} => ${p.name}`).join(', ')});`, '');
    if (clock) L.push(`  -- clock ${clock.port}: runs until the end of the test`,
      '  clk_gen : process', '  begin',
      '    while not done loop',
      `      ${clock.port} <= '0'; wait for CLK_PERIOD / 2;`,
      `      ${clock.port} <= '1'; wait for CLK_PERIOD / 2;`,
      '    end loop;', '    wait;', '  end process;', '');
    L.push('  stim : process',
      `    variable got : std_logic_vector(${NOUT - 1} downto 0);`,
      '    variable errors : integer := 0;',
      '  begin');
    if (reset) {
      const act = reset.active === '0' ? '0' : '1', inact = act === '1' ? '0' : '1';
      L.push(`    -- reset ${reset.port} active for ${reset.cycles || 2} ${clock ? 'clock cycle(s)' : 'x 10 ns'}`,
        `    ${reset.port} <= '${act}';`,
        clock ? `    for i in 1 to ${reset.cycles || 2} loop wait until falling_edge(${clock.port}); end loop;` : `    wait for ${10 * (reset.cycles || 2)} ns;`,
        `    ${reset.port} <= '${inact}';`);
    } else if (clock) L.push(`    wait until falling_edge(${clock.port});`);
    L.push('    for k in 0 to NV - 1 loop', ...apply, ...applyIo,
      clock ? `      wait until falling_edge(${clock.port});` : `      wait for ${settle} ns;`,
      `      got := ${chk.length ? chk.map(toBits).join(' & ') : '"-"'};`);
    if (trace) L.push(`      report "@TB " & integer'image(k) & " " & ${vecText('got', NOUT)};`);
    L.push('      if ((got xor VEXP(k)) and VMASK(k)) /= ZERO then',
      '        errors := errors + 1;',
      `        report "vector " & integer'image(k) & ":" & ${[report(ins), ...ioText].join(' & ')} & " -> expected " & ${span(NOUT - 1, 0).map(i => `ech(VEXP(k)(${i}), VMASK(k)(${i}))`).join(' & ')} & ", got " & ${vecText('got', NOUT)} severity error;`,
      '      end if;',
      '    end loop;',
      '    if errors = 0 then',
      `      report "TEST PASSED: " & integer'image(NV) & " vector(s)${checked ? '' : ' (no expected values)'}" severity note;`,
      '    else',
      '      report "TEST FAILED: " & integer\'image(errors) & " of " & integer\'image(NV) & " vector(s) wrong" severity error;',
      '    end if;',
      '    done <= true;',
      '    wait;',
      '  end process;', '', 'end test;', '');
    return L.join('\n');
  }

  // ---------------------------------------------------------------- Verilog
  function verilogTb() {
    const decl = (p) => `${p.kind === 'signed' ? ' signed' : ''}${p.bus || p.width > 1 ? ` [${p.left ?? p.width - 1}:${p.right ?? 0}]` : ''}`;
    const vlit = (b) => `${b.length}'b${b.replace(/-/g, 'x')}`;
    const mask = (b) => `${b.length}'b${b.replace(/[01]/g, '1').replace(/-/g, '0')}`;
    let at = 0;
    const apply = ins.map(p => { const hi = NIN - 1 - at, lo = NIN - p.width - at; at += p.width; return `      ${p.name} = cur_in[${hi}${p.width > 1 || p.bus ? `:${lo}` : ''}];`; });
    const taken = new Set(ports.map(p => p.name));
    const drvName = p => { let n = `${p.name}_drv`; while (taken.has(n)) n += '_'; taken.add(n); return n; };
    const drv = new Map(ios.map(p => [p.name, drvName(p)]));
    at = 0;
    const applyIo = ios.map(p => { const hi = NIO - 1 - at, lo = NIO - p.width - at; at += p.width; return `      ${drv.get(p.name)} = cur_drv[${hi}${p.width > 1 || p.bus ? `:${lo}` : ''}];   // drive the bus (z = release it)`; });
    const fmt = ins.map(p => ` ${p.name}=%b`).join('') + ios.map(p => ` ${p.name}:drive=%b`).join('');
    const L = [];
    L.push(header('//'), '', '`timescale 1ns / 1ps', '', `module ${name};`, '');
    for (const p of ports) {
      if (p.dir === 'in') L.push(`  reg${decl(p)} ${p.name} = 0;`);
      else if (p.dir === 'inout') {
        L.push(`  // bidirectional port ${p.name}: the bench drives it with ${drv.get(p.name)}; z releases the bus (the design may drive it)`,
          `  reg${decl(p)} ${drv.get(p.name)} = ${p.width}'bz;`, `  wire${decl(p)} ${p.name};`, `  assign ${p.name} = ${drv.get(p.name)};`);
      } else L.push(`  wire${decl(p)} ${p.name};`);
    }
    L.push('', `  localparam NV = ${vectors.length};`);
    if (clock) L.push(`  localparam CLK_PERIOD = ${period};`);
    L.push(`  reg [${NIN - 1}:0] vin [0:NV-1];    // inputs${ins.length ? `: {${ins.map(p => p.name).join(', ')}}` : ' (none)'}`,
      ...(ios.length ? [`  reg [${NIO - 1}:0] vdrv [0:NV-1];   // driven on {${ios.map(p => p.name).join(', ')}}, z = released`, `  reg [${NIO - 1}:0] cur_drv;`] : []),
      `  reg [${NOUT - 1}:0] vexp [0:NV-1];   // expected outputs${chk.length ? `: {${chk.map(p => p.name).join(', ')}}` : ' (none)'}, x = not checked`,
      `  reg [${NOUT - 1}:0] vmask [0:NV-1];  // 1 = bit checked`,
      `  reg [${NIN - 1}:0] cur_in;`, `  reg [${NOUT - 1}:0] got;`, '  integer k, errors;', '',
      `  ${uut.name}${uut.params?.length ? ` #(${uut.params.map(g => `.${g.name}(${g.value})`).join(', ')})` : ''} uut (${ports.map(p => `.${p.name}(${p.name})`).join(', ')});`, '');
    if (clock) L.push(`  always #(CLK_PERIOD / 2) ${clock.port} = ~${clock.port};`, '');
    L.push('  initial begin');
    vectors.forEach((_, k) => L.push(`    vin[${k}] = ${vlit(inBits[k])};${ios.length ? ` vdrv[${k}] = ${drvBits[k].length}'b${drvBits[k].toLowerCase()};` : ''} vexp[${k}] = ${vlit(expBits[k])}; vmask[${k}] = ${mask(expBits[k])};`));
    L.push('  end', '', '  initial begin', '    errors = 0;');
    if (reset) {
      const act = reset.active === '0' ? 0 : 1;
      L.push(`    // reset ${reset.port} active for ${reset.cycles || 2} ${clock ? 'clock cycle(s)' : 'x 10 ns'}`,
        `    ${reset.port} = ${act};`,
        clock ? `    repeat (${reset.cycles || 2}) @(negedge ${clock.port});` : `    #${10 * (reset.cycles || 2)};`,
        `    ${reset.port} = ${1 - act};`);
    } else if (clock) L.push(`    @(negedge ${clock.port});`);
    L.push('    for (k = 0; k < NV; k = k + 1) begin',
      '      cur_in = vin[k];', ...apply, ...(ios.length ? ['      cur_drv = vdrv[k];', ...applyIo] : []),
      clock ? `      @(negedge ${clock.port});` : `      #${settle};`,
      `      got = ${chk.length ? `{${chk.map(p => p.name).join(', ')}}` : "1'b0"};`);
    if (trace) L.push('      $display("@TB %0d %b", k, got);');
    L.push('      if (((got ^ vexp[k]) & vmask[k]) !== 0) begin',
      '        errors = errors + 1;',
      `        $display("vector %0d:${fmt} -> expected %b, got %b", k${ins.map(p => `, ${p.name}`).join('')}${ios.map(p => `, ${drv.get(p.name)}`).join('')}, vexp[k], got);`,
      '      end',
      '    end',
      `    if (errors == 0) $display("TEST PASSED: %0d vector(s)${checked ? '' : ' (no expected values)'}", NV);`,
      '    else $display("TEST FAILED: %0d of %0d vector(s) wrong", errors, NV);',
      '    $finish;',
      '  end', '', 'endmodule', '');
    return L.join('\n');
  }
}

/**
 * Expected values from a run of a `trace` test bench: the "@TB <k> <bits>" lines of the log
 * split per output port -> [{ port: bits }] (bits other than 0/1 become '-': not checked).
 * `outs`: the checked ports in the bench's order: the outputs, then the bidirectional ports.
 */
export function expectedFromTrace(logLines, outs, nv) {
  const res = Array.from({ length: nv }, () => null);
  for (const line of logLines) {
    const m = /@TB (\d+) ([01UXZWLH\-xzuwlh]+)/.exec(line);
    if (!m) continue;
    const k = +m[1];
    if (k >= nv) continue;
    const bits = m[2].toUpperCase().replace(/[^01]/g, '-');
    const o = {};
    let at = 0;
    for (const p of outs) { o[p.name] = bits.slice(at, at + p.width); at += p.width; }
    res[k] = o;
  }
  return res;
}
