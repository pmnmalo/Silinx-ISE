# Spartan-3E device descriptions measured black-box (2026-10-11)

Issue [#3](https://github.com/pmnmalo/Silinx-ISE/issues/3). The device descriptions that ship with
Silinx (`core/fpga/devices/*.json.gz`: tiles, sites, wires, PIPs and the nodes that join wires across
tiles) are today computed from ISE's device report (`xdl -report -pips -all_conns`,
`research/s3e-route/build-device.mjs`). The bit database (`research/s3e-bitstream/db`) was instead
measured: designs written by Silinx, implemented by ISE, their outputs compared. This folder works
out how to obtain the device descriptions the same way, from what Silinx observes when ISE runs on
designs it writes, so that what ships derives from Silinx's own measurements (the open legal
question in [docs/OPEN-TOOLCHAIN.md](../../docs/OPEN-TOOLCHAIN.md)).

**Rule kept here:** no measurement reads the device report or anything built from it. The shipped
graph is used only afterwards, locally, to score how complete and how right a measured description
is (as the issue suggests); a fact enters the measured description only when an experiment on ISE
showed it.

| File | What it does |
|---|---|
| `oracle.sh` | Inside the ISE container, for every `.xdl` of a folder: `xdl -xdl2ncd` (and `-force`), `drc -z`, with `-r` also `par -p` (ISE routes, the placement kept) and `xdl -ncd2xdl`; only the logs and the routed XDL come back |
| `ise-remote.sh` | Runs `oracle.sh` on another machine with Docker and the ISE image (`SILINX_ISE_HOST=user@host` in the environment only); its remote folder is removed afterwards |
| `probe.mjs`, `probe-run.mjs` | xdl -xdl2ncd as an oracle of existence: probe designs holding many candidate PIPs (tiles) or sites, asked in rounds |
| `candidates.mjs` | The probes' candidates: switch-box tiles, slice and VCC sites, the census of the CLBs' PIPs |
| `observe.mjs` | What a design routed by ISE shows: PIPs, sites, site pin wires, and the joins between tiles inferred net by net |
| `model.mjs` | Joins as rules in switch-box coordinates, applied to every switch box: the predicted joins |
| `hypotheses.mjs` | Test designs for joins: one net per hypothesis; ISE's DRC says which are joined. A tile with no slice is driven from a neighbouring CLB across known joins |
| `gen-observe.mjs` | Random designs over the CLB slices for ISE to route |
| `gen-obshdl.mjs` | Observation designs in HDL for ISE to implement: every block RAM's and multiplier's outputs, every pad's input (round 5) |
| `build.mjs` | Measurements -> the packed format of the shipped graphs (`core/fpga/device.js`) |
| `prototype.mjs` | The phase-2 prototype: observe, predict, tests, verdicts, build the measured CLB array, compare it with the shipped graph; `score`: the tests' verdicts against the shipped graph |

What the experiments produce (ISE's routed XDL and logs, the candidates, the verdicts) stays in the
working folders, out of the repository; only the scripts and this record are here.

## 1. Method

### What the description holds, and what Silinx needs of it

The packed description (`core/fpga/device.js`) holds, per device: the tile grid (name, row, column,
type of every tile); per tile *template* the wires, the PIPs (from, to, bidirectional, route-through)
and the sites with the tile wire of each pin; per tile its sites' names and whether a pad is bonded;
and the *nodes*, the sets of tile wires joined by metal. The open flow uses it to place (sites), route
(nodes and PIPs), time (`timing.js`: node classes from the wire names and the delay table, the
fastest routes over the graph) and write the bitstream (the PIP and pin names, which the bit
database knows by tile type).

The router of the open flow only takes PIPs whose bits are measured (`knownRouting`,
`core/fpga/bitgen.js`). So a measured description needs, for routing, the PIPs of the bit database
and the nodes of their wires; the other PIPs of the chip are of no use to the open flow until their
bits are measured too (and measuring their bits needs to know they exist: the same probe).

### What is measured how

| Part of the description | Observation | Experiment |
|---|---|---|
| Tiles that hold a switch box or a PIP | the tile names in ISE-routed designs | **arc probe**: a PIP known in the tile type, placed in each candidate tile name: `xdl -xdl2ncd` says `Could not find arc in tile T…` when the tile does not exist. (Tiles with no PIP and no site cannot be named and are not needed; rows and columns are Silinx's own, from the names) |
| Sites, their type | instances placed by ISE (map / par) | **placement probe**: one instance per candidate site: `Placement site S for instance I of type T … is invalid for device` when the site does not exist or does not take the type (a SLICEM site takes SLICEL and SLICEM, a SLICEL site only SLICEL) |
| The tile of a site | the `placed TILE SITE` that ISE writes (`xdl -xdl2ncd` ignores the tile name it reads, `xdl -ncd2xdl` writes the right one) | a design with an instance on every site, read back |
| Bonded pads, package pins | IOB sites are named by package pin | placement probe of the package's ball names |
| Site pin -> tile wire | the first PIP of an ISE-routed net leaves its source pin's wire; the last ends on the sink pin's | DRC of a net driven from the pin through a PIP out of that wire (an island if wrong) |
| Wires of a tile type | the ends of its PIPs and its pin wires | — (a wire with no PIP and no pin cannot be named in XDL: not observable, and of no use to the router) |
| PIPs of a tile type | the bit database (every PIP it has bits for, or measured without bits, was accepted by `xdl -xdl2ncd` and programmed by bitgen); ISE-routed designs | arc probe of candidates; bidirectional: ISE writes `=-`; route-throughs: ISE's routes |
| Joins (nodes) | ISE-routed nets: a from-wire no PIP of the net drives in its tile is joined to a to-wire of the same family in another tile (`observe.mjs`) | rules in switch-box coordinates predict the joins of every tile (`model.mjs`); each predicted join is tested (`hypotheses.mjs`) |
| Delays | already measured: `research/s3e-route/timing-fit.mjs` fitted the wire classes to ISE's `reportgen -delay` | the delay table is computed from the graph |

### The oracles (measured 2026-10-11 on the XC3S250E, ISE 14.7, `xdl` P.20131013)

- **`xdl -xdl2ncd` checks every PIP and every placement before converting**, and names each one that
  does not exist (`ERROR:XDL:198 - Could not find arc in tile CLB_X5Y5 with connecting wires F1_B0
  and X0 around line 121`; the same message for a tile that does not exist; `ERROR:XDL:190 -
  Placement site SLICE_X99Y99 for instance s1 of type SLICEL … is invalid for device`, also for a
  SLICEM instance on a SLICEL site). It **stops after 20 errors** (`XDL file processing stopped after
  20 errors were found`), so a probe design answers for every candidate up to its 20th error: those
  before it without an error exist; the rest are asked again (`probe-run.mjs`). A probe round of 8
  designs takes about 10 s.
- **A design whose PIPs all exist may end in a fatal error of xdl's own** when it builds the probe
  net of thousands of PIPs (`FATAL_ERROR:XCad: … UNEXPECTED RUG CREATION PROBLEM FOR NETWORK:probe`,
  #74). So every probe design ends with a PIP that does not exist (`PROBE_END`, the sentinel): its
  error shows that xdl checked every candidate before it (and stops xdl before it builds the net);
  without it, only what comes before the last error is answered, the rest is asked again in designs
  half the size (`probe-run.mjs`).
- **The tile name of `placed TILE SITE` is not checked** (a slice placed in a tile that does not exist
  is converted): sites are probed by name only.
- **`drc -z` names every net whose PIPs are not one tree**: `The network <n> has island(s)` (PIPs cut
  off from the source), next to `has an antenna` (a PIP leading nowhere) and `is only partially
  routed`. Islands and antennas are all reported (it stops listing only the unrouted messages). So
  a net from a slice output through PIPs of tile T to wire A, plus one PIP of tile U out of wire B,
  has an island exactly when A and B are not one node. One design holds hundreds to thousands of
  such nets, each with its own source and its own wires (`hypotheses.mjs`).
- **`par -p` routes a placed XDL design** (the placement kept): ISE's router then shows, in its
  routed XDL, PIPs and joins Silinx chose nothing of.

### Joins: from observed nets to the whole chip

A routed net lists its PIPs sorted by tile, not as a path. In a legal net every PIP's from-wire is
driven: by a PIP of the same tile ending on the same wire, by the source pin, or by a to-wire of
another tile it is joined to. The candidates for that last case are the net's to-wires of the same
*family* (`wireFamily`: doubles and hexes by direction and length, as UG331 describes them — BEG,
A, B, MID, C, D, END taps; long lines; the output multiplexer lines; the carry chain; the global
clock lines; the block-RAM pins). One candidate: a join. Several: the join is decided by a join of
the same wires at the same offset seen elsewhere (`resolveAmbiguous`), or left for a test.

The general routing is one switch box repeated in every CLB, block-RAM interconnect and I/O tile
(stage D of the bit database). Doubles, hexes and long lines join switch boxes a fixed number of
switch boxes apart, whatever lies between (the block-RAM site and feed-through tiles, the clock
column and rows hold none): so a join is written as a rule, `E2BEG0 2,0 E2END0`, counted in switch
boxes of the row (the block-RAM columns hold one where the CLB rows above and below hold four), then
of the column (the DCMs interrupt some columns), and applied to every switch box that has the wire
(`model.mjs`). The taps no routed design happened to use are predicted from the names alone
(`segmentRules`: a double passes BEG, MID, END, a hex BEG, A, B, MID, C, D, END, one switch box
apart, with the same index; END_S / END_N one row down / up). The predictions are hypotheses, and so
are the joins decided by rules from ambiguous observations: each is tested by a DRC design. A test
design should hold no DRC error but the expected ones (an island for a wrong join; an antenna and an
unrouted sink in every net): xdl -xdl2ncd spends about 30 ms on every error it reports, so a LUT with
an unconnected input in every source slice made the first test designs five times slower.

Not covered by the switch-box rules, each to be observed and tested on its own: the terminal tiles
at the edges (where doubles and hexes end), the global clock network (BUFGMUX -> spines -> GCLKH ->
the tiles' clock pins), the block-RAM and multiplier pins (their site tile to the four interconnect
tiles), the DCMs, the carry chain across tiles, the corner tiles.

### Provenance notes on what is already measured

- The **bit database's PIP list** holds measured facts (each PIP was accepted by `xdl -xdl2ncd` and
  its bits found by comparing bitstreams), but which PIPs to try was chosen with the device report
  (`gen-pipcover.mjs` routes test designs over the report's graph). A measured description that
  takes its PIPs from the database keeps facts measured by Silinx, chosen with the report's help.
  The stricter way (candidates from observed wire names only, each asked by the arc probe) costs
  far more because of the 20-error limit (above).
- The I/O tile types share their features in the database (`unify-io.mjs`: the I/O tiles of one side
  share one switch box): a feature of one I/O tile type is not proof that another has the PIP. The
  first join tests found three such PIPs that ISE refuses (`LIOIS_PCI_X0Y16 OMUX_W14 ->
  IOIS_STUB_F1_B3`, `LIOIS_PCI_X0Y19 OMUX_NW10 -> IOIS_STUB_F4_B0`, `RIOIS_X27Y12 OMUX_NE12 ->
  IOIS_STUB_F2_B3`). Every PIP of every tile type must be confirmed by the arc probe on that type.
- The layout (`<device>-layout.json`) was built with the device grid of the report (`gen-layout.mjs`);
  the grid itself (tile names and positions) is measurable by the probes above.

## 2. Prototype on the XC3S250E (2026-10-11)

Sources: 11 designs routed by ISE that the bit database already had (the reference designs and the
designs implemented from HDL), 4 random designs routed by ISE (`gen-observe.mjs`, a quarter of the
CLBs each, `par -p`: 90 s for the four), the probes and tests below. Scored against the shipped
graph (local scoring only). ISE ran in Docker on an Intel Mac mini (one or two containers).

```
node gen-observe.mjs clb-tiles.txt obs/ 4 11 0.25 && ise-remote.sh -r obs/      # ISE routes them
node prototype.mjs observe obs.json <routed.xdl…>
node candidates.mjs tiles obs.json t.json && node probe-run.mjs t.json tiles.json   # also: sites, census
node prototype.mjs predict obs.json switch-tiles.txt pred.json                  # SEG=1: the name grammar too
node prototype.mjs tests pred.json obs.json tests/ && ise-remote.sh -f tests/ && node prototype.mjs verdicts tests/
CENSUS=census.json node prototype.mjs build obs.json clb-tiles.txt measured.json.gz tests/…
BAND=8,22 node prototype.mjs compare measured.json.gz
```
(`SILINX_ISE_HOST=user@host` in the environment for `ise-remote.sh` and `probe-run.mjs`.)

**What ISE's routed designs show** (15 designs, 119 199 PIPs, 104 205 distinct, in 941 of the 1057
tiles that have PIPs, 72 tile types): 2050 sites with their tile and type; 19 131 site pin -> tile
wire facts, **all right**; 43 322 joins: 17 076 with a single candidate (**all right**) and 26 246
decided by the joins seen elsewhere (2 wrong: these must be tested too); 3781 left ambiguous (mostly
the global clock lines, every GCLKH of a clock net is a candidate), 535 from-wires unexplained (the
block-RAM output pins, whose source pin is in another tile).

**Tile probe** (`probe-run.mjs`; candidates: the tile-name prefixes of the switch-box tiles seen in
ISE's designs, at every X / Y of their kind — the I/O tiles on their side, the block-RAM interconnect
in the observed block-RAM columns —, a PIP `W2END4 -> W2BEG4` in each): 1206 candidates, 27 rounds of
up to 8 designs, 4 min. 216 tiles found, 990 refused: **no error** against the shipped graph (none
accepted that it does not have, none refused that it has). With the 562 tiles already seen: 778 of
the 780 switch-box tiles; the 2 missing (`LIBUFS_CLK_PCI_X0Y18`, `LIBUFS_PCI_X0Y14`) are of prefixes
no design used (the prefix grammar — side, IOIS / IBUFS, _BRK / _PCI / _CLK_PCI — would find them).
The CLB array is not a rectangle: the block-RAM columns hold CLBs in their top and bottom rows
(CLB_X22Y1); only the probe finds them.

**Site probe**: a SLICEM instance on each of the 2448 slice sites: the 1224 SLICEM sites accept it,
the 1224 SLICEL sites refuse it — **every slice's type right**. VCC sites `VCC_X<x>Y<y>` (their names
are not those of their tiles: CLB_X10Y10 holds VCC_X11Y11): 1073 candidates, 727 found, 346 refused,
no error (the 65 others of the 792 are at Y37, outside the candidates: the range must reach max Y + 2).
11 rounds, 88 designs.

**PIP census** (every PIP of the bit database's CLB types, in each of the 612 CLB tiles: 1 738 008
probes in 116 designs, 18 rounds, 548 s of ISE): 1 736 790 accepted, 1218 refused, **no error**
against the shipped graph. The refused: the CLB features the break rows' type shares with the CLB
(`sameAs`) but does not have (`GCLKk -> CLKn`: its clock lines are `GCLKk_BRK`, 1152 in 36 tiles), and
`FXk -> FX_Sk` (34) and `COUT2 -> COUT_N1`, `COUT3 -> COUT_N3` (32) in the top row, where there is no
CLB above. So the database's features are right per tile type, but not every tile of a type has
them all: the description needs the census, tile by tile (or per template).

**The join oracle checked**: 600 predicted joins of the CLB array (300 the shipped graph has, 300 it
has not), one test net each in 6 designs: ISE's DRC agreed with the shipped graph on all 576 (290
joins, 286 islands); 24 could not be driven from a slice.

**Joins of the CLB array.** 327 rules (switch-box coordinates) from the 43 322 observed joins
predict 170 365 joins in the switch-box tiles, of which 127 321 were not observed; 62% of these are
right (the shipped graph). The wrong ones come from rules learnt next to irregular places (the
block-RAM and DCM columns, the edges) applied elsewhere; the tests sort them. `closeRules` (the
taps of one line joined to each other) reaches more taps but brings 351 541 predictions, half wrong:
it is not used. Tested in the rows Y8-Y22 (the break row, two GCLKH rows and the centre clock row,
the block-RAM rows):

| Step | Tests | ISE's verdicts | Agree with the shipped graph |
|---|---|---|---|
| predicted by the observed rules (`tests`, 29 designs, 1168 s) | 41 479 | 25 303 joins, 16 176 islands | **all** |
| predicted by the names alone (`segmentRules`: the taps of the doubles and hexes no routed design used; 6 designs, 49 s) | 3873 | 3873 joins | **all** |
| (3344 + 3352 predictions could not be driven from a CLB: their driver is a block-RAM or I/O switch box) | | | |

15 836 of the first tests also had a *routing conflict* (two test nets on one node, where the
predicted nodes that keep tests apart were still incomplete): it does not change the verdict (an
island is a PIP cut off from its own net's source), and all of them agreed too.

The measured CLB array (`build`: the 612 CLBs, the database's PIPs less the 1218 the census refused,
the observed and the confirmed joins) against the shipped graph, in the rows Y8-Y22 (270 CLBs):

| | Measured | Shipped (on the measured wires) |
|---|---|---|
| Tiles, sites, site types | 270, 1080, all right | |
| PIPs | 766 260, none that the shipped graph lacks | 780 300: 14 040 missing, all route-throughs and SLICEM-internal (52 per CLB) |
| Wires | 118 404 | 125 280 with a PIP or a pin: 7020 missing (the pins below); 35 736 more with neither |
| Pin wires | 23 220, all right | 30 780: 7560 missing (carry, SLICEM and XB / YB pins no design used) |
| Nodes, pieces of more than one wire (the shipped nodes cut to the measured wires) | 20 350 exact (84%), **none merged** | 24 252: 3902 still split |
| from observations only | 5743 exact (24%) | |
| + the tested predictions of the observed rules | 18 878 exact (78%) | |

The pieces still split: the global clock lines (576: `GCLKk` of a CLB to the CLBs above and below,
fed by the GCLKH rows; not switch-box rules: the clock network needs its own), the doubles and hexes
whose start is in a block-RAM or I/O switch box (the tests need a driver there: through a neighbouring
CLB and a confirmed join, or from an I/O pad or block RAM), and the END / END_S pairs at the edges
(both ends of a test would be from-wires: they join through the start in the I/O tile). Over the
whole array (only the band was tested) one piece is merged: the two wrong rule-decided joins of the
observations, which a test would have refused.

**What the measured CLB array lacks** (all 612 tiles): 52 PIPs per CLB, the route-throughs
(`F1_B_PINWIRE0 -> X0`: a path through a LUT, `CIN -> X`, `COUT -> YB`, `FX -> Y`, `SHIFTOUT -> XB`)
and the SLICEM's internal ones (`BYINVOUT -> SLICEWE`, `DIG -> ALTDIG`, `SHIFTOUT -> SHIFTIN`): the
database has no bits of their own for them, and the open flow takes a route-through only out of a
net's own source site (`COUT -> YB`); they are seen in ISE's routes (`# _ROUTETHROUGH`) or probed. The pins no design of these used: the carry chain (CIN,
COUT), XB / YB, the SLICEM's shift and RAM pins (SHIFTIN / SHIFTOUT, ALTDIG / DIG, SLICEWE1, BYOUT /
BYINVOUT) and FXINB: designs with carry chains, shift registers and distributed RAM give them. 28
wires per tile without a PIP in the database (those pins, and the long lines' test wires) are not
in it; the shipped graph's CLB tiles also have 129 wires each with no PIP and no pin there (the
taps of hexes and long lines that pass through: E6A1, LH1…), which no design can name: they belong
to nodes but no route turns there, so the router does not need them.
Sites, their types and every pin wire found are right; the bidirectional flag differs on 216 PIPs
(only the ones ISE was seen to write `=-` are marked; the census can ask both ways).

## 3. Cost

Measured here (one Intel Mac mini, Docker, one or two containers, shared with other work):

| Experiment | Size | ISE time |
|---|---|---|
| tile probe | 1206 candidates, 27 rounds | 4 min (fewer rounds now: `probe-run.mjs` spreads what is left over the round's designs) |
| site probe | 3521 candidates, 11 rounds, 88 designs | about 7 min |
| PIP census | 1 738 008 PIPs, 116 designs | 9 min |
| ISE routes random designs (`par -p`) | 4 designs, a quarter of the CLBs each, 100 k PIPs | 90 s (a design of every slice took par over 15 min: not worth it) |
| join tests, first designs | 41 479 nets, 29 designs | 19.5 min: about 90 ms per net, 30 ms of it per DRC error xdl2ncd reports (each source slice's unused LUT input was one) |
| join tests, lean designs (only the LUTs used) | 3873 nets, 6 designs | 49 s: about 17 ms per net |

The XC3S250E, all of it (an estimate from the above): about 200 000 join tests (the switch-box
rules and the name grammar over every switch box, the I/O and block-RAM switch boxes, the edges, the
clock network) at 17-20 ms, two or three rounds as new rules come: 2-3 hours; the census of every
tile (about 2.1 million PIPs): 15 min; tiles, sites, pads: 15 min; 20-40 designs for ISE to route
(I/O, block RAM, multipliers, DCM, clocks, carry chains, shift registers, distributed RAM): 30 min.
**About 3-5 hours of ISE per device**, which the scripts run unattended.

The work is in the irregular parts, each needing its observation designs, its hypotheses and its
tests (the CLB array is the regular part, done here in a few hours): the joins whose driver is an
I/O or block-RAM switch box (drive them through a neighbouring CLB and a confirmed join), the edges
and terminal tiles, the global clock network, the I/O tiles' sites and pins, the block RAMs and
multipliers (their site tile to the four interconnect tiles), the DCMs, the corners, the
route-throughs; then the full measured graph (Silinx's own rows and columns), the open flow on it
(its tests expect exact numbers of the shipped graph's routes), `scripts/check-open-flow.mjs`
byte-identical on the examples. **Estimate: 2-3 weeks for the XC3S250E** (the issue's estimate
holds), then **1-2 days per other device** (the XC3S100E, XC3S500E, XC3S1200E share the tile types and
the rules; their own tiles are the XC3S100E's DCMAUX, the XC3S1200E's side DCMs and long-line
splitters; ISE time grows with the chip: the XC3S1200E has about 3.5 times the XC3S250E's CLBs).

## 4. Findings

- The oracles are exact: every answer of ISE agreed with the shipped graph — 1.74 million PIP
  probes, 3521 site probes, 1206 tile probes, 45 928 join tests, 19 131 pin wires and 17 076
  single-candidate joins read from routed designs. The method can measure the device description.
- Joins decided by rules from ambiguous observations were wrong twice in 26 246: they must be tested
  like predictions.
- The bit database's features are per tile type, but a tile type's tiles do not all have every PIP
  (the break rows' CLB has no `GCLKk -> CLKn`, the top row no `FXk -> FX_Sk` / `COUT -> COUT_N`), and
  the I/O tile types share features they do not all have (3 refused in the first tests): a measured
  description needs the census of every tile. (Harmless for the bitstream writer, which only meets
  PIPs the device has.) The database now records them (#74: `absent` / `absentIn`,
  research/s3e-bitstream/pip-exceptions.mjs) and the router refuses them, so a description built
  from the database's features per type must leave them out too.
- The database's PIP list was measured, but its candidates came from the device report
  (`gen-pipcover.mjs`); the layout used the report's grid (`gen-layout.mjs`). If what ships must not
  depend on the report at all, the candidates need another source: observations, the name grammar and
  the census are cheap for the switch boxes; asking xdl -xdl2ncd about arbitrary wire pairs is not
  (20 errors per run).

## 5. Recommendation

The method works and is affordable in ISE time; the prototype shows it on the CLB array (84% of
the node pieces exact after two test rounds on the rows tested, no wrong join, every PIP, site and
pin it has right). Finishing it is the 2-3 weeks above, mostly the irregular tiles: worth doing as
its own piece of work, in this order: (1) tests driven through a neighbouring CLB, for the I/O and
block-RAM switch boxes and the edges; (2) the clock network; (3) the I/O, block-RAM / multiplier and
DCM sites and pins; (4) the census of every tile; (5) the full measured graph, compared until the
open flow routes legally on it, then shipped in place of the report-built one, with the tests'
expectations updated; (6) `scripts/check-open-flow.mjs` byte-identical. Until then the report-built
graphs stay, and serve locally to score the measured one.

## 6. Step 1: the I/O and block-RAM switch boxes (2026-10-17)

The first step of the recommendation above. A join whose ends are both outside the CLBs (an I/O or
block-RAM switch box, an edge) had no slice to drive its test. `joinTestDesigns` now searches back
from the tested wire over the tile's PIPs **and the joins already known** (observed in ISE's routes,
or confirmed by an earlier round of tests), up to `maxJoins` of them, to a slice output of any CLB:
e.g. slice -> OMUX -> W2BEG of a CLB, joined to W2MID of the I/O tile -> the tested wire. The path
never crosses the tested join's other end (it would join the two ends by itself), and the known
nodes are reserved whole (two tests never share one). Each round's confirmations make the next
round's paths: `prototype.mjs tests pred.json obs.json dir tested-dir...` (MAXJOINS, default 2).

Done again from scratch on the XC3S250E (the prototype's working folders were gone), ISE 14.7 in
Docker on the Intel Mac mini, one container at a time:

```
impl-remote.sh io bram mult arith                  # 4 HDL designs implemented by ISE: 91 pads, 4 block RAMs, 4 multipliers; 133 s
node prototype.mjs observe obs0.json */top.xdl
node candidates.mjs tiles obs0.json t.json && node probe-run.mjs t.json tiles.json        # 7 rounds
node gen-observe.mjs clb-tiles.txt obs 4 11 0.25 && ise-remote.sh -r obs/                 # 81 s
node prototype.mjs observe obs.json */top.xdl obs/*.r.xdl
SEG=1 node prototype.mjs predict obs.json switch-tiles.txt pred.json [t1 t2]               # minus the CLB-CLB joins
node prototype.mjs tests pred-edge.json obs.json t1 && ise-remote.sh -f t1 && node prototype.mjs verdicts t1
node prototype.mjs score t1                                                               # local scoring only
```

**Tile probe**, with I/O and block-RAM tiles in the observed designs: **all 780 switch-box tiles**
(612 CLBs), none accepted that the shipped graph lacks, none refused that it has (the prototype
found 778: the 2 missing prefixes are now observed).

**Observations**: 8 designs, 95 052 distinct PIPs, 1921 sites, 17 486 pin wires, 42 393 joins (16 797
with one candidate). 287 rules (517 with the name grammar) predict 118 832 joins not observed, 24 464
of them with an end in an I/O or block-RAM switch box.

| Round | Tests (designs, ISE time) | ISE's verdicts | Agree with the shipped graph |
|---|---|---|---|
| 1, across the observed joins | 13 825 (30, 238 s) | 10 721 joins, 3104 islands | **all** |
| 2, also across round 1's | 6681 (16, 113 s) | 5563 joins, 1118 islands | **all** |
| 3, also across round 2's | 570 (12, 41 s) | 462 joins, 108 islands | **all** |

By the kinds of the two ends: CLB-I/O 6858, I/O-I/O 4447, CLB-block RAM 6577, block RAM-block RAM 2926,
block RAM-I/O 268, every one agreeing. **3388 stay untestable**: their driven end is a wire only a site
of the I/O or block-RAM tile drives (the I/O tiles' and block-RAM tiles' OMUX, the hexes that begin in an
I/O tile: `BIOIS/N6BEG -> CLB/N6MID`, `LIOIS/E6BEG -> CLB/E6END`, `RIOIS/W6BEG -> CLB/W6END`, …). They need
a test source in a pad or a block RAM (an IOB's input, a block RAM's output), the next step together
with the I/O and block-RAM sites and pins (step 3 above).


### Round 4: tests driven from an IOB's input or a block RAM's output (2026-10-21)

`joinTestDesigns` takes the observed IOB inputs and block-RAM outputs as test sources too (`sourcesOf`,
`prototype.mjs tests` with `SOURCES=1`; an input-only pad is an IBUF site, placed in its own tile). On the 3388 joins
round 3 left untestable, crossing up to 3 known joins (`MAXJOINS=3 MAXDEPTH=5`), ISE 14.7 on the Mac mini:

| Round | Tests (designs, ISE time) | ISE's verdicts | Agree with the shipped graph |
|---|---|---|---|
| 4, from IOB / block-RAM sources | 717 (15, 54 s) | 423 joins, 294 islands | **all** |

By kinds: CLB-I/O 464, I/O-I/O 173, block RAM-CLB 34, block RAM-block RAM 25, block RAM-I/O 21. **2671 stay
untestable**: of them only 247 are in a tile with an observed source. The observed designs use 4 of the 12 block RAMs
(the block-RAM OMUX joins are 987 of the 2671) and their pads' inputs reach few of the I/O tiles' hexes. The next step:
observation designs that use every block RAM's outputs and every pad's input (ISE-routed HDL, as `impl-remote.sh io
bram`), then the same rounds.

### Round 5: every block RAM, every multiplier, every pad (2026-10-22)

Observation designs for the sources round 4 lacked (`gen-obshdl.mjs`, implemented by ISE from HDL): `bram`, the 12
block RAMs (LOC'd), every data and parity output into a register; `mult`, the 12 multipliers (LOC'd), every output
bit into a register; `pads`, 90 of the 92 pads, each an input into the logic (65 of them bidirectional, their outputs
and enables from registers). Observed with the eight designs before: 11 designs, 107 489 distinct PIPs, 2073 sites,
45 864 joins. Then the join tests of the 3388 joins round 3 left untestable, from the IOB and block-RAM sources
(`SOURCES=1 MAXJOINS=3 MAXDEPTH=5`), ISE 14.7 on the Mac mini (`ise-remote.sh` now takes `RWBASE`, a folder Docker
Desktop shares, #482):

| Round | Tests (designs, ISE time) | ISE's verdicts | Agree with the shipped graph |
|---|---|---|---|
| 5 | 986 (17, 58 s): 270 new, 716 of round 4's again | new: 184 joins, 86 islands | **all**; round 4's 716 the same verdicts |

**2401 stay untestable** (CLB-I/O 913, I/O-I/O 322, block RAM-CLB 954, block RAM-block RAM 157, block RAM-I/O 55;
1056 of them with an end on a block-RAM tile's OMUX). The new sources reach few of them: the block RAMs' and
multipliers' outputs leave through the few output-multiplexer lines ISE's router chose, and a pad's input reaches its
I/O tile's hexes only where ISE routed it that way. To reach them: tests that drive each output
line on purpose (a routed path chosen by Silinx, from a block-RAM output pin through each OMUX line, as
`joinTestDesigns` does from slices), the next round. Rounds 1-5: 22 063 tests, no disagreement with the shipped graph.


### Round 6: every block-RAM output line (2026-10-23)

Round 5's 1056 untestable joins on a block-RAM tile's OMUX had a cause in the tests, not in the sources: the block-RAM
tiles' PIPs came from ISE's routes only, so the OMUX lines ISE never took looked absent, and a block RAM's output was
placed on its site tile's pin wire with nothing joining it to the interconnect tile. `prototype.mjs tests` now takes,
with `DBPIPS=1`, the block-RAM tiles' PIPs from the bit database too (their own features and the CLB's switch box,
less `absent`, #74), and with `SOURCEXDL=…` the join where each output enters its interconnect tile, read from ISE's
routed designs (`blockRamOutputJoins`: `BRAMSITE2/RAMB16_DOA0 -> BRAM_DOA0_INT0`, joined to `BRAM0_SMALL/BRAM_DOA0`).
A first run without that join gave 1503 islands, 1050 of them against the shipped graph: the test's own path was
cut at the site tile, not the join under test.

| Round | Tests (designs, ISE time) | ISE's verdicts | Agree with the shipped graph |
|---|---|---|---|
| 6 | 2106 (19, 329 s): 1120 new, 986 of rounds 4-5 again | new: 749 joins, 371 islands | **all**; the 986 the same verdicts |

**Every block-RAM join is tested.** 1281 stay untestable, all of the I/O tiles (CLB-I/O 907, I/O-I/O 321, block
RAM-I/O 53): the hexes that begin in an I/O tile and its OMUX, which a pad's input reaches only where ISE routed it.
The next step: the same for the I/O tiles (their PIPs need the arc probe per type, the database sharing them between
types). Rounds 1-6: 23 183 tests, no disagreement.

### Round 7: the I/O tiles' switches asked of ISE, tile by tile (2026-10-24)

The database shares the I/O tiles' switches between their types (and names their wires as the CLB's, `rename`), and
three of them were refused in round 1, so round 6 kept the I/O tiles to the PIPs ISE's routes showed. Round 7 asks
`xdl -xdl2ncd` itself, in each tile: `candidates.mjs io obs.json` gives every feature of each observed I/O tile's type
(its own and the CLB switch box's) in the tile's wire names (`IOIS_<name>` where ISE's routes showed one), less what
the routes showed there and what the type lacks (`absent`, #74): 204 603 candidates in 120 tiles. Asked whole, at
about 28 % refused (each refusal is one of xdl's 20 errors per design), that census would take some 7 hours; asked
only for the joins left (the PIPs into their I/O-tile wires and into those PIPs' from-wires: 7590), 20 rounds of the
arc probe (`probe-run.mjs`): 4476 exist, 3114 not. `prototype.mjs tests` takes them with `PROBED=probe.json`, each in
the tile where ISE accepted it.

| Round | Tests (designs, ISE time) | ISE's verdicts | Agree with the shipped graph |
|---|---|---|---|
| 7 | 2850 (24, 405 s): 744 new, round 6's 2106 again | new: 511 joins, 233 islands | **all**; the 2106 the same verdicts |

**537 stay untestable** (CLB-I/O 448, I/O-I/O 73, block RAM-I/O 16): mostly the hexes that begin in a bottom or top
I/O tile (`BIBUFS/N6BEG2 -> CLB/N6MID2`) and some I/O OMUX lines, which no pad input observed reaches within the
probed depth. Next: the probe one step deeper for those, then the sites' pins and the irregular tiles. Rounds 1-7:
23 927 tests, no disagreement.

### Round 8: the I/O tiles with no pad (2026-10-24)

Probing deeper was not what the 537 joins round 7 left needed: nearly all of them already had a probed PIP into their I/O
end. That PIP started at the tile's own site pins (`IOIS_Y0 -> OMUX12`, `IOIS_Y0 -> N6BEG1`), so a test needed a source in
that very tile. **515 of the 537 were in 58 I/O tiles with no pad in the CP132**: no HDL design reaches them on that
package. Two kinds of source, both ISE 14.7 on the Mac mini:

- **The same die in another package.** The XC3S250E's FT256 bonds all 172 of its user I/O. `gen-obshdl.mjs --inputs 170`
  makes every pad an input (an XOR of them all into one register, so each IOB's I pin is used), implemented by ISE for
  `xc3s250e-ft256-4` (no warning, 37 s): IOB inputs in 103 tiles. `prototype.mjs tests` with `SOURCEOBS=obs-ft256.json`
  takes the IOB sources from that observation (an IOB's site is its package pin) and `PART=xc3s250eft256-4` writes the
  tests for that package. The tiles, the wires and the joins are the die's, the same in every package.
- **The unbonded IOB sites.** 15 tiles have no pad in any package (the left column's LIOIS_X0Y3, X0Y12…). With
  `UNBONDED=1` (`testSources`), an I/O tile of the joins with no input observed takes its unbonded IOB sites (`NOPADk`,
  from the device report, like every site name) as sources, an IBUF on each. The I pin's wire comes from an observed tile
  of the same type at the same position, else `Ik_PINWIRE` for the tile's k-th IOB, the rule every observed one follows.
  ISE's DRC reports each such pad as an illegal placement (797), and its net checks, the tests' verdicts, run as usual.

| Round | Tests (designs, ISE time) | ISE's verdicts | Agree with the shipped graph |
|---|---|---|---|
| 8a, FT256 sources | 378 (14, 43 s) | 192 joins, 186 islands | **all** |
| 8b, unbonded sources | 134 (7, 24 s) | 79 joins, 55 islands | **all** |

14 more are **implied** by the joins already known (long lines whose taps the known joins link end to end), as the shipped
graph has them. **11 stay untestable**: eight vertical long lines whose two ends are 24 rows apart (`RIOIS_X27Y2/LV0 ~
RIOIS_X27Y26/LV0`), which no source reaches within the search's limits (3 joins, 5 PIPs; 6 and 8 add none), and three
hexes that begin in LIOIS_X0Y3, reached only through a hex whose join no design shows. **Every I/O tile's join is now
tested but these**. Rounds 1-8: 24 439 tests, no disagreement with the shipped graph. Next (#3): the sites' pins, then
the irregular tiles.

```
PART=xc3s250eft256-4 node gen-obshdl.mjs hdl --inputs 170 && PART=xc3s250e-ft256-4 impl-remote.sh inputs
PART=xc3s250eft256-4 node prototype.mjs observe obs-ft256.json hdl/inputs/top.xdl
PART=xc3s250eft256-4 SOURCEOBS=obs-ft256.json PROBED=probe7.json DBPIPS=1 SOURCES=1 SOURCEXDL=… MAXJOINS=3 MAXDEPTH=5 \
  node prototype.mjs tests left7.json obs.json t8 t1 … t7            # left7: the joins rounds 1-7 left
UNBONDED=1 PROBED=probe7.json DBPIPS=1 SOURCES=1 SOURCEXDL=… MAXJOINS=3 MAXDEPTH=5 \
  node prototype.mjs tests left8.json obs.json t8b t1 … t8           # left8: t8's untestable
ise-remote.sh -f t8 && ise-remote.sh -f t8b && node prototype.mjs verdicts t8 t8b
```

## 7. Step 3: the sites' pins (2026-10-24)

Which tile wire each pin of a site is attached to, for the sites the open flow places: the I/O blocks (IOB, IBUF, DIFFM /
DIFFS and their input-only kinds), RAMB16, MULT18X18SIO, DCM and BUFGMUX (the slices: section 2). The others (BSCAN, ICAP,
CAPTURE, STARTUP, PCILOGICSE, PMV, the RESERVED_* sites) are hidden from the open flow (`HIDDEN_SITES`, core/xdl.js) and
left out. Observed in ISE's routes: a net's source pin is on the from-wire its PIPs leave and no other PIP drives, a sink
pin on the to-wire its PIPs end on, when the sink is the net's one sink in its tile.

- **The observer** (`observeNet`) read pin wires only outside the wire families, and the clock tiles' pins are clock wires.
  It now also takes a clock wire that no other tile's wire continues in the net (a BUFGMUX's I0 on `CLKT_GCLKIN00`, a
  DCM's CLKIN), when the tile has no plain wire to take. A `…GCLK_PINWIRE…` is no clock line (`wireFamily`): a
  BUFGMUX's O leaves `CLKT_GCLK_PINWIRE1`. On the 99 designs below, the joins and their candidates are unchanged and no
  pin fact is lost, with 1116 more pin facts.
- **The designs:** 94 that ISE implemented for the XC3S250E in the bit database's experiments (IOB registers, IDDR2 /
  ODDR2, bidirectional pads, DCMs, block RAMs, global and side clocks, `top.xdl` next to its `par.log`), and 8 of
  `gen-obspins.mjs`, which give every pin a signal of its own (one shift register's bits):
  - `ramwide` / `ramnarrow`: every block RAM as `RAMB16_S36_S36` and as `RAMB16_S1_S1`;
  - `multcasc`: the multipliers in cascade chains up each column, every register, enable and reset;
  - `dcmpins`: the four DCMs with a variable phase shift;
  - `iobddr`: every pad with an IDDR2, an ODDR2 for the data and an ODDR2 for the tristate (one SR and one REV per IOB:
    map refuses registers of one IOB on different ones);
  - `iobclk2-0/1/2`: the pads at each position of their tile on a DCM's CLK0 / CLK180 / CLK90, so that ICLK2 and OTCLK2
    are each their net's one sink.

  ISE implements them with no error; par finds a DCM's STATUS 3-7 unrouteable (they lead nowhere).
- **Result** (`prototype.mjs pins obs.json`, against the shipped graph, local scoring only): **17 509 pin facts, every one
  right**. By pin name:

| Site | Pin names observed | Not observed |
|---|---|---|
| RAMB16 | 180 of 180 | |
| BUFGMUX | 4 of 4 | |
| MULT18X18SIO | 97 of 115 | BCIN0-17: the cascade is a wire with no PIP in the upper tile. ISE's route ends in the tile below (`MULT_CARRYB_BCOUTk`), on BCIN's node in the shipped graph for all 180 cascade nets |
| DCM | 20 of 41 | CTL\*, FREEZE\*, STSADRS\*, CONCUR (test pins, no port of DCM_SP); DSSEN (map trims it); STATUS 3-7 (unrouteable) |
| IOB, DIFFM, DIFFS | 16 of 29 | DIFFI_IN, DIFFO_\*, PADOUT, PCI_\* (differential and PCI); IDDRIN / ODDRIN / ODDROUT (DDR_ALIGNMENT C0 / C1, which the open flow refuses); T (map drives the tristate through T1) |
| IBUF, DIFFMI, DIFFSI | 5-7 of 29 | the same, and the output and tristate pins an input-only site does not use |

By tile type, each pin was observed only in the I/O tile types and positions with a bonded pad in the CP132 (26 of the
54 I/O tile type and site position pairs).

### The I/O tiles with no pad (2026-10-24)

The same die in its FT256 (round 8): `gen-obspins.mjs --pads obs-ft256.json` writes the I/O designs (`iobddr`,
`iobclk2-0/1/2`) on the pads of the FT256 observation, each pad's place in its tile from its I pin's wire
(`observedPads`). ISE implements the four designs for `xc3s250e-ft256-4` with no error. `prototype.mjs pins obs.json
obs-ft256.json` renames the FT256's pads to the CP132 description's sites (`renamePads`: the k-th I/O site of its tile by
`Ik_PINWIRE`; the slices', block RAMs' and VCC sites' names are the same in every package): **23 753 pin facts, every
one right** (6244 from the FT256), so the renaming holds too.

**35 of the 54 (I/O tile type, position) pairs are observed.** The 19 others are sites that no package of the XC3S250E
bonds: the third IOB of the `_PCI`, `_BRK` and `_CLK_PCI` I/O tiles, the first two of the left and right input-only
tiles. No design can place on them from HDL, and neither can the open flow. Round 8b drove its tests from such sites
(an IBUF on `NOPADk`): its 79 join verdicts from IBUF sources confirm their I pin's wire (`Ik_PINWIRE`, as the shipped
graph has it), 3 of the 19 positions among them. The rest stay unmeasured, of no use to the open flow. Next (#3): the
irregular tiles.

```
PART=xc3s250eft256-4 node gen-obspins.mjs pinsft --pads obs-ft256.json && PART=xc3s250e-ft256-4 impl-remote.sh iobddr iobclk2-0 iobclk2-1 iobclk2-2
PART=xc3s250eft256-4 node prototype.mjs observe obs-ft256.json inputs/top.xdl pinsft/*/top.xdl
node prototype.mjs pins obs.json obs-ft256.json
```

```
node gen-obspins.mjs pins && impl-remote.sh ramwide ramnarrow multcasc dcmpins iobddr iobclk2-0 iobclk2-1 iobclk2-2
node prototype.mjs observe obs.json …/top.xdl pins/*/top.xdl && node prototype.mjs pins obs.json
```

## 8. Step 4: the irregular tiles, part 1: the clock network observed (2026-10-24)

Per tile type of the shipped graph, against what the observations and rounds 1-8 measured: the switch boxes and the I/O
and block-RAM tiles are tested; **the global clock network had no join known** (GCLKH, GCLKV / GCLKVC, CLKV, CLKH, the
block-RAM columns' GCLKH feed-throughs), though ISE's routes use all its PIPs. On a clock net, every clock wire of the
net in another tile is a candidate for each undriven one (`observeNet`: one family, `gclk`), so all of them stayed
ambiguous (9432 wires, 406 550 candidates), and no test round drove a clock line.

- **The intersection** (`intersectAmbiguous`, `prototype.mjs observe` with `INTERSECT=1`): a wire is driven by the
  same join in every net that leaves it undriven, so its driver is in the intersection of their candidates. In the
  net's source tile the wire may be the source pin's own (a side BUFGMUX's `CLKL_GCLK_PWOk`), so `observeNet` marks
  those entries (`src`) and the intersection leaves them out. Before that mark, 14 of the first 465 single survivors were
  such pins. On the 102 designs of step 3: 664 more joins, every one right in the shipped graph; 3494 wires left
  ambiguous.
- **Clock observation designs** (`gen-obsclk.mjs`, 6 designs implemented by ISE, 267 s): 8 global clocks (the top and
  bottom BUFGMUX, LOC'd), each on the flip-flops (FD, LOC'd) of every CLB tile in a random half of the 104 clock cells (a
  CLB column by a band of rows round a GCLKH row), at most 4 clocks a tile. With them, 108 designs: 41 774 joins, 9389
  more, all right but 2 rule-decided E2 doubles across the block-RAM column (`resolveAmbiguous`'s joins stay hypotheses:
  4 of its 7354 are wrong). Clock joins: 55 known (CLKT, CLKB, CLKC, GCLKVC), all right.
- **What the intersection cannot settle:** 5793 clock wires stay ambiguous, the true driver always among the candidates
  (in all 5793). What remains: the spine wires every net of a line carries (CLKC, CLKT / CLKB, GCLKVC, GCLKVML / R) and,
  for a CLB's GCLKk, the GCLKH rows above and below in its column (`GCLKH_GCLK_DNk`, `_UPk`). Observation cannot remove
  a wire every net contains.

Next (#3): **tests of the clock joins**. The test sources are a BUFGMUX's output: its pin wire is known since step 3,
`CLKT_GCLK_PINWIREk`. The tests go down the spine join by join, each verdict making the next one's path, as rounds 1-3
did across the switch boxes. They are few per design, since a global line is one node across the chip. Then the edge
(terminal) tiles and the corners.

```
node gen-obsclk.mjs clk 6 1 && impl-remote.sh clk0 … clk5
INTERSECT=1 node prototype.mjs observe obs.json …/top.xdl clk/*/top.xdl
```
