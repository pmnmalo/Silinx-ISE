In short:

- **Silinx HLS: a pipelined loop's iteration over several cycles:** a pipelined loop too slow for the clock is cut into
  pipeline stages, as Vitis HLS makes it, instead of missing the timing; View C Synthesis Report gives an iteration's
  cycles. A recurrence longer than the clock (a `float` sum) raises the II, with a warning; a loop that reads and
  writes streams too slow for the clock has its accesses in their stages too.

In detail:

- **Silinx HLS: pipeline stages in a pipelined loop (#2182):** a pipelined loop with no memory, one state an iteration,
  whose path does not fit the clock is made again as a modulo-scheduled pipeline (core/c-pipe-sched.js): its operations
  in stages against the clock, the pipeline's registers and a valid bit per stage between them, its II kept (the
  report's `depth`, View C Synthesis Report's "an iteration over N cycles"). A loop whose stages need a larger II than
  its dependences (a recurrence through a long operation, as a `float` sum: II=1 asked, II=16 made at 10 ns) has its
  II raised until they fit, with a warning "a dependence at this clock: …", where it kept its II and missed the timing.
  A sum's variable that the next iteration reads (`s += a + b + c`) is added last when the sum is balanced, its
  recurrence one addition (core/c-balance.js); a local array of registers read and written only at the loop's counter
  (`buff[i] = buff[i] + 100`) is no dependence, each iteration writing its own element. A loop that reads and writes streams, a state an access, whose states do
  not fit the clock is made so too when each stream is read or written once an iteration: its access in its stage, the
  value read carried on in the pipeline's registers, every stage held while a FIFO is empty or full.
  `report.slowLoops` and its warning remain for the loops still made a state an access (a stream polled or accessed
  twice, a memory of structs). Co-simulated in VHDL and Verilog (the co-simulation's FIFOs empty and full now and
  then); test/c-pipe-stages.test.js.
