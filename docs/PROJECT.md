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
* `impl.optLevel`: the synthesis's Optimization Effort, 1 Normal (the default; with the Silinx
  toolchain one mapping, fast, and every mapping for a design of 250 LUTs at most (the faster kept) or limited by its logic depth; its wide multiplexers
  on MUXF5 … MUXF7, the mapping with the wider functions and the state machines Yosys leaves as written (of 8
  states or more) one-hot when that is better; Place & Route's two placements, the faster kept, for a design of 500
  slices at most) or 2 High (every mapping tried, and the state machines of 8 states or more one-hot, the best kept;
  Place & Route's two placements, the faster kept, and a third routed when the placer estimates it faster than one of
  them).
* Generated implementation output lives in `<project>/build/` (ISE work dir), bitstream `build/<top>.bit`.

## HTTP API (server/)

All under `/api`. JSON in/out. Errors: `{ error: "message" }` with 4xx/5xx.

| Method | Path | Description |
|---|---|---|
| GET | /projects | list `[{ name, device, top }]` |
| POST | /projects | `{ name, template?: 'empty' or an example (GET /templates: gates, traffic, blinky, pong, stopwatch, clock, vga), device?, board? }` create |
| GET | /projects/:p | project json + `fileTree` |
| PUT | /projects/:p | replace project json |
| DELETE | /projects/:p | move project to `.trash` inside workspace |
| GET | /projects/:p/file?path=... | raw file text |
| PUT | /projects/:p/file?path=... | write raw text body |
| DELETE | /projects/:p/file?path=... | delete file (and remove from files list) |
| GET | /projects/:p/sources | `[{ path, lang, role, text }]` all HDL sources (for the in-browser compiler) |
| GET | /devices | the parts of every ISE 14.7 WebPACK family + boards database (server/devices.js) |
| GET | /toolchain | detected ISE + programmer tools |
| PUT | /toolchain | save toolchain settings (`~/.silinx/config.json`) |
| POST | /projects/:p/implement | `{ steps?: ['synth','translate','map','par','bitgen'] }` -> `{ job }` |
| GET | /projects/:p/reports | parsed utilization / timing summaries of last run |
| POST | /program | `{ project?, bitfile?, tool?, cable?, board?, position? }` -> `{ job }` |
| POST | /jtag/scan | `{ tool?, cable? }` -> `{ job }` |
| GET | /jobs/:id?since=N | `{ id, kind, status:'running'|'ok'|'error', lines:[...since N], next, result }` |

Jobs are implemented in `server/jobs.js`.
