# Spartan-3E device descriptions measured black-box (2026-10-11)

Issue [#3](https://github.com/pmnmalo/Silinx-ISE/issues/3). The device descriptions that ship with
Silinx (`packages/silinx-fpga/devices/*.json.gz`: tiles, sites, wires, PIPs and the nodes that join wires across
tiles) are today computed from ISE's device report (`xdl -report -pips -all_conns`,
`research/s3e-route/build-device.mjs`). The bit database (`packages/silinx-fpga/bitdb`) was instead
measured: designs written by Silinx, implemented by ISE, their outputs compared. This folder works
out how to obtain the device descriptions the same way, from what Silinx observes when ISE runs on
designs it writes, so that what ships derives from Silinx's own measurements (the open legal
question in [docs/OPEN-TOOLCHAIN.md](../../../../docs/OPEN-TOOLCHAIN.md)).

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
| `build.mjs` | Measurements -> the packed format of the shipped graphs (`packages/silinx-fpga/src/fpga/device.js`) |
| `measure.mjs` | The XC3S250E's recipe for another die, in stages: `designs` (every observation design, sized to the part), `observe`, `tiles` (the tile probe: switch-tiles.txt, clb-tiles.txt), `random`, `round k` and `verdicts k` (the join tests' rounds) (#3, the other devices) |
| `prototype.mjs` | The phase-2 prototype: observe, predict, tests, verdicts, build the measured CLB array, compare it with the shipped graph; `score`: the tests' verdicts against the shipped graph |

What the experiments produce (ISE's routed XDL and logs, the candidates, the verdicts) stays in the
working folders, out of the repository; only the scripts and this record are here.

## 1. Method

### What the description holds, and what Silinx needs of it

The packed description (`packages/silinx-fpga/src/fpga/device.js`) holds, per device: the tile grid (name, row, column,
type of every tile); per tile *template* the wires, the PIPs (from, to, bidirectional, route-through)
and the sites with the tile wire of each pin; per tile its sites' names and whether a pad is bonded;
and the *nodes*, the sets of tile wires joined by metal. The open flow uses it to place (sites), route
(nodes and PIPs), time (`timing.js`: node classes from the wire names and the delay table, the
fastest routes over the graph) and write the bitstream (the PIP and pin names, which the bit
database knows by tile type).

The router of the open flow only takes PIPs whose bits are measured (`knownRouting`,
`packages/silinx-fpga/src/fpga/bitgen.js`). So a measured description needs, for routing, the PIPs of the bit database
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
CAPTURE, STARTUP, PCILOGICSE, PMV, the RESERVED_* sites) are hidden from the open flow (`HIDDEN_SITES`, packages/silinx-fpga/src/xdl.js) and
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

### Part 2: the clock joins tested (2026-10-24)

A test of rounds 1-8 (a net from a source to one end, a PIP out of the other) reserves its nodes whole, and a global
line is one node across the chip: 8 tests to a design. And DRC names a net with islands, never which PIPs. So
`clocktests.mjs` tests by removal, on ISE's own clock nets (legal trees). For a tile's clock wire f and a row candidate
c (a GCLKH tile's wire), the test is ISE's net N of a BUFGMUX that has both, kept to its spine and row tiles' PIPs,
without the PIP into c, with N's PIP out of f. DRC finds an island exactly when f is driven through c; the other row
wires' PIPs lead nowhere (antennas, expected). Every tenth test also runs as a control, with the PIP into c kept: no
island. The nets of one design share no wire and no buffer.

- **Sparser observations first** (`gen-obsclk.mjs` with p = 0.25, 12 designs, 456 s): with the intersection, the
  hypotheses (each ambiguous clock wire with each row candidate) fell from 128 842 to 25 811, and 5733 more joins came,
  all right. Most wires were left with two row candidates, the UP and DN wires of their band's GCLKH tile, which every
  net through that cell has.
- **A pilot** (36 designs): 38 verdicts, every one as the shipped graph has it, each wire with exactly one join.
- **(A) the wires with at most two row candidates** (`MAXROW=2`): 912 designs, 6981 tests. The Mac mini rebooted
  during the copy back (about 14:11) and 314 designs ran again once Docker was up (798 s). **(B) the others**
  (`PICK=…`): for each wire (A) did not settle, the one candidate a rule of (A)'s joins matches (`joinRule`: the same
  wires at the same offset), 251 designs, 1611 tests.

| Tests | Designs (ISE time) | Verdicts | Against the shipped graph |
|---|---|---|---|
| (A) 6981 | 912 (about 2500 s) | 3535 joins, 2811 islands, 635 controls clean | **all agree** |
| (B) 1611 | 251 (601 s) | 1464 joins, 147 controls clean | **all agree** |

**4999 clock wires settled**, each with exactly one join. A GCLKH row drives its column's tiles above and below
(`GCLKH_GCLK_UPk` / `_DNk`); the block-RAM columns' GCLKH tiles do the same. 85 more have no row driver among their
candidates (a spine wire drives them). Left of the 5973: **619 with only spine candidates** (the rows' own inputs,
`GCLKH_GCLK_Bk`…, fed by the spine: a test would cut the spine itself) and 270 with more than two row candidates and no
single rule match. Next (#3): those, then the edge (terminal) tiles and the corners.

### Part 3: the spine-fed clock wires, the edge tiles and the corners (2026-10-24)

**The spine-fed clock wires** (the rows' own inputs, `GCLKH_GCLK_Bk`…, whose candidates are all spine wires). Cutting a
spine wire c cuts what else of the net hangs below it, so `clocktests.mjs` (`SPINE=1`) keeps only the spine's PIPs
(the rows' left out, since every row below c would show an island), and adds a **baseline** for each net and candidate:
the same net without f's PIP. The test means something only when its baseline is clean (nothing of the kept spine
below c). The first round takes each wire's candidates in its own row first, a spine's (`NEAR=1`); for the 270 wires
with more than two row candidates, those in their own column first, a row's (where every join of (A) and (B) is). A
second round (`SKIP=…`) takes the other candidates of the wires still unsettled.

| Tests | Designs (ISE time) | Verdicts | Against the shipped graph |
|---|---|---|---|
| spine, first round (1554) | 219 (561 s) | 570 joins, 452 islands; baselines 504 clean, 12 not (16 tests say nothing) | **all agree** |
| rows, first round (796) | 213 (522 s) | 165 joins, 558 islands, 73 controls clean | **all agree** |
| spine, second round (254) | 36 (86 s) | baselines 3 clean, 101 not (147 tests say nothing); 3 islands | **all agree** |
| rows, second round (1554) | 318 (707 s) | 1412 islands (the candidates of other columns), 142 controls clean | **all agree** |

With part 2: **5734 of the 5973 ambiguous clock wires settled**, each with exactly one join, every one in its own
column or row. **239 stay**: the spine's own wires (GCLKVC 33, GCLKVML / GCLKVMR 16) and rows whose spine candidates lie
upstream of others (their baselines are not clean); a test of them would cut the spine at its middle and keep its
upper half.

**The edge (terminal) tiles and the corners.** In the routes, 1626 of their PIPs' wires are seen, 1228 with a known
join. `edgejoins.mjs` makes the hypotheses: each known join of an edge tile as a rule (`joinRule`: the same wires at the
same offset), applied to every tile of its prefix whose wires the routes showed in a tile of that type (2537), and the
observations' ambiguous joins with a candidate in such a tile (4190, the clock lines' left to `clocktests.mjs`). Then
the join tests of rounds 1-8 (`prototype.mjs tests`, the round 8 sources, `UNBONDED=1`):

| Tests | Designs (ISE time) | ISE's verdicts | Agree with the shipped graph |
|---|---|---|---|
| 4939 | 133 (522 s) | 1382 joins, 3557 islands | **all** |

**1499 of the 1626 edge wires** now have a known join. The corners (UL, UR, LL, LR, CNR_\*) are the thinnest, 95 of 132.
1788 hypotheses have no test source within the search's limits (3 joins, 5 PIPs), most of them CLB-edge and I/O-edge
hexes and long lines (`CLB ~ RTERM` 242, `LIOIS ~ LTERM` 186, `CLB ~ LTERM` 181…).

**#3 now stands at:** every part of the description the method lists (tiles, sites and their types, the sites' pins,
the PIPs, the joins of the switch boxes, the I/O and block-RAM tiles, the clock network and the edges) measured, every
measurement agreeing with the shipped graph. Left: the 239 spine wires, the 1788 untestable edge joins and the 11 joins
round 8 left, then building the measured description and comparing it whole (steps 5-6 of the recommendation).

```
SPINE=1 NEAR=1 SKIP=c2,c3 node clocktests.mjs tests obs.json cS …/top.xdl     (then SKIP=c2,c3,cS,cM for the second round)
NEAR=1 SKIP=c2,c3 node clocktests.mjs tests obs.json cM …/top.xdl
node edgejoins.mjs obs.json edge.json t1 … t8b && UNBONDED=1 … node prototype.mjs tests edge.json obs.json te t1 … t8b
```

```
node gen-obsclk.mjs clkb 12 100 0.25 && impl-remote.sh clk0 … clk11
INTERSECT=1 node prototype.mjs observe obs.json …/top.xdl clk/*/top.xdl clkb/*/top.xdl
MAXROW=2 node clocktests.mjs tests obs.json c2 …/top.xdl && ise-remote.sh -f c2 && node clocktests.mjs verdicts c2
PICK=c2 node clocktests.mjs tests obs.json c3 …/top.xdl && ise-remote.sh -f c3 && node clocktests.mjs verdicts c3
```

```
node gen-obsclk.mjs clk 6 1 && impl-remote.sh clk0 … clk5
INTERSECT=1 node prototype.mjs observe obs.json …/top.xdl clk/*/top.xdl
```

## 9. Steps 5-6: the measured description of the whole chip, and the examples on it (2026-10-24)

`chip.mjs` builds the whole chip in Silinx's packed format (`build.mjs`), from the measurements only:

- **PIPs of a tile:** the bit database's features of its type (an I/O tile's in its own wire names, as `candidates.mjs
  io`), less `absent` and the arc probe's refusals in that tile; and every PIP ISE's routes took in a tile of the type.
- **Pins:** where observed.
- **Joins:** observed, or confirmed by the tests of rounds 1-8, the edge tiles and the clock network.
- **Sites:** names, types and bonding from the device report, as round 8 took them.

`prototype.mjs compare` measures it against the shipped graph; then the open flow routes the examples on it
(`SILINX_CONFIG_DIR=…`, the measured graph in its `devices/`). `scripts/check-open-flow.mjs` gives ISE's verdict.

**What the first build lacked**, each found by the examples and measured in turn:

- **The clock spine.** No slice's clock was reached from a global buffer: the spine's joins (`CLKT_GCLK_MAINk ->
  GCLKVM*_GCLKCOREk -> GCLKVC -> GCLKH`) were among the ambiguous ones, and the removal tests of step 4 cut them. They
  are the join tests of rounds 1-8 again, driven from a BUFGMUX's output (`BUFGSRC=1`, `testSources` `bufg`, an
  instance of no input in the test's XDL): 3 rounds, 476 + 2168 + 3067 tests (every spine hypothesis), 387 joins,
  **every verdict agreeing**. The clock then reaches all 2448 slices from a top or bottom buffer.
- **The carry chain.** ISE's routes put their counters in the SLICEL columns. `gen-obscarry.mjs`: 32-bit counters, each
  in 16 slices of one column (AREA_GROUP), every SLICEM and SLICEL column, two band offsets. A chain's lower CIN is a
  sink in a tile where its net has no PIP (`COUT3 -> COUT_N3` in the tile below): the observer records it as on that
  wire's node (`pinJoins`), and `chip.mjs` names its wire CIN<k> of the slice's own COUT<k>, the index every observed
  carry pin follows.
- **The slices' CE / SR.** These nets reach several slices of a tile, so a sink pin was rarely its net's one in its tile.
  `gen-obsslice.mjs`: a flip-flop on every slice, its CE, R and D on the 4 nets of its position (one sink per tile).
- **F5 / FX / FXINA / FXINB.** `gen-obsmux.mjs`: 300 16:1 multiplexers (MUXF5-MUXF8), placed by ISE.
- **XB / YB.** ISE's own designs never use them, not even for its comparators. So the evidence is Silinx's routes of
  four examples on the shipped graph (`XBk -> OMUX`), whose DRC ISE runs clean (an island if the pin's wire were
  wrong). Only their pins are taken (`chip.mjs --ft`), not their PIPs or joins.
- **The observer:**
  - the last loose ends of a net are joined: one undriven from-wire and one end no PIP or pin takes, in two tiles. This
    is a clock pad's `IOIS_IBUF0` into `CLKT_CKI4`: 2729 joins, all right;
  - a block-RAM pin's family drops the interconnect index after `_INT` (`BRAM_CLK2_INT1` is `BRAM_CLK2`'s): the block
    RAMs' clocks;
  - the I/O tiles' `VCC_PINWIRE` is `IOIS_VCC_WIRE`, the database's `rename` read backwards.
- **Rules** (`PINRULES=1`), each pin they give checked by ISE where a route uses it: 16 pins, and the count is printed.
  - a slice pin seen in one CLB type is used in the other (`CENTER_SMALL` / `_BRK`, the same slices);
  - an XB / YB a position never showed takes the index of its COUT;
  - a VCC site's VCCOUT is on its type's one `*VCC*` wire.

**Result: all seven examples, routed by the open flow on the measured graph, pass ISE:** no open-flow warning, xdl2ncd
and DRC with 0 errors and 0 warnings, and Silinx's `.bit` byte-identical to ISE's bitgen with CRC on and off (gates,
traffic, blinky, pong, stopwatch, clock, vga).

The graph against the shipped one (`compare`):

| Part | Measured graph |
|---|---|
| Tiles, sites, site types | every one, the same |
| Pins | every one present is the shipped wire; 22 796 missing, the slice's RAM / shift pins and the like (no example uses them) |
| PIPs | 62 757 of 2 139 368 missing, mostly route-throughs and I/O wires not yet named; 9732 extra (the I/O tiles' `X1 -> E2BEG5`…, which should be `IOIS_X1`, the naming ambiguity of the database's I/O features: no route took one) |
| Nodes | 131 996 exact, 46 646 split (missing joins), 2 merged (the two rule-decided E2 doubles across a block-RAM column) |

It is 727 KB (the shipped graph is 1.96 MB). Replacing the shipped graph with it is a decision of its own, not made
here. Before that: the I/O wire names (an arc probe of each name's forms per type), the route-throughs, the joins still
split, and the other devices.

```
node gen-obscarry.mjs carry && node gen-obsslice.mjs slc && node gen-obsmux.mjs mux && impl-remote.sh …   (ISE)
BUFGSRC=1 SOURCES=1 … node prototype.mjs tests spine.json obs.json sp1 t1 … (rounds sp1-sp3)
INTERSECT=1 node prototype.mjs observe obs.json …/top.xdl
PINRULES=1 node chip.mjs measured.json.gz obs.json --ft obs-ft256.json,obs-xb.json --probe probe7.json --tests t1,…,sp3 --clock c2,…,cM2
SILINX_CONFIG_DIR=cfg node scripts/check-open-flow.mjs examples/gates … examples/vga     (cfg/devices/xc3s250ecp132-4.json.gz: the measured graph)
```

## 10. Toward replacing the shipped graph: the split nodes, the I/O names, the PIPs of each tile (2026-10-25)

The whole-graph comparison of section 9, read by the risk each gap carries for the open flow: a PIP or a pin missing only
narrows the router's choice; a **split node** lets it put two nets on one wire (a short), a **merged** one makes a net
look connected that is open, an **extra PIP** is a route ISE refuses. The plan (#3): the split and merged nodes first,
then the extra PIPs (the I/O names), then the pins of the features no example uses, then the acceptance (the comparison
clean, the 7 examples and the 45 `test/fixtures/open-flow` designs through ISE, the quality comparison).

**The split nodes.** None of the 46 646 hid a tested join that went missing: 22 929 were predicted and never tested, 23 717
never predicted. The rounds, every verdict against the shipped graph (local scoring only):

| Round | Hypotheses | Tests (designs, ISE time) | Joins / islands | Agree |
|---|---|---|---|---|
| u1 | `SEG=1` over the whole chip (128 723) | 123 843 (48, 2092 s) | 66 791 / 57 052 | all but 4, and those 4 were invalid (below) |
| u2 | the joins rules decided (below), u1's untestable | 20 526 (33, 528 s) | 18 248 / 2278 | all but 1, invalid |
| u3 | the rest, from the cleaned observation | 945 (8, 47 s) | 890 / 55 | all |
| u4 | `SEG=pairs`: a segment's taps pairwise | 2480 (25, 139 s) | 459 / 2021 | all |
| u5, u6 | the edge tiles (`edgejoins.mjs`) | 6382 + 1056 (229, 899 s) | 2317 / 4663 | all |
| u7 | the hex taps whose BEG is in an I/O tile, driven from a pad | 2380 (89, 888 s) | 1854 / 526 | all |

- **The joins rules decided are hypotheses.** `observe` wrote `resolveAmbiguous`'s joins (18 101: a wire's one candidate
  a rule of the joins found matches) with the observed ones, and the tests drove across them as known: two were wrong
  (`CLB_X8Y34/E2BEG4 ~ CLB_X18Y34/E2END4`, `…5`, a rule across the block-RAM column), the 2 merged nodes of section 9,
  and the 13 tests whose route crossed them (u1, u2) failed whatever the tested join (`invalid`). They are now apart
  (`decided`), `predict` sends them to the tests, and a test not run or invalid is asked again. The 1093 joins only 9
  designs showed, whose routes are gone (another session's folder), are hypotheses too; every one of the 44 505 joins seen
  in the 117 designs left is right.
- `segmentRules(…, { pairs: true })`: each tap of a double or a hex to every later tap (a segment whose BEG no test can
  drive); `edgejoins.mjs` no longer asks again a join a test refused.
- The test router may take the measured graph's PIPs of the I/O and block-RAM tiles (`PROBED`): a PIP a tile lacks makes
  ISE refuse the design (not run), never a wrong verdict. A test net with a loop (`LIOIS_BRK_X0Y25/S2BEG7` driven twice)
  crashes ISE's DRC (`RUG CREATION PROBLEM`): left out.

**The I/O names.** The database names an I/O tile's wires as a CLB's (`rename`: IOIS_X0 is X0); `chip.mjs` took
`IOIS_<name>` only where ISE's routes named it, and no route takes an I/O tile's `X` output (a pad's input reaches
`IOIS_Y`). The arc probe: of the 9210 PIPs of the I/O tiles with an end in either name (`X`, `XQ`, `Y`, `YQ`, `XB`, `YB`,
`F#_B#`, `G#_B#`), **9182 exist**, `IOIS_X0 -> OMUX…` among them, the 28 others mixing the two names. `chip.mjs` now
takes the names the probe found too (`--probe a.json,b.json`): the 9732 extra PIPs of section 9 go.

**The PIPs of each tile.** A PIP a tile had only by its type (seen in another tile of the type, or a feature of the
database's) was not asked in the tile. The arc probe of every PIP of the non-CLB tiles that neither ISE's routes nor the
probe showed there (299 713, 95 rounds, 74 min) and of the PIPs seen only in another tile of the type (3440): **448 + 36
refused**, the extra PIPs of the comparison (`CLKV_OMUXk_OUTLk -> CLKV_OUTLk`: the CLKV tiles have none left,
`Ik_PINWIRE -> IOIS_IBUFk`, `GCLKH_GCLKk -> GCLKH_GCLK_UPk` in the block-RAM columns' clock rows,
`MULT_CCARRY_BCOUTk -> MULT_CARRYB_BCOUTk`).

| | Section 9 | Now |
|---|---|---|
| Nodes split / merged | 46 646 / 2 | 12 217 / 0 |
| PIPs extra | 9732 | 66 (`FX2 -> FX_S2`, `COUTk -> COUT_Nk`: in the CLB rows the routes saw them in, given to the type) |
| PIPs missing | 62 757 | 52 423 (the route-throughs, the `STUB_IOIS_*` PIPs, which have no bits: the router does not take them) |
| Pins wrong / missing | 0 / 22 796 | 0 / 22 796 |

The 12 217 split left: hex and double taps whose segment starts in a tile no test drives (`W6END ~ W6MID` where the BEG is
in a right I/O tile), the I/O tiles' `OMUX` to the CLBs' `OMUX_S` / `OMUX_N` (a pad's input reaches only `IOIS_Y`), the
I/O and block-RAM columns' clock lines (`TIOIS/GCLKk` to the CLB's: ISE's clock nets into I/O registers and block RAMs),
the carry chain at the bottom row.

```
SEG=1 node prototype.mjs predict obs.json switch-tiles.txt pred.json t1 … u0     (SEG=pairs: the taps pairwise)
UNBONDED=1 PROBED=probed.json DBPIPS=1 SOURCES=1 BUFGSRC=1 SOURCEOBS=obs.json SOURCEXDL=… MAXJOINS=3 MAXDEPTH=5 node prototype.mjs tests pred.json obs.json u1 t1 …
node edgejoins.mjs obs.json edge.json t1 … u6
node probe-run.mjs candidates.json probe.json        (SILINX_ISE_HOST: the I/O names, the PIPs of each tile)
PINRULES=1 node chip.mjs measured.json.gz obs.json --ft … --probe probe7.json,io9.json,type.json,rest.json --tests t1,…,u7
```

## 11. The pins of the features no example uses, and the open flow's designs on the measured graph (2026-10-25)

**The designs.** ISE implemented for the XC3S250E 61 designs: the `test/fixtures/open-flow` and `test/fixtures/designs`
designs (their UCF kept to the nets they have; those of a bigger package without their LOCs), and `gen-obspins2.mjs`'s:

- `srlcasc`: a 64-bit shift register in every CLB (AREA_GROUP);
- `f8-RC`: a 32:1 multiplexer in every pair of CLBs one above the other (MUXF8), in four designs (the rows from 0 or 1,
  the CLB columns of one parity: all of them overfill the SLICELs);
- `ramclkb`: every block RAM with port B on a clock of its own;
- `bufg-xN`: the BUFGMUXes of each clock tile, even and odd places apart (two neighbours share their inputs).

XST merges equal instances (`mux32` with the same data and selects): every multiplexer has its own permutation. Observed
with the 117 earlier designs (178), merged with the earlier observation (`decided` keeps the 9 lost designs' joins):
**55 081 pin facts, every one right**; 4448 joins more, every one right.

**What the observer reads now** (`observe.mjs`):

- **An F8's FXINB and a multiplier's BCIN** are on another tile's wire, as a carry chain's lower CIN (`pinJoins`): the F8
  takes FXINB from the F7 of the CLB above (`FX2 -> FX_S2` there, nothing in the pin's tile), the cascade ends on
  `MULT_CARRYB_BCOUTk` in the tile below.
- **A side BUFGMUX's O.** `CLKL_GCLK_PWOk` is a clock line (in other nets a join reaches it), ambiguous in the source's
  tile. When it is the one undriven wire there, the source pin is on its node: ISE's route is a tree from that pin.
- **The last loose ends, several of them.** A DCM's output reaches its BUFGMUX through `DCM_OMUXm_CLKOUTLk` ->
  `CLKV_OMUXm_OUTLk` -> `CLKV_OUTLk` -> `CLKT_DLL_OUTLk`, wires of no family: two undriven wires and two loose ends in
  three tiles. The rule of one of each now takes up to five: the joins are the one pairing under which the net is a tree
  from its source that reaches every PIP (the other pairing leaves `CLKV_OMUX10_OUTL0` fed by its own PIP's output).

**Rules** (`PINRULES=1`; what a route uses of them ISE checks):

- a slice's FXINB on its FXINA's wire with A and B swapped, FX<k> of its F5<k> (the three positions ISE showed);
- a pin joined to another tile's wire in some tiles (the lower CIN, FXINB, BCIN) joined the same way in every tile of its
  type: the chains ISE placed do not cross every boundary (125 joins);
- an I/O block's ICLK1 / OTCLK1 on its ICLK2 / OTCLK2's wire with the 1 for the 2; a DCM's pin seen in one of the four
  DCM tiles on the same wire in the others;
- a multiplier's BCINk, which no route names, on a wire named as the pin: **216 pin wires differ from the shipped graph
  by name** (`compare`'s pinsDiff). Their nodes are the shipped graph's: the name is never written (no PIP in that tile).

The pins still missing are none the open flow uses: the SLICEM's ALTDIG / DIG / SLICEWE1 / BYOUT / BYINVOUT (inside the
CLB), the shift-register cascade between two CLBs, the I/O sites no package bonds, the DCM's and the I/O blocks' test and
differential pins, ICAP, BSCAN, PMV, PCILOGICSE, STARTUP, CAPTURE.

**The open flow on the measured graph** (`open-flow.mjs`, `SILINX_CONFIG_DIR`), the 7 examples and the 36
`test/fixtures/open-flow` designs of the XC3S250E CP132: **37 of 43 route.** Still failing:

- `feat_iob_lines`, `feat_iob_pair`: the I/O registers' clocks (the I/O tiles' `GCLKk`, 581 clock-line nodes still split);
- `feat_bufgmux`, `feat_bufgmux_1`: a BUFGMUX's S (`CLKT_SELDUBk`) from general routing, the PIPs and joins of the
  doubles across the clock column at some indexes only;
- `feat_manual_clock`: a clock pad into a BUFGMUX's I0;
- `feat_clocks12`: the routing does not converge (5 nodes shared after 50 passes): the 13 691 nodes still split leave the
  router fewer ways.

Next: the clock column's PIPs and joins by index (an arc probe and join tests), the I/O tiles' clock lines (clock tests on
the new designs' clock nets), then ISE's verdict on the 43 (`check-open-flow`).

```
node gen-obspins2.mjs feat && impl-remote.sh …         (and the fixtures, their UCF kept to their nets)
INTERSECT=1 node prototype.mjs observe obsN.json …117 designs… feat*/*/top.xdl ; obsmerge (scratch) obs.json obsN.json
PINRULES=1 node chip.mjs measured.json.gz obs.json --ft … --probe … --tests …
SILINX_CONFIG_DIR=cfg node research/s3e-route/open-flow.mjs examples/gates out/gates      (the 43, one at a time)
```

## 12. The clock column and the I/O columns' clock lines; 40 of the 43 designs through ISE on the measured graph (2026-10-25)

What the 6 designs of section 11 lacked, each measured:

- **The clock column by index** (`varyjoins.mjs`): ISE's routes showed the PIPs and joins of the doubles across the clock
  column (`CLKV_E2BEG5 -> CLKT_SELDUB2`, `TIBUFS/E2BEG5 ~ CLKT/CLKV_E2BEG5`) at some indexes only. `pips`: each PIP seen
  in a clock-column tile with its wires' index varied among the tile's measured wires, to the arc probe: 3682 asked,
  **212 exist**; `joins`: each join seen there with the index varied, to the join tests: 470 tests, 187 joins, 283
  islands, every one agreeing. A BUFGMUX's S then routes (`feat_bufgmux`, `feat_bufgmux_1`).
- **The I/O columns' clock lines.** Clock tests (`clocktests.mjs`) on the 61 designs' clock nets with an end in an I/O
  or block-RAM tile: 984 designs, 2189 tests, 811 joins, every verdict agreeing. Then `varyjoins.mjs clock`: each known
  join of two clock lines with an end in an I/O tile at every index and every tile of the prefix at the same offset,
  tested from a BUFGMUX (`BUFGSRC=1`, `MAXDEPTH=10 MAXJOINS=8`: the spine, the row and the column are a long way from
  it): 211 + 111 joins, all agreeing. The clock-line nodes still split go from 581 to 296; the I/O registers' clocks route
  (`feat_iob_pair`).

| | Section 10 | Now |
|---|---|---|
| Nodes split / merged | 12 217 / 0 | 12 011 / 0 |
| PIPs extra / missing | 66 / 52 423 | 66 / 50 557 |
| Pins wrong (by node) / missing | 0 / 22 796 | 0 / 19 929 (216 named otherwise: BCIN, section 11) |

**ISE's verdict** (`scripts/check-open-flow.mjs`, the measured graph in `SILINX_CONFIG_DIR`): **all 40 designs that route
pass: no open-flow warning, DRC 0 errors and 0 warnings, xdl2ncd no warning, and Silinx's `.bit` byte-identical to ISE's
bitgen with CRC on and off.** They are the 7 examples (gates, traffic, blinky, pong, stopwatch, clock, vga) and 33 of the
36 `test/fixtures/open-flow` designs of the XC3S250E CP132: block RAMs and their wizards, DCMs (one and two, a phase shift, a divider,
the clock wizard), BUFGMUX, the multipliers and their cascade, SRL16 and their chains, I/O registers, DDR,
bidirectional pads, the hard primitives.

Still failing, the measured graph's last gaps:

- `feat_iob_lines`: the I/O registers' clocks in columns no test reaches yet (296 clock-line nodes split; 106 hypotheses
  no test source reaches);
- `feat_manual_clock`: a clock pad into a BUFGMUX through general routing: `CLKV_E2BEG0` / `CLKV_E2MID0`, the only PIPs
  of known bits into `CLKT_CLKDUB0`, have their joins to the I/O tiles untested (no pad source drives that I/O tile's
  doubles: 320 such hypotheses);
- `feat_clocks12`: twelve clocks, the routing does not converge (3 nodes shared after 50 passes): the 12 011 nodes still
  split (hex and double taps whose segment starts in a tile no test drives, the I/O tiles' OMUX) leave the router fewer
  ways.

The shipped graph stays: the replacement is the maintainer's decision. What it would still need: those three, the
quality comparison against the shipped graph (routability and timing, #3's acceptance), and the other devices.

```
node varyjoins.mjs pips measured.json.gz obs.json cand.json probe7.json,…   && probe-run.mjs cand.json probe.json
node varyjoins.mjs joins measured.json.gz obs.json hyp.json t1 … u8          && prototype.mjs tests hyp.json …
node varyjoins.mjs clock measured.json.gz obs.json hyp.json t1 … u10         && BUFGSRC=1 MAXDEPTH=10 MAXJOINS=8 … prototype.mjs tests …
SILINX_CONFIG_DIR=cfg SILINX_ISE_HOST=… node scripts/check-open-flow.mjs examples/gates … test/fixtures/open-flow/hard_prim
```

## 13. All 43 designs through ISE on the measured graph; its quality against the shipped graph (2026-10-25)

**The last three designs:**

- **The tests' router only knew the I/O and block-RAM tiles' PIPs** (`PROBED`). A join of a clock-column wire
  (`TIBUFS/E2BEG0 ~ CLKT/CLKV_E2BEG0`) needs a PIP out of the CLKT end, so it was untestable. With every non-CLB tile's
  PIPs of the measured graph (a PIP a tile lacks makes ISE refuse the design, never a wrong verdict), 262 more tests ran:
  211 joins. `feat_manual_clock` (a clock pad into a BUFGMUX through general routing) routes.
- **The clock rows no design used.** The left and right GCLKH rows at Y13 were single-wire nodes: no route of ISE's
  took them. `varyjoins.mjs rows` moves each known join of two clock wires in one tile row (or column) to every other
  row where the tiles at the same X have the same wires, at every index: 276 joins. Then, in rounds until none is left
  to test (u16-u18: 2116 joins, 86 islands, all agreeing), the I/O columns' clock lines below them. `feat_iob_lines`
  routes.
- **The tile grid.** `build.mjs` laid the tiles out by their names' coordinates (36 rows × 28 columns), so tiles of one
  X / Y shared a place: CLKT_X13Y35 and CLB_X13Yk in column 13. The placer's halves of the chip are columns either side
  of the clock tiles', so CLB_X13 (fed by the left half's rows) counted as the right half. A top buffer's clock then
  took the line its side buffer of the left half used (`GCLKVML_X6Y17/GCLKVMLR_GCLK_DN4`: `feat_clocks12` did not
  converge). The distances of the placer and of Silinx's timing estimate were also off. Now the measurements carry the
  device report's grid (`rows`, `cols`, each tile's `r`, `c`, as its names), and the tiles are where the device has
  them. `feat_clocks12` routes. (#1294, opened for a placer bug, was this.)

| | Section 12 | Now |
|---|---|---|
| Nodes split / merged | 12 011 / 0 | 9500 / 0 |
| Clock-line nodes split | 296 | 91 |
| PIPs extra / missing | 66 / 50 557 | 66 / 50 557 |
| Pins wrong (by node) / missing | 0 / 19 929 | 0 / 19 929 |

**ISE's verdict on all 43** (the 7 examples, the 36 `test/fixtures/open-flow` designs of the XC3S250E CP132):
`check-open-flow` on the measured graph passes every one: no open-flow warning, DRC 0 errors and 0 warnings, xdl2ncd no
warning, and Silinx's `.bit` byte-identical to ISE's bitgen with CRC on and off.

**The quality against the shipped graph** (the same 43, the open flow on each graph, ISE's timing analysis, `trce`, of
each routed design; the 37 with a clock period):

| | Measured / shipped |
|---|---|
| Critical period, geometric mean | **1.0017** (+0.17%) |
| Within ±0.5% | 20 |
| Slower / faster | 10 / 7 |
| Range | 0.922 (`feat_bram_clocks`) to 1.096 (`blinky`) |
| Slices | the same in every design |

The examples: gates (no clock), traffic 7.772 -> 7.745 ns, blinky 6.527 -> 7.151, pong 12.221 -> 12.143, stopwatch
12.839 -> 12.898, clock 6.332 -> 6.434, vga 8.94 -> 9.05. The differences either way are the placement's: the router
has fewer choices on 9500 nodes still split (the hex and double taps whose segment starts in a tile no test drives, the
I/O tiles' OMUX), and the placer's delay table is computed on the graph.

**What replacing the shipped XC3S250E graph would mean.** Every design of the open flow's tests passes ISE on it, at the
same speed on average. Against it: 9500 nodes are still split, and the router takes each piece for a node of its own, so
two nets may still be put on two pieces of one wire (a short: ISE's DRC finds none in the 43, but the risk of section 10
stays until no node is split); 216 BCIN pin wires are named otherwise; and the rules of sections 9 and 11 give 64 pins
and 125 joins ISE checks only where a route uses them. The other three devices have no
measured description. The decision is the maintainer's.

```
node varyjoins.mjs rows measured.json.gz obs.json hyp.json t1 … u15        (then the rounds: varyjoins, predict, edgejoins)
PROBED=all-non-clb-pips.json … prototype.mjs tests hyp.json obs.json u16 …
SILINX_CONFIG_DIR=cfg node research/s3e-route/open-flow.mjs <design> out --quality q.json     (each graph)
SILINX_CONFIG_DIR=cfg SILINX_ISE_HOST=… node scripts/check-open-flow.mjs <the 43>               (each graph: trce's period)
```

## 14. The split nodes: none a short can come from, and the routes they cost (2026-10-25)

**Which split nodes matter.** A piece of a split node can carry a net only if a PIP drives it or a site's output pin is on
it. A short needs two such pieces of one wire: the router takes each piece for a node of its own, so it may put two nets
on them. A piece that nothing drives (a hex that starts beyond the chip's edge: `BIOIS_X22Y0/W6END1 … LRTERM_W6A1`, no
BEG) never carries one. `prototype.mjs compare` now counts both kinds: the split nodes **with two pieces a net can
reach** (the risk), and those with one reachable piece and another with PIPs out of it (**a route the router lacks**).
Of section 13's 9500: 188 risky, all long lines at the I/O rows and columns' ends; 6377 a route lost.

**What closed them** (`varyjoins.mjs`, every hypothesis to ISE's join tests):

- `long`: the long lines' rule, six switch boxes on with the index six on modulo 24 (eastwards LH, southwards LV), the
  DCM tiles among the switch boxes (`TIBUFS_X13Y35/LV18 -> DCM_TL_CENTER_X13Y34/LV19 -> … CLB_X13Y26/LV0`; the tile
  probe's list had left them out): 326 joins. **No split node a short can come from is left.**
- `predict` and `edgejoins.mjs` take the measured graph's wires (`WIRES=`): a rule applies where the bit database and
  the probe gave the wires, not only where a route showed them (an I/O tile's `OMUX_W14`): 13 822 joins.
- `edge`: the edge tiles' known joins at every index; `taps`: a double's or a hex's other taps from any of them, whatever
  the prefix (a hex south from the top: `TTERM_X2Y35/TBTERM_S6A2 ~ CLB_X2Y33/S6MID2`), the same tap in a tile of the same
  place (`TTERM_X2Y35/TBTERM_N6BEG2 ~ TIBUFS_X2Y35/N6BEG2`), an END's `END_S` / `END_N`: 3648 joins (taps by tile
  coordinates guess wrong across the block-RAM columns: 4869 islands, as expected).

Every verdict of these rounds agrees with the shipped graph (local scoring).

| | Section 13 | Now |
|---|---|---|
| Nodes split | 9500 | 3413 |
| ... with two pieces a net can reach (a short) | 188 | **0** |
| ... with a route lost | 6377 | 478 |
| Nodes merged | 0 | 0 |

The 478 left: the top I/O tiles' clock lines above the block-RAM columns (`TIOIS_X4Y35/GCLKk`), the hexes into the
terminal tiles above them (`CLB_X10Y30/N6BEG3 ~ TTERM4_X10Y35/TBTERM_N6A3`, five rows: offsets in switch boxes there), a
few corners' `NW_N`. The other 2935 only lose wires no route can use.

**ISE's verdict on all 43** on this graph: as section 13, every one clean (DRC 0 / 0, no warning, `.bit` byte-identical
with CRC on and off). **The quality against the shipped graph** (ISE's `trce`, the 37 with a clock period): geometric
mean **0.9960** (0.4% faster; 1.0017 in section 13), 22 within ±0.5%, 10 faster, 5 slower, from 0.953 (`feat_dcm_bufgin`)
to 1.061 (`feat_bramwiz`). The examples: traffic 7.772 -> 7.701 ns, blinky 6.527 -> 6.636, pong 12.221 -> 12.178,
stopwatch 12.839 -> 12.323, clock 6.332 -> 6.272, vga 8.94 -> 8.541.

```
SWITCHTILES=switch-tiles.txt node varyjoins.mjs long measured.json.gz obs.json hyp.json t1 … ; node varyjoins.mjs edge|taps …
WIRES=measured.json.gz SEG=pairs node prototype.mjs predict obs.json switch-tiles.txt pred.json t1 …
WIRES=measured.json.gz node edgejoins.mjs obs.json edge.json t1 …
node prototype.mjs compare measured.json.gz        (the split nodes: with two pieces a net can reach, with a route lost)
```

## 15. The measurements the test dry run asked for (2026-10-26)

A dry run of the open flow's tests on the measured graph (`REPLACING.md`) found two things it lacked:

- **A clock pad's dedicated path to its DCM.** Pad A9 reached no DCM on switches of known bits, so the placer gave
  DCM_X1Y1 pad B9 where ISE gives it A9 (`packages/silinx-fpga/src/fpga/place.js` `DCM_PAD`): no design of ISE's had taken A9 as a clock
  input (`TIOIS_X14Y35`'s `I1_PINWIRE -> IOIS_IBUF1`, `IOIS_IBUF1 ~ CLKT_CKI3`). A design of the four DCMs, each fed
  from the pad ISE gives it (C8, A9, N5, M6) through an IBUFG, implemented by ISE: its routes give the four dedicated
  paths (`gen-obspins2.mjs dcmpads`). A9, B9, C8, B8, N5 and M6 now reach their DCMs, as on the shipped graph.
- **An input-only pad's OTCLK1 / OTCLK2**, which no design can drive (an input has no output register): a rule
  (`PINRULES`), an I/O site's clock pins still not seen on `<pin><k>` of its I pin's `Ik_PINWIRE`, the rule every observed
  one follows (26 pins; none wrong).

The six test files that failed again on the rebuilt graph: `fpga-hard` and `iob-pair-clocks` now pass; the five failures
left are the tests pinned to the shipped graph's routes or contents (`REPLACING.md`).

### The measurements committed (2026-10-26)

Step 1 of `REPLACING.md`: the measurements the description is built from, in the repository (`data/xc3s250e/`, 6.3 MB
gzipped: the observation, the other packages' observations, the arc probes, the verdicts of the 57 rounds of tests, the
switch tiles), and the description itself (`measured.json.gz`, 0.75 MB). `build-measured.mjs` rebuilds it from them
alone in a few seconds; `test/s3e-device.test.js` checks the rebuild is byte for byte the committed file. The shipped
graph is unchanged.

### One data folder per die (2026-10-27)

The plan for the other three devices (issue #3, 2026-10-27): `build-measured.mjs --part <part>` rebuilds the measured
description of any die of `PARTS` (the XC3S100E-CP132, XC3S250E-CP132, XC3S500E-FG320, XC3S1200E-FG320) from
`data/<die>/`, with the die's layout; the test rebuilds every die that has a folder. The XC3S250E's is the only one so
far.

### The recipe for the other dies, part 1 (2026-10-27)

`measure.mjs designs` writes every observation design of a part into one folder for `impl-remote.sh` (38 on the
XC3S100E); `measure.mjs observe` observes the ones ISE implemented and names the others. `gen-obshdl.mjs`'s pads design
is now sized to the part (`padDefaults`: every bonded pad but two, enough plain inputs that the inout ones fit the
bidirectional pads): 81 pads on the XC3S100E-CP132 (83 bonded), 230 and 248 on the XC3S500E / XC3S1200E-FG320; the
XC3S250E-CP132 keeps its 90.

On the XC3S100E-CP132, 33 of the 38 designs passed ISE the first time. `muxes` needed 600 SLICEMs of the part's 480:
`gen-obsmux.mjs` now makes 300 multiplexers, or a quarter of the part's SLICEMs where it has fewer (`muxCount`, 120
there). The three `iobclk2` designs failed placement (Place:1012: the clock pad and its DCM must be in one quadrant).
The XC3S100E has only two DCMs, in the centre column right of the clock tile, and B8 is left of it. The DCM designs'
clock pad is now the first bonded pad of the top I/O tile in the column of the top edge's first DCM
(`gen-obspins.mjs dcmClockPad`): B9 on the XC3S100E, still B8 on the XC3S250E, XC3S500E and XC3S1200E. iobddr has no DCM
and keeps B8. With these and the 81-pad `pads` design, all 38 pass, and `observe` explains every join (0 unexplained).
The XC3S250E's designs are unchanged, byte for byte.

### The recipe for the other dies, part 2 (2026-10-27)

The XC3S100E's tile probe (`measure.mjs tiles`, 3 rounds, 24 designs) gives 332 switch-box tiles, 240 of them CLBs: the
shipped graph's switch-box tiles exactly. Every one was seen in ISE's routes of the 38 designs, and the 468 candidates
the probe asked (each prefix at every X / Y of its kind) are names with no tile there.
`measure.mjs random` writes the random designs ISE routes keeping their placement (gen-observe.mjs, as the XC3S250E's:
4 designs, seed 11, a quarter of the CLBs each; 236, 280, 292 and 220 of the XC3S100E's 960 slices). `observe` then
reads their routes as well (`*.r.xdl`, ise-remote.sh -r). `measure.mjs round k` predicts joins (`predict`, SEG=1) and
writes round k's tests across the joins rounds 1 to k-1 confirmed. `measure.mjs verdicts k` reads ISE's DRC and says
whether round k found joins, so another round is needed, or none, so the rounds are done. On the 38 designs' observation
alone (before the random designs), round 1 predicts 51 262 joins not observed: 45 775 tests in 40 designs, 5487 not
testable from a CLB, 38 s.

### The recipe for the other dies, part 3 (2026-10-27)

The XC3S100E's join tests, ISE 14.7 on the Mac mini, every verdict scored against the shipped graph:

| Round | Tests (designs, ISE time) | ISE's verdicts | Agree with the shipped graph |
|---|---|---|---|
| 1 | 44 657 (40) | 23 917 joins, 20 740 islands | **all** |
| 2 | 1986 (12) | 1254 joins, 732 islands | **all** |
| 3 | 200 (11) | 116 joins, 84 islands | **all** |
| 4, from IOB / block-RAM sources | 2279 (25, 208 s) | 1154 joins, 1125 islands | **all** |
| 5, across round 4's | 64 (9) | 28 joins, 36 islands | **all** |
| 6, the probed I/O PIPs (`PROBED`) | 1014 (20, 113 s) | 543 joins, 471 islands | **all** |
| 7, across round 6's | 8 (3, 12 s) | 4 joins, 4 islands | **all** |
| 8, unbonded sources (`UNBONDED=1`) | 433 (12, 52 s) | 221 joins, 212 islands | **all** |

Round 4 is the XC3S250E's rounds 4-6 in one (`SOURCES=1 DBPIPS=1 SOURCEXDL=bram,ramwide,ramnarrow MAXJOINS=3
MAXDEPTH=5`): the observation designs already use every block RAM, multiplier and pad. By kinds: block RAM-block RAM
419, block RAM-CLB 704, block RAM-I/O 76, CLB-I/O 881, I/O-I/O 199. Round 5 finds only 64 more tests; 1484 joins stay
untestable, of the I/O tiles. For them the I/O arc probe, as round 7: `candidates.mjs io obs.json io.json t5/tests.json`
asks only the PIPs into the joins' I/O ends and one step back (`leftCandidates`: 6514 of the 126 097 candidates), then
`probe-run.mjs io.json probe.json` and the rounds with `PROBED=probe.json`.

The I/O arc probe took 8 rounds of 8 designs (a few minutes): 5387 PIPs exist, 1127 not, every answer as the shipped
graph has it. Rounds 6-8 then reach all but **29 joins**: hexes that begin in an I/O tile with no pad in the CP132 and
whose start no source reaches (`BIOIS_X14Y0/N6BEG5`, `RIOIS_X17Y6/W6BEG0`, `TIOIS_X6Y23/W6BEG5`, …) and three joins into
the terminations (`BTERM2`, `LTERM`, `TTERM`), as the XC3S250E's 11; a deeper search (`MAXJOINS=6 MAXDEPTH=8`) adds
none. Rounds 1-8: **50 641 tests, no disagreement with the shipped graph**. Next: the clock and edge tests, then
`chip.mjs` and the comparison.

### The recipe for the other dies, part 4: the XC3S100E's edges and clock network (2026-10-28)

As the XC3S250E's (section 8), ISE 14.7 on the Mac mini, every verdict scored against the shipped graph:

- **The edge tiles** (`edgejoins.mjs obs.json edge.json t1 … t8`, then `prototype.mjs tests` with the round 8 sources):
  3295 hypotheses (1277 by the rules of the edge tiles' known joins, 2018 ambiguous candidates), 2410 tests in 75 designs
  (393 s): 853 joins, 1557 islands, **all** agreeing; 885 with no test source within the limits.
- **The clock network:** the 12 sparser clock designs (`gen-obsclk.mjs clkb 12 100 0.25`, 438 s, every one implemented)
  with the 42 before: 54 designs, 27 150 joins (12 757 by the intersection), 0 unexplained. Then `clocktests.mjs`:

| Tests | Designs (ISE time) | Verdicts | Against the shipped graph |
|---|---|---|---|
| (A) `MAXROW=2`, 3243 | 440 (1589 s) | 1562 joins, 1386 islands, 295 controls clean | **all agree** |
| (B) `PICK=c2`, 377 | 69 (258 s) | 342 joins, 35 controls clean | **all agree** |
| spine, first round (574) | 85 (211 s) | 222 joins, 123 islands; baselines 183 clean, 23 not | **all agree** |
| rows, first round (526) | 129 (284 s) | 179 joins, 299 islands, 48 controls clean | **all agree** |
| spine, second round (46) | 10 (24 s) | baselines 23 not clean: nothing settled | — |

**2305 clock wires settled**, each with exactly one join; 76 of those tested stay (the spine's own wires and rows whose
baselines are not clean, as the XC3S250E's 239). The rows' second round had no candidate left. Next: `chip.mjs` and the
comparison with the shipped graph (no ISE).

### The recipe for the other dies, part 5: the XC3S100E's measured description (2026-10-28)

The XC3S250E's sections 9-14 on the XC3S100E, ISE 14.7 on the Mac mini; every valid verdict scored against the shipped
graph (local scoring only), and every one agreeing. The measurements and the description are in `data/xc3s100e/`.

- **The arc probe of every PIP of the non-CLB tiles** neither ISE's routes nor a probe showed there, and of the I/O tiles'
  site outputs in their own names (`candidates.mjs rest`): 169 493 candidates, 75 rounds, 31 min; 163 204 exist, 6289
  not, every answer as the shipped graph has it. The extra PIPs go from 6299 to 38.
- **The join rounds over the whole chip** (`predict` `SEG=pairs` with `WIRES=`, `edgejoins.mjs`, `varyjoins.mjs` long,
  edge, taps, rows, joins, clock; `PROBED` every non-CLB PIP of the measured description): u1-u8, about 42 000 tests.
  u1's designs were written from the description before the probe, so ISE refused most of them (an I/O PIP in the
  CLB's names, `OMUX_E13 -> F4_B1`): asked again in u2.
- **The long lines** through the XC3S100E's `DCMAUX_TL_CENTER` / `DCMAUX_BL_CENTER` tiles (`DCM_SWITCH`): 46 joins, the
  38 split nodes a short could come from.
- **The clock spine** (`varyjoins.mjs spine`, `BUFGSRC=1`): the horizontal spine (`CLKC_GCLKk ~ GCLKVML_GCLKCOREk`) in
  round sp2, then the vertical spine and the rows. Nine tests of a row's `GCLKH_GCLK_UP` / `_DN` with a row line gave a
  join the shipped graph does not have: the test's path reached the other end over a join of the row not yet known,
  so the tests were invalid (marked `invalid` in the verdicts), and the spine rounds leave those wires to the removal
  tests.
- **The block RAMs' clocks:** the `GCLKk -> BRAM_CLKj` PIPs ISE's routes did not show (368, an arc probe: all exist),
  and the pins' own joins (`varyjoins.mjs pins`: the 4 block RAMs are clocked alike in every design): 12 joins.
- **XB / YB:** Silinx's routes of the 7 examples on the shipped graph, ISE's DRC clean (`others.json.gz`, pins only).

| | First build | Now |
|---|---|---|
| Nodes split / merged | 9178 / 0 | 2804 / 0 |
| ... with two pieces a net can reach (a short) | 280 | **0** |
| ... with a route lost | 6412 | 318 |
| PIPs extra / missing | 6299 / 32 964 | 38 / 25 506 |
| Pins missing | 10 984 | 10 024 |

**ISE's verdict on the 7 examples** (gates, traffic, blinky, pong, stopwatch, clock, vga) routed by the open flow on the
measured graph: every one clean, DRC 0 errors and 0 warnings, xdl2ncd no warning, Silinx's `.bit` byte-identical to
ISE's bitgen with CRC on and off. ISE's `trce` periods against the same examples on the shipped graph: traffic 8.167 ->
7.755 ns, blinky 6.503 -> 6.632, pong 11.600 -> 11.688, stopwatch 12.654 -> 12.923, clock 6.410 -> 6.439, vga 9.099
-> 9.096. The shipped graph stays; the XC3S100E's `test/fixtures/open-flow` designs are not run on it yet.

### The recipe for the other dies, part 6: the XC3S100E's open-flow designs (2026-10-28)

The `test/fixtures/open-flow` designs of the XC3S250E CP132, made for the XC3S100E (the part changed; the two that need
10 block RAMs or 10 multipliers left out, it has 4): on the shipped graph 32 route, `feat_iob_plain` and `feat_iobreg`
do not (17 of their features are not in the bit database for this die). On the measured graph of part 5, 19.

- **ISE implemented them** (as section 11): 33 of the 34 (`feat_iob_ddr_v`: XST refuses `wire ck, ckn = ~ck;`, its VHDL
  twin is in; `feat_clock_data` and `feat_const_dcm` with their clock on B9, the pad ISE's Place:1012 asks for a DCM on
  this die). Observed with the earlier designs: 1006 joins more; the DCMs' paths to the global buffers route.
- **`iobddr-b`** (`gen-obspins.mjs`, `iobDdr` `alt`): `iobddr` leaves its 8 inputs and 8 outputs without DDR registers,
  the input-only pads and the last pads among them (G12's IQ2, SR, REV, ICE); `iobddr-b` takes them from the first pads
  that can drive, so the two give every pad its DDR registers.
- **Clock tests** (`varyjoins.mjs rows`, `spine`; `clocktests.mjs` on the fixtures' clock nets; the I/O columns' undriven
  clock lines against the UP / DN of each clock row of their column, from a BUFGMUX): 161 tests, every verdict agreeing.

**ISE's verdict on the 32** routed by the open flow on the measured graph: every one clean, DRC 0 errors and 0 warnings,
xdl2ncd no warning, Silinx's `.bit` byte-identical to ISE's bitgen with CRC on and off. Nine (the DCM designs) warn, as on
the shipped graph, that the DCM's CLKIN comes from B8 through general routing; the measured graph knows the dedicated
path from B9 and A9, the shipped graph also from A10 and C9 (not measured yet). The measured graph now: 2930 split nodes,
none a short can come from, 488 a route lost; 0 merged; 38 extra PIPs.

### The recipe for the other dies, part 7: the XC3S500E's measured description (2026-10-29)

Parts 1-6 on the XC3S500E-FG320 (Nexys2-500), ISE 14.7 on the Mac mini. Every valid verdict and every probe answer was
scored against the shipped graph (local scoring only), and every one agrees. The measurements and the description are
in `data/xc3s500e/`.

- **Observation:** the 38 designs of `measure.mjs designs` and `iobddr-b`, all passing ISE, and the 12 sparser clock
  designs (`gen-obsclk.mjs clkb 12 100 0.25`). The tile probe gives 1404 switch-box tiles, the shipped graph's exactly;
  the 4 random designs follow. `observe` explains every join.
- **Join rounds** in the CLBs' names: t1-t9, about 290 000 tests (with the I/O probe, the pads' and the block RAMs'
  sources, the unbonded I/O tiles). The I/O probe: 11 737 PIPs exist and 2770 do not. The edge tiles: 11 163 tests,
  3752 joins. 543 joins are left that no CLB can test.
- **Clock tests by removal** (`clocktests.mjs`): c2, c3, cS and cM, 19 982 verdicts. cS2's 51 tests failed their
  baseline, as on the XC3S100E.
- **The arc probe of the rest** (`candidates.mjs rest`): 452 244 candidates in 181 rounds; 440 976 exist and 11 268 do
  not. The extra PIPs go from 11 186 to 74.
- **Whole-chip rounds** (part 5's, with `varyjoins.mjs spine` and `pins` in each round): u1c-u6c, 56 832 verdicts.
  Round 6 found no join. Four of them were invalid. Each tested a GCLKVC tile's `GCLKC_GCLK_OUT_*n` against
  `GCLKC_GCLKn` of another GCLKVC tile in its column. The test's own route drives `GCLKC_GCLKn` from the column's
  `GCLKVMLR_GCLK_DN` / `_UP` line, and the other end is on that same line. So ISE saw it driven anyway and reported a
  join. These joins are marked `invalid`, and from u3 on such pairs were left out of the hypotheses.
- **XB / YB:** Silinx's routes of the 7 examples on the shipped graph, ISE's DRC clean (`others.json.gz`, pins only).

| | First build | Now |
|---|---|---|
| Nodes split / merged | 18 658 / 0 | 3558 / 0 |
| ... with two pieces a net can reach (a short) | 101 | **0** |
| ... with a route lost | 15 931 | 932 |
| PIPs extra / missing | 11 186 / 96 836 | 74 / 81 838 |
| Pins missing | 38 073 | 33 417 |

The 360 pins whose wire differs from the shipped graph's are the BCIN0-17 of 20 multipliers, named by the pin where
the shipped graph has `MULT_CCARRY_BCINk`. These are likely each column's first multiplier, whose cascade input
nothing drives; the XC3S100E has the same on its 4 multipliers.

**ISE's verdict on the 7 examples** (gates, traffic, blinky, pong, stopwatch, clock, vga, on the Nexys2-500) routed by
the open flow on the measured graph: every one clean. DRC gives 0 errors and 0 warnings, xdl2ncd no warning, and
Silinx's `.bit` is byte-identical to ISE's bitgen with CRC on and off. ISE's `trce` periods, from the shipped graph to
the measured one:

| Example | Period (ns) |
|---|---|
| traffic | 7.558 -> 7.600 |
| blinky | 6.623 -> 6.831 |
| pong | 11.797 -> 11.920 |
| stopwatch | 11.944 -> 12.481 |
| clock | 6.531 -> 6.273 |
| vga | 8.918 -> 8.672 |

The shipped graph stays. The `test/fixtures/open-flow` designs are not run on the XC3S500E's measured graph yet.
