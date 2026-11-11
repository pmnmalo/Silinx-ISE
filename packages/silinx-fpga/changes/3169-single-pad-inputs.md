In detail:

- **The measurements of the Spartan-6 pads' held PIPs, repeatable (#3169, #3350).** These are the research scripts
  that measured, with ISE, the PIPs now waiting in `bitdb/s6/s6-pips-held.json` (#3349):
  - `research/s6/gen-padsingle6.mjs` writes one design per pad of the TIOB_SINGLE / BIOB_SINGLE tiles, for their pad
    wire -> IBUF PIPs (no bits).
  - `gen-padout6.mjs` writes outputs on TIOI_OUTER slave pads, for their slave OLOGIC2's `D1 -> OQ` (`26,35 27,48 28,14`).
  - `measure-3169-s6.sh` measures either set by PIP drop (`GEN`, `OUT`), one ISE container at a time.
  - `run-3169-s6.mjs` runs it on both parts with the ISE machine's settings from `~/.silinx/config.json`.
  - `check-held6.mjs` compares Silinx's writer with ISE's bitgen on the designs, with and without the held PIPs.
  - The research README records the results.
