In short:

- **Silinx HLS, the device's multipliers shared:** when the multiplexers in front of the shared multipliers make a
  path longer than the clock, each multiplication's operands are now held in the multiplier's own registers, a cycle
  before it, as Vitis HLS does (a double multiplication on the Basys2-100 at 10 ns: 15.7 ns → 8.9 ns, one cycle more).

In detail:

- **Registers on the shared units' operands (#2273):** with the device's multiplier blocks (the IDE passes them),
  when the units' path is over the period the machine is scheduled again with each multiplication in a cycle of its
  own, its operands held in registers written the cycle before (core/c-schedule.js), and a unit's uses share two
  registers, written by the state before each use (core/c-bind.js): the multiplexers on those registers' inputs, not
  before the multiplication; kept when the path is shorter so, the latency counting the cycles added. The path
  reported (`unitsNs`) counts those registers' multiplexers too. sinf 15.7 ns → 10.4, pow 25.5 → 18.9 at 10 ns: still
  over the clock, still said. The soft-float's operations as units are left for later.
