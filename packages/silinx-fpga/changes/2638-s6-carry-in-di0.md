In detail:

- **A Spartan-6 carry chain's CYINIT and DI<0> both signals (#2638):** an adder with a carry in (`a + b + c`, the
  light8080's ALU in micro80) needed the bypass input AX for both. The packer only warned ("CYINIT and DI<0> both need
  the bypass input AX"), and since #1153 the physical stage refused it ("its pin AX carries … and …"). The packer now
  does what ISE's map does on the same netlist: CYINIT keeps AX (`PRECYINIT::AX`), and DI<0> goes through A's O5 as a
  route-through of its net (`ACY0::O5`, A6 high), on the S LUT's own input pin when DI<0> is one of them
  (`s6/pack.js`, `s6/phys.js`, `s6/xdl.js`). The warning remains only when O5 is taken or the S LUT leaves no input.
  ISE accepts the result: the adder's placed XDL through `par -k` and its routed XDL through `drc`, with no error or
  warning; micro80 on the Nexys3 and the Atlys packs with no warning and `par -k` routes it completely. Its DRC errors
  left are the RAM32M's (#2639), and the open flow's bitgen refuses its two block RAMs (#2679), which
  test/examples.test.js now expects instead of the refusal at AX. Tests: test/s6-pack.test.js, test/s6-xdl.test.js, test/examples.test.js.
