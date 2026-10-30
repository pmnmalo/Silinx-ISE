In short:

- **Silinx HLS, the C Synthesis Report:** a pipelined loop whose iteration does not fit the clock is said, with its path.

In detail:

- **Silinx HLS, a state that writes a stream split by the clock (#2080):** its value computed in the chain's states, the
  handshake in the last one, where the machine waits for its FIFO without computing again.
- **Silinx HLS, a pipelined loop too slow for the clock (#2080):** its II kept (Silinx adds no pipeline stages), its
  longest path in the report (`slowLoops`) and a warning in View C Synthesis Report, not in a compilation's messages.
