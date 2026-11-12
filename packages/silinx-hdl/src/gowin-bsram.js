// Silinx - the Gowin's block RAMs (BSRAM, #2299): gowin-prims.js's, written from Gowin's BSRAM user guide (UG285) and
// how Yosys's synth_gowin uses them (techlibs/gowin/brams_map.v, brams.txt): 16 Kbit (SP, SDPB, DPB, pROM) or 18 Kbit (their
// X9 twins, SPX9, SDPX9B, DPX9B, pROMX9) of contents, INIT_RAM_00 … 3F (256 or 288 bits each) from bit 0 on.
//   - a port of BIT_WIDTH w bits (1, 2, 4, 8, 16, 32; X9: 9, 18, 36) addresses its word with AD(13 downto log2 of its
//     word of 8-bit units: 0 … 5), the word the bits w × address … ; a port of 16 or 18 bits writes the bytes (of 8 or 9
//     bits) AD(1 downto 0) enables, of 32 or 36 bits those of AD(3 downto 0); narrower ones their whole word;
//   - on its clock's rising edge with CE (and BLKSEL = BLK_SEL): a write (WRE; SDPB's port A writes whenever CEA) and a
//     read into the output latch, as WRITE_MODE says (0: a write keeps the latch, 1: the word written, 2: the word before);
//     READ_MODE 1: the output register, loaded from the latch when OCE; DO the latch's or the register's, its bits above w 0;
//   - RESET clears the latch and the register: on the clock's edge whatever CE (RESET_MODE "SYNC"), or at once ("ASYNC");
//   - the ports' reads of an edge before its writes; collisions are not checked.
//
// Isomorphic ES module (browser + Node), no DOM.

const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');

// a port: its pins and generics (do: none for a write port, di: none for a read port; we: its write enable, 'CE' for
// SDPB's port A; bs: its BLKSEL, none for pROM)
const port = (x, pins) => ({ x, ...pins });
const KINDS = {
  SP: [port('A', { do: 'DO', di: 'DI', ad: 'AD', we: 'WRE', clk: 'CLK', ce: 'CE', oce: 'OCE', rst: 'RESET', bs: 'BLKSEL', w: 'BIT_WIDTH', rm: 'READ_MODE', wm: 'WRITE_MODE', blk: 'BLK_SEL' })],
  pROM: [port('A', { do: 'DO', ad: 'AD', clk: 'CLK', ce: 'CE', oce: 'OCE', rst: 'RESET', w: 'BIT_WIDTH', rm: 'READ_MODE' })],
  SDPB: [port('A', { di: 'DI', ad: 'ADA', we: 'CE', clk: 'CLKA', ce: 'CEA', rst: 'RESETA', bs: 'BLKSELA', w: 'BIT_WIDTH_0', blk: 'BLK_SEL_0' }),
    port('B', { do: 'DO', ad: 'ADB', clk: 'CLKB', ce: 'CEB', oce: 'OCE', rst: 'RESETB', bs: 'BLKSELB', w: 'BIT_WIDTH_1', rm: 'READ_MODE', blk: 'BLK_SEL_1' })],
  DPB: ['A', 'B'].map((x, i) => port(x, { do: `DO${x}`, di: `DI${x}`, ad: `AD${x}`, we: `WRE${x}`, clk: `CLK${x}`, ce: `CE${x}`, oce: `OCE${x}`, rst: `RESET${x}`,
    bs: `BLKSEL${x}`, w: `BIT_WIDTH_${i}`, rm: `READ_MODE${i}`, wm: `WRITE_MODE${i}`, blk: `BLK_SEL_${i}` })),
};

const bsram = (kind, x9) => {
  const name = { SP: x9 ? 'SPX9' : 'SP', pROM: x9 ? 'pROMX9' : 'pROM', SDPB: x9 ? 'SDPX9B' : 'SDPB', DPB: x9 ? 'DPX9B' : 'DPB' }[kind];
  const ports = KINDS[kind];
  const dw = (kind === 'DPB' ? 16 : 32) * (x9 ? 9 : 8) / 8, mem = x9 ? 18432 : 16384, iw = x9 ? 288 : 256;
  const widths = x9 ? [[9, 3], [18, 4], [36, 5]] : [[1, 0], [2, 1], [4, 2], [8, 3], [16, 4], [32, 5]];
  const pins = [];
  for (const p of ports) {
    if (p.do) pins.push(`${p.do} : out std_logic_vector(${dw - 1} downto 0)`);
    if (p.di) pins.push(`${p.di} : in std_logic_vector(${dw - 1} downto 0) := (others => '0')`);
    if (p.bs) pins.push(`${p.bs} : in std_logic_vector(2 downto 0) := (others => '0')`);
    pins.push(`${p.ad} : in std_logic_vector(13 downto 0)`, `${p.clk} : in std_ulogic`, `${p.ce} : in std_ulogic := '1'`);
    if (p.we && p.we !== 'CE') pins.push(`${p.we} : in std_ulogic := '0'`);
    if (p.oce && !pins.some((q) => q.startsWith(`${p.oce} `))) pins.push(`${p.oce} : in std_ulogic := '1'`);
    pins.push(`${p.rst} : in std_ulogic := '0'`);
  }
  const gens = new Set();
  for (const p of ports) {
    if (p.rm) gens.add(`${p.rm} : bit := '0'`);
    if (p.wm) gens.add(`${p.wm} : bit_vector(1 downto 0) := "00"`);
    gens.add(`${p.w} : integer := ${widths[widths.length - 1 - (kind === 'DPB' ? 1 : 0)][0]}`);
    if (p.blk) gens.add(`${p.blk} : bit_vector(2 downto 0) := "000"`);
  }
  gens.add('RESET_MODE : string := "SYNC"');
  for (let j = 0; j < 64; j++) gens.add(`INIT_RAM_${hex2(j)} : bit_vector(${iw - 1} downto 0) := (others => '0')`);
  const on = (p) => (p.bs ? ` and ${p.bs} = to_stdlogicvector(${p.blk})` : '');
  // a port's word: its width d, the address bits below it s, its bytes' width u (0: the whole word) and their enables
  const dims = (p) => `    d${p.x} := 0; s${p.x} := 0; u${p.x} := 0;
${widths.map(([w, s], i) => `    ${i ? 'elsif' : 'if'} ${p.w} = ${w} then d${p.x} := ${w}; s${p.x} := ${s};`).join('\n')}
    end if;
    if s${p.x} = 4 and d${p.x} >= 16 then u${p.x} := d${p.x} / 2; elsif s${p.x} = 5 then u${p.x} := d${p.x} / 4; end if;`;
  // a port on its clock's edge: the register from the latch, the word at its address read (the latch, as WRITE_MODE says),
  // its write noted (done after every port's reads)
  const edge = (p) => `    w${p.x} := false;
    if rising_edge(${p.clk})${on(p)} and d${p.x} > 0 then
${p.rm ? `      if ${p.rm} = '1' and ${p.oce} = '1' then r${p.x} := l${p.x}; end if;\n` : ''}      if ${p.ce} = '1' then
        adr := 0; bad := false;
        for i in 13 downto s${p.x} loop
          adr := adr * 2;
          if ${p.ad}(i) = '1' then adr := adr + 1; elsif ${p.ad}(i) /= '0' then bad := true; end if;
        end loop;
        a${p.x} := adr; bad${p.x} := bad;
        -- the bits it writes
        for i in 0 to ${dw - 1} loop
          e${p.x}(i) := '0';
${p.di ? `          if i < d${p.x} and ${p.we === 'CE' ? 'true' : `${p.we} = '1'`} then
            if u${p.x} = 0 then e${p.x}(i) := '1'; elsif ${p.ad}(i / u${p.x}) = '1' then e${p.x}(i) := '1'; end if;
            if e${p.x}(i) = '1' then w${p.x} := true; end if;
          end if;
` : ''}        end loop;
${p.do ? `        if bad then l${p.x} := (others => 'X');
        elsif not w${p.x} or ${p.wm ? `${p.wm} /= "00"` : 'true'} then
          l${p.x} := (others => '0');
          for i in 0 to d${p.x} - 1 loop
${p.wm ? `            if ${p.wm} = "01" and e${p.x}(i) = '1' then l${p.x}(i) := ${p.di}(i); else l${p.x}(i) := to_stdulogic(mem(adr * d${p.x} + i)); end if;`
    : `            l${p.x}(i) := to_stdulogic(mem(adr * d${p.x} + i));`}
          end loop;
        end if;
` : ''}      end if;
${p.do ? `      if RESET_MODE = "SYNC" and ${p.rst} = '1' then l${p.x} := (others => '0'); r${p.x} := (others => '0'); end if;\n` : ''}    end if;`;
  const write = (p) => `    if w${p.x} and not bad${p.x} then
      for i in 0 to d${p.x} - 1 loop
        if e${p.x}(i) = '1' then mem(a${p.x} * d${p.x} + i) := to_bit(${p.di}(i)); end if;
      end loop;
    end if;`;
  const out = (p) => `    if RESET_MODE = "ASYNC" and ${p.rst} = '1' then l${p.x} := (others => '0'); r${p.x} := (others => '0'); end if;
    if ${p.rm} = '1' then ${p.do} <= r${p.x}; else ${p.do} <= l${p.x}; end if;`;
  const xs = ports.map((p) => p.x);
  return `
${IEEE}
entity ${name} is
  generic (${[...gens].join(';\n    ')});
  port (${pins.join(';\n    ')});
end ${name};
architecture silinx of ${name} is
begin
  process (${ports.flatMap((p) => [p.clk, p.rst]).join(', ')})
    variable mem : bit_vector(${mem - 1} downto 0);
    variable started : boolean := false;
    variable adr, ${xs.map((x) => `a${x}, d${x}, s${x}, u${x}`).join(', ')} : integer := 0;
    variable bad, ${xs.map((x) => `bad${x}, w${x}`).join(', ')} : boolean := false;
    variable ${xs.map((x) => `l${x}, r${x}, e${x}`).join(', ')} : std_logic_vector(${dw - 1} downto 0) := (others => '0');
  begin
    if not started then
      started := true;
      mem := ${Array.from({ length: 64 }, (_, j) => `INIT_RAM_${hex2(63 - j)}`).join(' & ')};
    end if;
${ports.map(dims).join('\n')}
${ports.map(edge).join('\n')}
${ports.filter((p) => p.di).map(write).join('\n')}
${ports.filter((p) => p.do).map(out).join('\n')}
  end process;
end silinx;`;
};

/** VHDL source of the Gowin's block RAMs (joined to gowin-prims.js's GOWIN_VHDL). */
export const GOWIN_BSRAM_VHDL = ['SP', 'SDPB', 'DPB', 'pROM'].flatMap((k) => [bsram(k, false), bsram(k, true)]).join('\n');
