# Silinx project model

A project is a directory under the workspace (default `~/Silinx-projects`, override with
`SILINX_WORKSPACE`) containing `silinx.json`:

```json
{
  "name": "blinky",
  "version": 1,
  "device": { "family": "spartan3e", "part": "xc3s500e", "package": "fg320", "speed": "-4" },
  "board": "s3e-starter",
  "top": "top",
  "simTop": "tb_top",
  "files": [
    { "path": "src/counter.v",  "lang": "verilog", "role": "design" },
    { "path": "src/top.vhd",    "lang": "vhdl",    "role": "design" },
    { "path": "sim/tb_top.v",   "lang": "verilog", "role": "sim" }
  ],
  "constraints": "constraints/top.ucf",
  "stimuli": { "tb": null },
  "impl": { "optMode": "Speed", "optLevel": 1, "startupClk": "JtagClk" }
}
```

* `role: design` files go to synthesis; `role: sim` files are only used for simulation.
* `synthTool`: `'silinx'` (the Silinx toolchain: Yosys, Silinx's place & route and bitstream) or
  `'xst'` (Xilinx ISE 14.7); without it, the mode of Toolchain Settings.
* `impl.optMode` and `impl.optLevel`: ISE's Optimization Goal and Effort, and the project's Optimization (#2470):
  `Speed` and 1 **Fast** (one mapping, one placement: a project with none is Fast too), `Area` and 2 **Area** (the
  default of a new project: the smaller of the usual mapping's netlist and Speed's, one placement, no register
  replication), `Speed` and 2 **Speed** (every mapping for speed, the state machines of 8 states or more one-hot, the
  fastest kept; several placements, the fastest kept). `Area` at 1, of a project made before, is Area.
* Generated implementation output lives in `<project>/build/` (ISE work dir), bitstream `build/<top>.bit`.

## HTTP API (server/)

All under `/api`. JSON in/out. Errors: `{ error: "message" }` with 4xx/5xx.

| Method | Path | Description |
|---|---|---|
| GET | /projects | list `[{ name, device, top, board, modified }]` |
| POST | /projects | `{ name, template?: 'empty' or an example (GET /templates: gates, traffic, blinky, pong, stopwatch, clock, vga, isqrt), device?, board? }` create |
| GET | /projects/:p | project json + `fileTree` |
| PUT | /projects/:p | replace project json |
| DELETE | /projects/:p | move project to `.trash` inside workspace |
| GET | /projects/:p/file?path=... | raw file text |
| PUT | /projects/:p/file?path=... | write raw text body |
| DELETE | /projects/:p/file?path=... | delete file (and remove from files list) |
| GET | /projects/:p/sources | `[{ path, lang, role, text }]` all HDL sources (for the in-browser compiler) |
| GET | /devices | the parts of every ISE 14.7 WebPACK family and the iCE40 + boards database (server/devices.js) |
| GET | /toolchain | detected ISE + programmer tools |
| PUT | /toolchain | save toolchain settings (`~/.silinx/config.json`) |
| POST | /projects/:p/implement | `{ steps?: ['synth','translate','map','par','trce','bitgen','prombit'] }` -> `{ job }` |
| GET | /projects/:p/reports | parsed utilization / timing summaries of last run |
| POST | /program | `{ project?, bitfile?, tool?, cable?, board?, position? }` -> `{ job }` |
| POST | /jtag/scan | `{ tool?, cable? }` -> `{ job }` |
| GET | /jobs/:id?since=N | `{ id, kind, status:'running'|'ok'|'error', lines:[...since N], next, result }` |

Jobs are implemented in `server/jobs.js`.
