// Implement's check of a constraints file in nextpnr's or Vivado's format (web/js/constraints-format.js, core/constraints-check.js): its ports that are
// no port of the top. A one-bit vector (std_logic_vector(0 downto 0), the vga example's sw) is a bus whose bit is x[0]
// (#3517: it was known as x, and its x[0] warned); a scalar is x, a wider bus its bits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';

const { xdcDiagnostics, pcfDiagnostics, lpfDiagnostics, cstDiagnostics } = await import('../web/js/constraints-format.js');

// the top's ports as implement.js gives them (drawings.js ucfPort): a one-bit vector, a scalar, a bus of four
const PORTS = [{ name: 'sw', dir: 'in', width: 1, msb: 0, lsb: 0 }, { name: 'clk', dir: 'in', width: 1, msb: null, lsb: null },
  { name: 'btn', dir: 'in', width: 4, msb: 3, lsb: 0 }];

test('#3517 XDC: a one-bit vector\'s bit is a port of the top; a bit it has not, a scalar\'s bit, and another name warn', () => {
  const xdc = (ports) => ports.map((p) => `set_property -dict { PACKAGE_PIN W5 IOSTANDARD LVCMOS33 } [get_ports {${p}}]`).join('\n');
  assert.deepEqual(xdcDiagnostics(`${xdc(['clk', 'sw[0]', 'btn[0]', 'btn[3]'])}\ncreate_clock -period 10.000 [get_ports {clk}]\n`, PORTS), []);
  assert.deepEqual(xdcDiagnostics(xdc(['sw[1]', 'clk[0]', 'btn[4]', 'led']), PORTS).map((d) => [d.severity, d.line, d.message]), [
    ['warning', 1, 'get_ports sw[1]: the top has no such port'], ['warning', 2, 'get_ports clk[0]: the top has no such port'],
    ['warning', 3, 'get_ports btn[4]: the top has no such port'], ['warning', 4, 'get_ports led: the top has no such port']]);
  // (a one-bit vector named as a scalar: not its bit)
  assert.deepEqual(xdcDiagnostics(xdc(['sw']), PORTS).map((d) => d.message), ['get_ports sw: the top has no such port']);
  // no ports known: nothing said
  assert.deepEqual(xdcDiagnostics(xdc(['led']), []), []);
});

test('#3517 PCF, LPF, CST: the same for a one-bit vector', () => {
  assert.deepEqual(pcfDiagnostics('set_io sw[0] 23\nset_io clk 35\nset_io btn[2] 10\n', PORTS), []);
  assert.deepEqual(pcfDiagnostics('set_io sw[1] 23\n', PORTS).map((d) => [d.line, d.message]), [[1, 'set_io sw[1]: the top has no such port']]);
  assert.deepEqual(lpfDiagnostics('LOCATE COMP "sw[0]" SITE "B2";\nLOCATE COMP "clk" SITE "G2";\n', PORTS), []);
  assert.deepEqual(cstDiagnostics('IO_LOC "sw[0]" 3;\nIO_LOC "clk" 52;\n', PORTS), []);
});
