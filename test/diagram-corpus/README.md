# Diagram corpus: state machines and Petri nets through every way Silinx makes hardware of them

Like the design corpus (`test/designs-corpus/`) does for HDL designs, this corpus (#205) takes
**state machines** and **Petri nets** of some size through the editors' models, their analyses and
the hardware generated from them.

    npm test                       # test/diagram-corpus.test.js: the machines' models, HDL and ASM charts
    npm run test:diagrams          # test/diagram-corpus/*.test.js: Yosys synthesis, the MCC Petri nets (network, minutes)
    SILINX_UPDATE_CORPUS=1 …       # record what is found as the expectations (expected.json, sizes.json)

## State machines: `fsm/*.kiss2`

Written for this corpus, Silinx's own (AGPL-3.0-only), in KISS2, the format of the FSM benchmarks
(read and written by `core/kiss2.js`). The MCNC / LGSynth'91 benchmark machines carry no licence, so
they are not used (the author's decision, 2026-10-14).

| machine | what | states | inputs / outputs |
| --- | --- | --- | --- |
| det1011 | overlapping sequence detector (Mealy) | 4 | 1 / 1 |
| handshake | four-phase handshake, receiver | 4 | 2 / 2 |
| traffic | traffic lights at a crossing, with timers | 6 | 3 / 5 |
| vending | vending machine, change given | 6 | 2 / 3 |
| uart_rx | UART receiver control, framing error | 5 | 3 / 4 |
| arbiter | round-robin arbiter, three requesters | 6 | 3 / 3 |
| elevator | elevator for three floors | 7 | 4 / 3 |
| lock | combination lock, alarm after three wrong codes | 14 | 5 / 2 |
| johnson16 | Johnson counter, enable and direction | 16 | 2 / 4 |
| rand24 | pseudo-random machine (fixed seed), every input a row | 24 | 3 / 3 |

Each one (`test/diagram-corpus.test.js`): read, written back the same; its exact warnings
(`expected.json`); its HDL in VHDL and Verilog, every encoding (binary, gray, one-hot, enum) and
style, simulated against the model with random inputs; the same machine as an ASM chart, its HDL
simulated too. `test/diagram-corpus/synth.test.js`: synthesized by Yosys for the Spartan-3E, the
netlist simulated against the HDL, its cells recorded (`sizes.json`).

## Petri nets: `mcc.json`

Twelve P/T nets of the [Model Checking Contest](https://mcc.lip6.fr/2026/models.php) 2026, from 13 to
10 636 reachable markings, 1-safe and k-bounded (k = 2, 3, 10), with and without deadlocks, live and
not. **Fetched for testing only, never committed** (`scripts/fetch-diagram-corpus.mjs`: the
archive checked against its SHA-256, only the net kept, in the main checkout's
`.cache/diagram-corpus/`): the models carry no licence; the contest's call for models says they
"are expected to become part of the public domain" (the author's decision, 2026-10-14).

Each one (`test/diagram-corpus/petri.test.js`): read from its PNML, analysed (`core/petri-analysis.js`),
the number of reachable markings and of firings between them, the most tokens in a place and in a
marking, deadlock, liveness and 1-safe compared with the contest's consensus results
(`raw-result-analysis.csv` of 2026); the small safe nets also as hardware, their VHDL and Verilog
simulated against the clock step.
