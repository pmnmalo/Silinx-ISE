# Changelog

What changed in each version of Silinx ISE. The newest version is first. Each section is also
the "What's new" text of its GitHub release.

## 15.10.18

In short:

- **Removing the top module from the project:** the module left becomes the top (Undo brings the old
  one back), and I/O Pin Planning no longer opens empty for a top the project no longer has.
- **The start page shows only the command search (Ctrl+K):** its Save and Undo hints are gone.
- **Touch screens:** a finger drags the splitters between panes, a dialog by its title and the
  waveform viewer's cursor, markers and rows.
- **The right-click menus on an iPad or a touch screen:** a long press (a finger or a pen held still
  for half a second) opens them. The README and the getting-started guides say what works on a tablet.

In detail:

- **Touch screens (#263):** iPadOS Safari fires no 'contextmenu' on a long press, so every right-click
  menu was out of reach on an iPad. A finger's or a pen's press held still (8 px) for 500 ms now opens
  the same menu at the press's point: the Design pane's rows and badges, the Processes rows, the
  document tabs, the Files view, the HDL editor, the schematic editor's symbol list, and ISim's wave
  window, instance tree and objects (whose row pressed is selected, as by the right button). A tap or a
  press that moves (a drag, a scroll) is left alone; the release's click is swallowed; a browser with
  its own long-press menu (Android) shows one menu. The mouse's right-click is unchanged. No '⋯'
  button was added to the rows and tabs: in a narrow Design pane it would take the badges' room, and
  the long press is documented.
- **What works on an iPad / a tablet (#267):** the README (*On an iPad or a tablet*) and the
  getting-started guides (English, Portuguese): the editors, simulation and the Silinx toolchain run;
  no board programming (WebUSB: desktop Chrome / Edge), no workspace folder (browser storage, which
  iPadOS may clear: export a zip), less memory per tab, the long press for the menus, landscape.
- **Touch screens (#264):** the splitters between panes, moving a dialog by its title and the waveform
  viewer's drags (the cursor, a marker, the rows' order, its splitters and its names column) used
  mouse events only, so a finger did nothing (a touch gives a mouse event on a tap, never a drag).
  They use pointer events now, and their handles take the touch instead of the page scrolling; the
  mouse works as before. The command palette's selection follows a pen too.
- **Touch screens, the state diagram and Petri net editors (#265):** their canvases already take a
  finger's drag (touch-action: none, from the ASM chart's styles they share); a UI test now drags a
  state and a place with a finger and checks it.
- **Start page (#261):** its sentence's lines are balanced, so no word is left alone on the last one ("file."),
  in English and in Portuguese.
- **The site's usage counts (#257):** from 13 October the published pages had no GoatCounter loader,
  so nothing was counted: the step that adds it took the page for one that already had it, as the
  application's own code (Help ▸ About's 'Usage counts' row) names the loader's id. It now looks for
  the loader's tag itself.
- **Start page (#255):** of its key hints only the command search is left; Ctrl+S Save (nothing to save
  there) and Ctrl+Z Undo are gone.
- **The top module removed from the project (#253):** *Remove from Project* of the top module's
  source left the project's top pointing at it: the Design pane had no top and I/O Pin Planning opened
  for it with no I/O at all (a project imported from ISE whose top schematic had been removed: its
  other schematic's buses seemed missing from the planner). Now the one module left at the root of the
  hierarchy becomes the top, or none when several are (the log says to set one); one Undo brings the
  old top back. A project saved with such a top is mended when it is opened. I/O Pin Planning of a top
  the project does not have says so, and how to set one.

## 15.10.17

In short:

- **Undo keeps working when a drawing gets its HDL file:** a schematic, ASM chart, state diagram,
  truth table or Petri net that gets its HDL file while it is open keeps its Undo history, its
  selection and its zoom.
- **Faster and smaller designs limited by their logic depth in the Silinx toolchain:** the synthesis
  now knows that a function of 5 or 6 inputs is slower than a LUT (the EPFL max benchmark 31 % smaller
  and a little faster; serv 12 % faster by the estimate).

In detail:

- **Place and route: a routing that does not converge is placed again (#249):** when the router stops
  with routing nodes still shared by two nets (a dense design on an unlucky placement: the nightly's
  secworks-sha256 on GitHub's machine), the design is placed again with the next seeds, three at most;
  if none routes, the flow says the routing did not converge (how many nodes, after how many passes,
  on how many placements) instead of failing at the routing check.
- **The scheduled workflows report their failures (#251):** a job of the nightly corpora, the ISE tests
  or the weekly comparison with ISE that fails opens an issue ('<workflow> failed: <job>'), or comments
  on it when it is open already, with the run, the commit and the lines of the log that say what failed
  (home folders, logins and addresses taken off).
- **A drawing's HDL file linked while it is open (#245):** when a drawn source gets its HDL file (on
  the save that clears its errors, from *Generate HDL File…*, or when its HDL language changes), its
  open editor took the whole drawing again, about a second after the edit: Undo was emptied, the
  selection cleared and the view fitted again. The editor now takes the link alone; Undo and Redo
  keep it, and the editor's HDL link is shown at once.
- **Open synthesis, the LUT delays (#78):** ABC is given a LUT library with the delays of a 4-, 5- and
  6-input function on the Spartan-3E (a LUT4; into the MUXF5; into the MUXF6 too), through its script
  given inline (YoWASP's ABC crashes on read_lut from a script file: reported upstream,
  codeberg.org/YoWASP/yosys/issues/41). The second depth-oriented balancing is made with and without
  the delays, at once, and the better kept: EPFL max 1232 LUTs instead of 1795 (616 slices, ISE 927),
  29.4 ns routed instead of 30.2; serv 10.6 ns estimated instead of 12.1; the pong example 11.2 ns
  instead of 12.4, with 311 LUTs instead of 275; the other examples as before.

## 15.10.16

In short:

- **The schematic of any HDL module:** *Convert to Schematic (editable)* works for every VHDL and
  Verilog module, behavioural ones too; the schematic shows in the Design pane on the module's row
  (**[Schematic]**), and the HDL generated from it behaves as the module did.
- **Post-Synthesis Simulation Model without ISE:** the Silinx toolchain writes its netlist as a
  simulation model, so the test bench can be run on the synthesized design.
- **Adders and comparators written as gates use the carry chain:** a ripple-carry adder drawn as a
  schematic of full adders, or written gate by gate, is now as fast as one written `a + b`.
- **Faster designs in the Silinx toolchain:** designs limited by their logic depth are mapped for it
  once more; critical paths 3 % shorter on average, up to 29 %, with no larger designs on average.
- **Smaller designs in the Silinx toolchain:** multiplexers and shifters take fewer LUTs; designs 6 %
  smaller on average, up to half, as fast on average (a barrel shifter 30 % smaller, AES 25 %).
- **Remove from Project removes a drawn module whole:** on a schematic's, state machine's, truth
  table's or Petri net's row in the Design pane it removes the drawing and its HDL file together; one
  Undo brings both back.

In detail:

- **Remove from Project of a drawn module (#234):** in the Design pane (the module's row, its
  drawing's badge, which now has the command too, and its HDL's badge) *Remove from Project* of a
  module drawn as a schematic, ASM chart, state diagram, truth table or Petri net removes the drawing
  and its HDL file together, after one question naming both: one command, so one Undo (or the toast's
  Undo) brings both back, linked as before, and Redo removes both again. The files stay in the project
  folder, unchanged. The Files view still removes the one file chosen: the HDL file alone leaves the
  drawing a module by itself with **[No HDL]** (#231), the drawing alone leaves its HDL file a plain
  HDL module. The question of *Remove from Project* is now in Portuguese too.

- **Convert to Schematic of any HDL module (#225):** what can be drawn becomes gates, multiplexers,
  slices, constants and module instances; the rest (processes, always blocks, generates, FSMs,
  memories, functions, records…) stays as HDL blocks of the schematic, with their comments. The
  module's HDL file is generated from the schematic at once, and checked: a conversion whose HDL
  would not compile as the module did is refused, the dialog saying why (nothing written). The
  console says what was drawn, what stays as HDL blocks and which file is generated. Every module of
  the examples (their testbenches too) and a set of behavioural VHDL and Verilog modules convert with
  the same simulation as before.
- **A file with several design units (#226):** converting a module whose file also holds a package
  or other modules no longer loses them when the schematic rewrites its HDL: the module goes to a file
  of its own, the other units stay (or, when the file is named after the module, they go to a file
  named after the first of them). An entity and its architecture in two files become one generated
  file.
- **Nothing of the HDL lost (#228):** a VHDL `buffer` port, the ports' default values, a Verilog
  output's initial value, the `` `include `` of the macros used, an `` `ifdef `` in the module,
  attributes and the comments of the statements stay in the schematic's HDL.
- **Schematics from HDL laid out (#227):** a signal with a single pin (an instance's output read only
  by a testbench's task, a variable read only with its initial value) keeps its name instead of
  becoming an undriven or tied-to-0 net; no "connects only" warning for a signal of the HDL kept in
  the schematic.
- **A drawing whose HDL file name is taken (#230):** a schematic, ASM chart, state diagram, truth
  table or Petri net whose HDL file (`<module>.vhd` / `.v` next to it) cannot be written because a
  file is in the way no longer stays silently without it: the console says so once when the project
  is opened, its row in the Design pane shows **[No HDL]** (its tip says why), and *Generate HDL
  File…* in its right-click menu (or a click on the badge) resolves it: a file that already defines
  the drawing's module is replaced by the generated HDL after you say Yes; a file holding something
  else is left alone and the HDL goes to `<module>_<kind>.vhd` (`ctl_pn.vhd`, `maj_tt.vhd`…). The New
  Source wizards refuse a drawing whose HDL file name, or module name, is taken.
- **A drawing whose HDL file is gone (#231):** a schematic, ASM chart, state diagram, truth table or
  Petri net whose HDL file was deleted from the project folder, or removed from the project, no longer
  stays silently as a bare file in the Design pane that is not a module: it is a module by itself
  again and gets its HDL file at once (the console says why), or, when that file name is taken, as
  above. Its HDL file removed from the project: the console says so once, **[No HDL]** on its row, and
  *Generate HDL File…* makes it again from the drawing and puts it back in the project after you say
  Yes (Undo, or *Add to Project* in Files, brings back the file as it was); saving the drawing no
  longer writes that file back into the project silently. Implementation, on the server and in the
  browser, builds such a drawing from the drawing too.
- **Tests (#232):** the UI test of Undo / Redo of *Convert to Schematic* waited for the schematic's
  link, not for the end of the conversion (its schematic opened): under load the schematic opened
  after the next file and took the editor area, and the test timed out. It now waits for the
  schematic to be open.
- **Generate Post-Synthesis Simulation Model in the Silinx toolchain (#120):** no longer *Needs Xilinx
  ISE*: the open synthesis's netlist written as ISE's netgen writes it, a VHDL model of UNISIM primitives
  (`build/netgen/synthesis/<top>_synthesis.vhd`, its entity with the top's ports), and in Verilog (`.v`);
  synthesized with the generics the test bench gives the design (a clock divider of 2 instead of
  50 000 000, so that it simulates quickly; said in the model's header and in the console), which it
  declares, so the test bench's generic map is taken as it is. *Simulate Post-Synthesis Model* and
  *Emulate Post-Synthesis Model* run it, in the application and in the browser edition. Every example's
  test bench passes on it, in VHDL and in Verilog.
- **Open synthesis: a conversion that changes the sign and the width was synthesized wrong (#229):**
  `to_unsigned(8389, 14)` of an integer, in a product, was sign-extended: the stopwatch example's
  decimal display showed wrong thousands and hundreds with the Silinx toolchain (7 as 15 1 0 7). Found
  by the post-synthesis model's test of the examples.
- **Tests that failed now and then on CI (#235, #236):** the post-synthesis model's UI test waits for
  the model's line (written once the reports are read, after the process's end); the server's test of a
  second implementation waits up to 20 s for the cancelled job to end.
- **Open synthesis: carry chains of logic written as gates (#77):** adders and comparators written bit by
  bit (a schematic of full adders, a ripple-carry adder in HDL, the EPFL benchmarks' AND-inverter graphs)
  are found in the netlist (each carry a majority of the bit's two inputs and the carry before, a sum their
  XOR) and mapped onto the Spartan-3E's carry chain (MUXCY / XORCY), as `a + b` is. The EPFL adder (128
  bits): 129 LUTs and the carry chain instead of about 640 LUTs and MUXFs, its critical path estimated at
  17 ns instead of 84 (ISE: 12 ns). A design with such chains is mapped with and without them and the
  faster is kept (the EPFL max comparator, whose chains stop after 30 bits, keeps its LUTs); designs with
  few gates are synthesized as before.
- **Petri net editor: a click on ■ Stop or on an input lost while the net runs (#239):** every clock
  step of *Run* made the simulation's buttons and inputs anew, so a click whose press and release fell
  on each side of a step did nothing. They are now kept; a step redraws only the outputs, the marking
  and the log.
- **State diagram (FSM) editor: a click on ■ Stop or on an input lost while the machine runs (#240):**
  every clock edge of *Run* made the simulation's buttons (⟲ Reset, Clock ↑, ■ Stop) and inputs anew,
  so a click whose press and release fell on each side of an edge did nothing. They are now kept; an
  edge redraws only the state, the outputs and the trace. (The ASM chart and truth table editors have
  no running simulation, and the schematic's live simulation acts on the press, so neither had it.)
- **Diagram editors: the view kept when their tab comes to the front again (#244, #233):** the
  schematic, ASM chart, state diagram and Petri net editors and the RTL schematic fitted the view to
  the drawing every time their document was brought to the front, so the user's zoom and pan were
  lost; and that fit, 30 ms after a document opened, could come late on a loaded machine, after a
  panel had changed the canvas, so the drawing moved under the pointer and a click aimed at an arc
  selected nothing (#233). Each editor now fits its view once, when its canvas first has a size (also
  for a document opened behind another one), and never again by itself.
- **Tests (#233, #241):** the Petri net analysis test waits for each step of deleting an arc (the arc
  selected, the focus in the editor, the arc gone), so that a failure names it; the Petri net tests
  wait for the saved net and its HDL file instead of reading them after a fixed pause.
- **Tests in WebKit and Firefox (#237):** a page the browser ends by itself (WebKit's web process on
  CI, crashed or ended for its memory: in the FSM editor's test, and in the browser Yosys test as in
  #110) is said as such at once, the calls waiting for it failing then (`webkit closed the page …`, with the
  last action), not as the timeout of what was being waited for; the test is then run once more in a
  fresh page, the projects of the first run removed, as a crashed Yosys is run again in a new worker
  (#153). A second time fails it.
- **Tests (#238):** the Technology Schematic UI tests, on a timeout, say what the application was
  doing (the process running and its job, the processes' status, an open dialog, the status bar, the
  console's last lines), so that a stall is told from a machine too loaded to finish in time.
- **Open synthesis, logic depth (#52):** a design whose depth-oriented mapping is kept (its logic
  depth the limit) is balanced once more (ABC's SOP balancing again, then mapped for area) and that
  netlist kept when it is faster without being larger in proportion. On the design corpus: critical
  paths 3 % shorter on average, sizes as before; the EPFL max benchmark 17 % faster (30.2 ns routed,
  ISE 25.7), EPFL priority 29 %, serv 19 %; the pedestrian crossing example 7.1 ns estimated instead of
  7.9, with 94 LUTs instead of 114.
- **Open synthesis onto LUT4s alone (#54):** the LUT mapping is onto LUT4s alone; the one with 5- and
  6-input functions (LUT4s and MUXF5 / MUXF6, which ABC takes for as fast as a LUT4 and so makes of
  every multiplexer and shifter) is tried after it and kept when better. A 32-bit shifter 141 LUTs
  instead of 213 and 120 MUXF; on the design corpus 6.5 % fewer LUTs, the period as before; the EPFL
  barrel shifter 1201 LUTs instead of 1707 (601 slices, ISE 534), AES 25 % fewer, SHA-256 17 %;
  some designs smaller and slower (serv 13 % smaller and 12 % slower). The rule that keeps a mapping
  also keeps one 5 % smaller and at most 1 % slower.
- **Open synthesis, its mappings in parallel (#86):** the mappings tried from the same netlist (onto
  LUT4s alone, with the wider functions, for logic depth; with and without carry chains) run at once,
  in two Yosys worker threads in the application (the browser edition runs them one after the other, in
  its one worker): the T80's synthesis 22 s instead of 32, picorv32's 12 instead of 18, as before #52
  and #54 added mappings.
- **The comparison with ISE, a design with several clocks (#53):** ISE's flow times only the clocks
  the UCF constrains, the Silinx toolchain's routing was timed (by ISE's trce) on its worst clock: VTR
  stereovision3 seemed 1.75 times slower than ISE (7.68 ns against 4.92), but its other clock is not in
  ISE's number; on the same clock it is 5.00 ns against 4.92. The comparison now takes the constrained
  clock on both sides.
- **Place and route: a routing with nodes still shared was kept (#242):** when the router stopped
  without a legal routing, the timing analysis still ran, and the register-replication pass could keep
  that routing (then refused by the routing check). It is now incomplete, its period infinite.
- **The XC3S250E's bit database rebuilt from scratch with ISE (#48):** the experiments made again
  (research/s3e-bitstream/measure-db.sh, resumable, also from the results left on the ISE machine)
  give every switch and setting of the committed database with the same bits, and 94 more switches
  (global line 4 into the I/O clock pins of every left and right I/O tile, block-RAM and clock
  tiles); two extra bits of earlier measurements removed (an I/O tile's clock pin from GCLK2 and from
  S6D4); the switches the new experiments do not reach are kept as the earlier ones measured them.
  The rebuilt database is now the committed one.
- **ISim: a command given during a run was lost (#215):** a `run` typed into ISim's command line (or
  the Run for field's Enter) while a run went on, in particular ISim's first run of 1 us just after
  it opened, was ignored without a word. Commands now run in turn, as in ISim's console: one given
  during a run, or before the first run has started, waits for it and for the commands given before
  it; Break stops the run and cancels the commands still waiting (`Command '…' cancelled (Break)`).
  The UI test of the traffic example, whose 'run all' was lost this way on CI, types it once, without retries.

## 15.10.15

In short:

- **A drawing and its HDL are one:** every schematic, ASM chart, state diagram, truth table and Petri
  net always has its HDL file, generated from it; the Design pane shows the drawing's badge first and
  the HDL's language last ([VHDL] / [Verilog]); no more *Generate HDL* or *Convert to HDL* commands.
  Projects made before are brought to this when opened, nothing lost.
- **Synthesize, Implement and Generate Programming File always work on the top module,** and say so
  when another module is selected.
- **More Verilog / SystemVerilog:** explicit port expressions, `module m(...)`, identifiers starting with
  `$`, `automatic` / `static` variables of a block.
- **Smaller designs in the Silinx toolchain:** shift registers read at a variable tap become SRL16
  shift registers, as with ISE.

In detail:

- **Design pane: the drawing first, the HDL by its language (#220):** a module's badges start with its
  drawing's (**[Schematic]**, **[ASM]**, **[FSM]**, **[Table]**, **[Petri]**: the base, bold and framed)
  and end with its HDL's, which says its language: **[VHDL]** or **[Verilog]** (the file's own: a
  drawing's HDL is made in the project's preferred language, and a Verilog file in a VHDL project
  shows [Verilog]); a module that is only HDL has just that badge. The tips say it plainly: the
  drawing is the base, its HDL generated from it.
- **A drawing and its HDL are always one (#220):** every schematic, ASM chart, state diagram, truth
  table and Petri net has its HDL file, generated from it, the drawing always the base. *Convert to
  HDL*, *Convert to HDL (HDL as base)* / *Convert to … (… as base)*, *Remove Synchronized …* and the
  Petri net's *Generate HDL file* are gone from the Design pane's menus, the badges' menus and the
  processes. The HDL stays editable: an edit of it updates the schematic, chart, diagram or table as
  before (a Petri net's HDL follows the net only). The HDL editor's banner says "Generated from
  x.sch.json — editing here updates the schematic"; the editors' links "HDL: x.vhd — generated from
  the diagram"; the HDL editor's menu has *Open Schematic* (*Open State Diagram*…).
- **A module's menu (#220):** no more *Truth Table / Karnaugh Map of this Module…* (a module is made
  from a truth table, not a truth table from a module) nor *Export as ISE Schematic* (on the
  schematic's own badge and file, as before). A truth table made from a state diagram (*Create Truth
  Tables*) gets its HDL file at once, as a new one does.
- **Projects made before (#220):** a drawing whose base was its HDL (`"base": "hdl"`) is made the base
  when the project is opened, nothing lost: as it is when its HDL is what it makes; an ASM chart, state
  diagram or truth table is made again from its HDL otherwise (the HDL file kept as it is, the console
  saying when it is not what the drawing makes: an edit of the drawing rewrites it); when that cannot
  be (a schematic whose HDL was edited, HDL that is no longer a state machine…), the HDL file stays as
  it is, a plain HDL module, and the drawing leaves the project (its file kept in the folder; a
  WARNING in the console says so).
- **Petri nets:** saving an edit of a Petri net's HDL file no longer logs "WARNING: Petri net not
  synchronized: …" (the net was read as a schematic); the net stays as it is, its HDL follows it (#222).
- **The drawing editors (#220):** no more *Generate VHDL module* / *Generate Verilog module* in the
  truth-table editor, nor *Generate HDL* in the state diagram, ASM chart and schematic editors (nor
  in the schematic's View HDL) or *Generate HDL file* in the Petri net editor: the HDL is always
  there, generated from the drawing. Changing the *HDL language* in the state diagram, ASM chart or
  Petri net editor (a schematic's *Language*) makes its HDL file again in that language and removes
  the other one ("src/x.fsm.json: its HDL is now in Verilog, src/x.v (src/x.vhd removed)"); the
  schematic toolbar's language is the one of *View HDL*. *Truth Table from Module…* stays. The undo
  / redo buttons of the truth table, state diagram, ASM chart, Petri net and schematic editors are
  now the main toolbar's (the same icons, tips "Undo" / "Redo" and look).
- **Processes on the top module (#223):** Synthesize, Implement Design (and its steps and reports),
  Generate Programming File and Emulate on Board (and the modern header's *Implement* and *Emulate*)
  always work on the project's top module. With another module selected in the Design pane they now
  say so before running ("Generate Programming File implements the top module 'top', not the
  selected module 'timer'.", OK / Cancel) instead of asking to make the selected module the top; *Set
  as Top Module* (a module's right-click menu) makes another one the top.
- **Verilog / SystemVerilog (#6):** explicit port expressions in a module's header (`module m(.a(x), .y({p, q}))`),
  Yosys's `module m(...)` (the ports: the inputs and outputs the body declares), identifiers that start with `$` (as Yosys writes them: `module $__cell`, `wire $tmp`), `automatic` and
  `static` variables of a block (an automatic one's initializer runs at each entry), and an output variable
  with an initializer that is not constant (`output integer q = off + 1;`, evaluated once at time 0). The
  other constructs of the list (packages, unions, enum ranges, structs, `wand` / `wor` ports, `$countbits`…)
  were read already; they are now tested.
- **Open synthesis: shift registers read at a variable tap become SRL16E (#5):** `q = r[k]`, or an array
  shifted word by word (`sr(to_integer(tap))`): an SRL16E per bit (past 16 stages, two per 16), where they
  were flip-flops and multiplexers (a 16 x 8 array: 8 SRL16E instead of 128 flip-flops and about 250 LUTs).
  Checked with ISE: the open flow's bitstream of such a design is byte-identical to ISE's, DRC clean.
- **Open synthesis:** a shift register on the falling edge alone gets its clock through a BUFG (#219).
- **Open synthesis:** an initial block or an initializer that reads an input of the design is refused with its
  reason (its value at time 0 is not known), where it gave a netlist of zeros (#221).
- **HDL generated from a drawing:** the HDL editor no longer shows "Generated from … — editing here
  updates …" (the Design pane's badges say where the file comes from); it says something only when the
  file is out of sync. The VHDL / Verilog of a schematic no longer has a blank line between one-line
  statements, only around the ones of several lines (#224).

## 15.10.14

- **Petri Net (Wizard) (#208):** New Source has *Petri Net (Diagram)* (an empty net, as before) and *Petri Net (Wizard)*: the inputs and outputs first (name, direction, width), the clock and the reset, then the net is created with those ports declared, with its HDL file.
- **Petri nets:** the VHDL of a net without places (just its ports) compiles (#212).
- **Design pane:** one row per module or instance, its base's icon on the left and its views as badges after
  its name: **[HDL]** and, if it has one, **[Schematic]**, **[ASM]**, **[FSM]**, **[Table]** or **[Petri]**
  (in Portuguese [Esquemático], [Tabela]…). The base's badge is bold and framed ("edits here update the
  others"); a click on a badge opens that view, its right-click shows that view's commands (Convert to HDL /
  to the drawing as base, Export as ISE Schematic, Remove Synchronized …). No more child rows for the
  synchronized views, so a module's children are only its instances; a schematic's blocks (#175) are plain
  HDL modules, no longer shown with the schematic. The tree from the keyboard: ↑ ↓ ← →, Enter, the menu key,
  Tab to the selected row's badges. **Every source has its HDL file:** a new schematic, ASM chart, state
  diagram, truth table or Petri net gets its synchronized HDL file at once, and a project with a drawing
  that has none (#177) gets it when it is opened ("src/x.vhd generated from src/x.sch.json (every source
  has its HDL)" in the console); a drawing with errors stays a module by itself until it has none (#207).
- **Silinx toolchain, DCMs:** a DCM's RST, PSCLK, PSEN or PSINCDEC tied to 1 is now tied to VCC from its own
  tile, as ISE ties it, no longer to 0 through the pin's inverter: the DCM tiles' switches from their VCC site
  are in the bit database, measured on the four devices (#190).
- **Bit database:** the XC3S250E's experiments can be made again with ISE (research/s3e-bitstream/measure-db.sh) and the
  database rebuilt from them (build-db.sh), compared with the committed one (diff-db.mjs) (#48).

## 15.10.13

- **Petri net editor (#186):** a new source type, *Petri Net* (`.pn.json`, also Tools ▸ Petri Net Editor…):
  places with tokens and capacities, transitions with guards, weighted and inhibitor arcs, Moore outputs on
  places and pulse outputs on transitions; the token game (click an enabled transition) and the clock step,
  a random run, undo / redo; PNML import and export (also the PIPE format).
- **HDL from a Petri net (#187):** a synchronous controller in VHDL or Verilog, simulated like the net; the
  net is a module of the project by itself (it can be the top), its HDL file optional.
- **Analysis of a Petri net (#188):** the *∑ Analysis* panel: the reachable markings (the reachability
  graph), whether the net is safe or k-bounded (the most tokens of each place), its deadlocks and the shortest
  firing sequence to each (*Show* simulates from there), live and dead transitions, reversibility, and the
  P- and T-invariants.
- **The site no longer says a new version is available while it still serves the previous one:**
  right after a release, for some minutes, *Help* ▸ *Check for Updates* (and the check at start-up)
  offered a version that a reload could not get yet, also on the development edition. On the site it
  now compares the page open with the one the site serves, and offers to reload when that is newer;
  the application and a downloaded Silinx-ISE.html still check GitHub's releases. The dialog is in
  Portuguese too (#198).
- **Simulator:** the Wave window's submenus (*Radix*…) no longer open past the right edge of the window, where their items could not be clicked (#201).
- **ASM chart editor:** after *Reset route*, the side panel no longer shows a *Reset route* button that does nothing (#202).
- **New Source wizard:** the first page is only the type of the new source; its file name and location are on the next page (the Module and Schematic wizards ask them on their own first page, now with a *Location* field) (#203).
- **VHDL: a function that is not pure is reported, as XST does for the Spartan-3E:** a function is pure
  unless it is declared `impure`, and one that reads or writes a signal, a port, a process's variable,
  a shared variable or a file declared outside it, or calls an impure function or a procedure that
  does, gets a warning at its `end` saying what it uses and where (*Function f is not pure: it uses
  signal 's' at line 13. VHDL 87 allowed this; VHDL 93 requires the keyword IMPURE.*), an error when it
  is written `pure function`; with its explanation (English and Portuguese) and the fix *Declare the
  function 'f' impure* (also in its package declaration), offered when no other pure function calls
  it. Silinx accepted it silently (#185).
- **Development edition:** it shows the commit and the date and time of its build in place of the version, e.g. *Silinx ISE dev:91e3a80 (2026-10-13 23:37)* (#204, #209).
- **Silinx toolchain, block RAMs and multipliers:** an enable, write enable or reset tied to 1 is now tied to
  VCC as ISE ties it, no longer to 0 through the pin's inverter; a MULT18X18S's CE and R drive the three
  enables and resets, and a MULT18X18's are tied as ISE ties them. A DCM's DSSEN tied to 1 is left open, and
  its RST / PSEN / PSINCDEC / PSCLK tied to 1 no longer fail in Place & Route (#50).
- **Schematic editor:** a wire dragged with *Keep connections* on no longer comes off the pins, I/O markers and wires its ends touch: those ends stay, joined to the moved wire by a jog (#206).
- **Diagram corpus (#205):** ten state machines in KISS2 (the FSM benchmarks' format, now read and written by Silinx) through the HDL in every encoding, style and language, the ASM chart and Yosys; twelve Petri nets of the Model Checking Contest, whose analysis gives the contest's results. The invariants of big nets are computed much faster.
- **VHDL: a statement label with the name of a signal (or of anything else declared in the same place) is an
  error, as in ISE:** the label of a process, an instance, a block, a generate or a concurrent assignment is
  declared in the architecture (or in the block / generate around it), so a signal, port, generic, constant,
  type, enumeration literal, component, subprogram or alias of that name there, or another statement with
  that label, is a redeclaration. Reported as XST for the Spartan-3E reports it (*ERROR:HDLParsers:1202*), at
  the line where the statement ends (a block's at its label), saying what clashes (*Redeclaration of symbol
  b1: the label of the instance (line 11) is also the name of signal 'b1' (line 9).*); with its explanation
  (English and Portuguese) and the fix *Rename the label 'b1' to 'b1_inst'* (`_proc`, `_gen`, `_blk`…, also
  after `end process` / `end generate`). As in ISE, a name of an outer region, of a library unit or of an
  attribute, and the labels of loops and other sequential statements, are accepted. Silinx accepted it
  silently; the technology schematic's netlist regrouped by instance no longer names a net after one of
  its primitives either (#192).
- **Windows: saving while the project is being read no longer fails** (`EPERM: operation not
  permitted, rename …`): the file's atomic replacement is retried for a moment when Windows refuses it
  because another operation has the file open (#211).

## 15.10.12

In short:

- **The HDL editor helps fix the code:** *Rename Symbol* (F2) renames a signal or port everywhere it is
  used, and an error offers *Fix: …* corrections in one click (a misspelt name, a missing declaration,
  `;` or `end`, a width mismatch…); a missing `;` is reported where it is missing.
- **Schematics as in ISE:** the gates' types under them, buses with their names, pins that connect
  where they are dropped, and any drawing (schematic, ASM chart, state diagram, truth table) can be
  the top and be implemented without an HDL file.
- **Truth tables with any number of outputs,** and expressions with `.` (AND) and `/` (NOT).
- **A new example, traffic:** a pedestrian crossing made of a state diagram, a truth table and VHDL.
- **Simulator fix:** a procedure declared in a process now updates the process's variables (a
  self-checking test bench could report OK when it was not).

In detail:

- **Schematics drawn as in ISE:** each gate shows its type under it (AND2, OR3, NAND2B1, INV…), and
  the automatic instance ids (XLXI_n) are no longer written on the sheet (the names you give are) (#172).
- **Gates of at most 4 inputs:** the 5-input gates are no longer offered (wider through Width / buses;
  the schematics that have them still open); a converted AND / OR / XOR of more operands becomes a
  tree of gates (#171).
- **A pin dropped onto a wire or a bus connects there:** a bus tap placed over a bus, a gate over a
  wire, as in ISE; a dot shows where they join (#170).
- **Buses carry their names:** a bus connected to an input (or output) shows its name, A(5:0), on its
  wires, and a bus tap shows the bit it takes with it, A(0) (#173, #174).
- **The HDL of a schematic keeps its blocks:** a multiplexer, decoder, encoder, adder, comparator,
  register, counter or flip-flop of the schematic is an entity (module) of its own in the HDL,
  instanced where the schematic has it, as ISE does with its macros, no longer all of it as discrete
  logic; the gates stay expressions. Edited as HDL, the blocks come back as the same symbols (#175).
- **A truth table has any number of outputs** (it had at most 4): the table scrolls sideways, the
  outputs' tabs wrap, each output has its Karnaugh map, its HDL and its circuit; a module of more
  than 16 output bits is read into a table, and a state diagram's *Create Truth Tables* makes one
  table of the next-state bits and one of the outputs (#176).
- **Truth table expressions take `.` as AND and `/` as NOT:** `/a.b + a./b` (A barrado written /A),
  besides `'`, `~`, `·`, `*` and the others; `/` is the bar over one letter (`/ab` is a'·b, `/(ab)`
  the product negated); the fields show the operators (XOR is `^` or `xor`) (#180).
- **Any source can be the top and be implemented, no HDL file needed:** a schematic, an ASM chart, a
  state diagram or a truth table without an HDL file of its own is a module of the project by itself,
  in the hierarchy, as the top (*Set as Top Module*), simulated, synthesized and implemented: its HDL
  is made in memory when it is needed (the application, the browser edition) (#177).
- **Rename Symbol in the HDL editor (F2, or the editor's right-click menu):** a signal, port,
  variable, constant, type, label, generic / parameter or instance is renamed everywhere it means
  the same object in the file, through the scopes of VHDL and Verilog (not in comments or strings,
  not another object with the same name; VHDL in any spelling); a port or generic also in the
  instances of its module in the other files; an invalid name, a reserved word or a clash is
  refused; one Undo reverts it (#178).
- **Quick fixes of errors in the HDL editor:** an error gets corrections that fix it in one click,
  in its tooltip (which now stays while the pointer is on it), in its row of the Errors tab
  ("Fix: …"), with Ctrl+. (Cmd+.) or the editor's right-click menu: a misspelt name → the nearest
  declared one (signal, function, type, module, port); an undeclared signal that is assigned → its
  declaration (VHDL `signal`, Verilog `wire` / `reg` with the width of its value); a missing `;`;
  a missing `end if` / `end process` / `end case` / `endcase` / `end` / `endmodule…` (where the
  indentation shows it goes); a VHDL vector of another width (zeros / `resize` / the low bits);
  a missing `use ieee.numeric_std.all;`; `=` for `<=`, `<=` to a variable, an output read
  (VHDL-93: an internal signal); a Verilog `wire` / `reg` the assignment needs, `=` / `<=` in the
  wrong always block, an incomplete sensitivity list. One Undo reverts a fix (#179).
- **A new example, traffic: a pedestrian crossing** (the second one, after *gates*): BTN0 asks to
  cross, SW1 is night mode, the LEDs are the cars' and the pedestrians' lamps and the display counts
  the seconds left to cross. Its controller is a state diagram (a Moore machine of 7 states), its
  lamps a truth table, each with its VHDL kept in sync; the timer is VHDL, the display Verilog; its
  test bench checks the lamps and the display on every clock cycle. It builds with no warning with
  the Silinx toolchain on the four boards' devices and with ISE (#181).
- **A missing `;` after any declaration is reported where it is missing:** at the end of that line,
  "expected ';' after …", with the quick fix that adds it. A VHDL attribute declaration or
  specification (the `attribute fsm_encoding of state_reg : signal is "user"` of every state
  diagram's VHDL), an alias, a file, an incomplete type, a function / procedure declaration, a
  configuration specification, a group or a disconnection without its `;` gave an error far below
  ("unexpected 'else' in declarative part"), or none at all while the next declaration was lost; a
  Verilog task call without its `;` gave "expected '='". The column is right after a number,
  string or bit-string literal too (`1.5e3`, `8'hFF`, `x"0F"`) (#183).
- **A missing `;` at the end of a statement is reported there too, whatever comes next:** a
  Verilog task call before a line starting with `#`, `@`, `->` or `{`; a VHDL procedure call before
  any statement, `next` / `exit` before a statement (it was read as their loop label) and a `wait
  until …` before a `for` loop (read as its timeout) gave an error on the next line and no quick
  fix. A Verilog `begin … end` whose `end` is missing before a module instance now stops there
  ("expected 'end' but found 'sevenseg'", with the quick fix that inserts it) instead of reading
  the instance as a statement ("expected '=' but found '#'") (#184).
- **Simulator: a procedure declared in a process uses the process's variables:** it read one of its
  own parameters in their place and its writes were lost, with no error, so a self-checking test
  bench counting its errors in a process variable from such a procedure said "OK" of a wrong
  design. Now a procedure or function declared in a process reads and writes the process's
  variables, one declared in a procedure those of the procedure (a parameter of the same name
  still hides them), through waits and recursion, also in synthesis (a procedure; a function that
  uses them is reported). The traffic test bench counts its errors this way. In Verilog the
  variables of a task or function that is not `automatic` are now static, as the standard says:
  they keep their values from one call to the next (#182).

## 15.10.11

In detail:

- **The schematic flip-flops have a Width:** FD*, FT* and FJK* store several bits (one flip-flop per
  bit, the clock and the controls shared, INIT on every bit), as the gates, multiplexers and ADD/SUB
  already did; exported to ISE as a Silinx symbol with its HDL (#166).

## 15.10.10

In detail:

- A reload of the page also comes back to the simulation (ISim) and the board emulator you were on,
  run again for the same module and model (a netlist model only while it exists) (#163).

## 15.10.9

In short:

- **The dark theme is readable everywhere:** iMPACT's note, the wizards' code, the schematic editor's
  fields and more were light text on light backgrounds.
- **A reload of the page comes back to where you were** (the open documents, the one in front).
- *Help* ▸ *About* says whether the copy in use counts its use (only the site does).
- The quality page measured again: all 38 designs of the corpus build with the Silinx toolchain.

In detail:

- *Help* ▸ *About* says whether the copy in use counts its use: the site (pmnmalo.github.io/Silinx-ISE)
  counts its visits and what is used with GoatCounter (no cookies, no personal data, linked); the
  application and the downloaded Silinx-ISE.html send nothing (#158).
- **The quality page measured again** ([docs/QUALITY.md](docs/QUALITY.md): the Silinx toolchain against
  ISE on the 38 designs of the corpus, size and speed): every design now builds with the Silinx
  toolchain, the large ones (AES, SHA-1, SHA-256, T80, neorv32) included; the comparison runs every
  week on a machine with ISE.
- **A reload of the page comes back to where you were:** the documents that were open, the one in
  front, the left pane and the Design view (Implementation or Simulation), kept for each project in
  the browser; they also come back when the project is opened again (the Design Summary only the
  first time) (#160).
- **Dark theme, readable everywhere:** iMPACT's note under *Program FPGA* was light text on a light
  yellow box; the wizards' summaries and code previews white boxes; the schematic editor's fields
  white with light text; the Test Bench wizard's drive / expected columns, Symbol Info's pin names
  and its buttons, the live simulation's bus editor, the tree arrows, iMPACT's, the pin planner's,
  the board emulator's and the dialogs' grey notes too dark. Their colours are now theme colours with
  a dark value (the light theme unchanged), and every screen is checked for readable text in both
  themes (#159).
- **A pre-release "Development build"** (https://github.com/pmnmalo/Silinx-ISE/releases/tag/dev) with
  main's files (the app zip, the Docker kit, Silinx-ISE.html), replaced after every change that passes
  the tests; never "Latest", so Check for Updates keeps to the releases (#161).
- A development build's version says when its commit was made: `15.10.9 (development, commit abc1234,
  2026-10-13 11:12)` (#162).

## 15.10.8

In short:

- **Large designs build on computers with 8 GB of RAM** with the Silinx toolchain (AES, SHA-256, a
  Z80 crashed there), and a lack of memory is said plainly, in the application and in the browser.
- **Clearer messages:** an I/O voltage conflict between banks is named, with the fix to write in the
  UCF; the constraints' warnings are counted in the process they belong to.
- **Schematics:** names as written in the design (VHDL included), and the RTL and Technology
  Schematics fully in Portuguese.
- The site counts its visits, without cookies or personal data; *Help* ▸ *Tell Us Who You Are…*

In detail:

- **Usage counts of the site:** https://pmnmalo.github.io/Silinx-ISE/ counts its visits and what is
  used (a new project, a simulation, a bitstream, a board programmed) with GoatCounter, without
  cookies or personal data; the application and the downloaded file send nothing. *Help* ▸ *Tell Us
  Who You Are…* invites the users to say hello on GitHub Discussions (#150).
- Browser edition: when Yosys crashes in the browser (out of memory, rather than an error of the
  design), the synthesis is run once more with Yosys started afresh, and the message says what
  happened (it said "Yosys failed: undefined") (#153).
- **Large designs on computers with 8 GB of RAM:** the Silinx toolchain may use three quarters of the
  RAM (it used Node's default, about 2 GB there, and AES, SHA-256 or a Z80 crashed with only "see the
  messages above"); a run out of memory says so (#156).
- Silinx toolchain, Place & Route: ports with no LOC and no I/O standard (LVCMOS25, the default)
  when every bank already holds LVCMOS33 pins failed with "not enough pads"; the error now says that
  the banks' VCCO is the cause, with the ports, each bank's VCCO and I/O standards, and the standard
  to give them (e.g. `NET "led<4>" IOSTANDARD = LVCMOS33;`) (#128).
- The warnings of the constraints found before a process runs (e.g. "port bit(s) of 'top' have no
  LOC") are now printed as part of that process, after its "Started" line, and counted in its
  "completed successfully with N warning(s)" and its icon; they were printed before it and not
  counted (#129).
- The RTL and Technology Schematics in Portuguese: the symbol palette (*<--Todos os Símbolos-->*,
  the symbols' tooltips), the properties (*Propriedades*, *Módulo …*, *Pinos (5)*, a wire, an I/O
  marker, a net name), the status bar and the Check panel were partly in English; the schematic
  editor too (#130).
- **The RTL and Technology Schematics keep the names as written in the design:** a VHDL design's
  instances, nets, ports, entities and generics showed in lower case (VHDL is case-insensitive and
  Silinx lower-cases its names); they are drawn as declared now (U_Blink, Blink_Ctrl, LED_Out), and
  the technology view names its primitives and cells like ISE's (IBUF, LUT4_119, dbL_btn), the
  Silinx toolchain's and ISE's netlists alike. *Convert to Schematic* keeps them too (#131).

## 15.10.7

In detail:

- **A first example, *gates*:** logic gates drawn as a schematic (with its VHDL kept in sync), a
  4-bit prime-number detector on the switches SW3..SW0: LD0 from NOT, AND and OR gates (the minimal
  sum of products), LD1 the same function with NAND gates only. Its test bench checks the 16 inputs.
  Listed first, before blinky, on the Start page, in the New Project wizard and in the browser
  edition (#140).
- The Start page could list its commands and examples twice, when drawn twice at once (#141).
- **https://pmnmalo.github.io/Silinx-ISE/ is always the latest release;** the development version
  (main, after every CI run that passes) is at https://pmnmalo.github.io/Silinx-ISE/dev/, says so at
  start-up and keeps its projects apart from the stable edition's (#145).

## 15.10.6

In detail:

- **Undo / Redo for everything:** Edit ▸ Undo (Ctrl+Z) undoes the project's commands, not only
  *Remove from Project*: *Remove Synchronized Schematic / ASM / FSM / Table*, *Convert to
  Schematic…*, *Rename*, *New Source*, *Delete Folder*, *Design Properties*… (the menu names the
  command; Redo does it again), and reaches every editor (text, schematic, ASM, FSM, truth table,
  pin planner); the truth table and the pin planner have undo now (#136).
- The site (GitHub Pages) and any single-file edition built from a commit that is not a release
  say so: `15.10.5 (development, commit abc1234)` (in Portuguese, *em desenvolvimento*) in the title
  bar, the Design Summary and the start-up message. The site is published from main after every CI
  run that passed, before the release is tagged, and showed the next version as if it were
  released. A release's build shows the version alone (#135).
- **A schematic alone in the project can be the top module:** *Set as Top Module* on a schematic,
  ASM chart, state diagram or truth table without HDL generates its HDL (kept in sync, the drawing
  staying the base) and makes it the top (#137).
- **Auto-assign from Board works for any port names:** the ports no board name matches (a, b, y
  of a schematic) go by direction onto the free pins: inputs on the switches, then the buttons;
  outputs on the LEDs; the pin planner says which went where (#138).

## 15.10.5

In short:

- **The browser edition keeps projects in a folder on your disk** (Chrome, Edge: *File* ▸ *Open
  Workspace Folder…*), in the full application's format, a build's reports, FPGA view and netlist
  read back from it after a reload; the browser's storage stays the default.
- **Back-annotate Pin Locations and View Technology Schematic** work with the Silinx toolchain (no
  ISE), in the full application and in the browser edition.
- Fixes, each a GitHub issue.

In detail:

- Hidden files of an example (a Mac's `.DS_Store`) are no longer copied into new projects nor into the
  single-file edition.
- Browser edition: the New Project wizard says where the project goes, this browser's storage or the workspace folder by name (it said the full application's workspace folder, ~/Silinx-projects).
- **The browser edition keeps projects in a folder on the disk** (Chrome, Edge): *File* ▸ *Open
  Workspace Folder…* (also on the Start page) and a folder chosen once, for instance
  `Silinx-projects`. Each project is a normal project folder in it, as the full application writes
  it (`silinx.json`, `src/`, `sim/`, `constraints/`, and `build/` with the bitstream), so the same
  folder opens in the full application and a project's folder can be zipped for a submission. The
  browser remembers the folder (when it asks for the permission again: *Reopen <folder>* on the
  Start page); *Copy Browser Projects to the Folder* copies the projects kept in the browser, *Use
  Browser Storage* goes back to the browser, and the status bar shows which is in use. Firefox and
  Safari cannot open a folder: the item is disabled there, and says why (#107).
- **Back-annotate Pin Locations in the Silinx toolchain** (no ISE), in the full application and in
  the browser edition: the pads the placer chose for the ports without a LOC are written as Xilinx
  pin2ucf writes them (build/*top*_pins.ucf) and, after the same preview and confirmation as in the
  ISE modes, added to the project's UCF; the constraints already there are kept. Built again from
  that UCF, every port stays on its pad (#118).
- **View Technology Schematic in the Silinx toolchain** (no ISE), in the full application and in the
  browser edition: the netlist of its synthesis (Synthesize runs first when needed) drawn by the
  schematic engine of View RTL Schematic, as ISE's technology view: LUTs, flip-flops, MUXF5-8, carry
  chains, block RAMs, multipliers, DCMs, I/O and clock buffers, one block per instance of the design
  (pushed into as in the RTL view; a large top module's own logic in one block per signal); the
  cells named after the signals they drive. A LUT's properties show its function, from its INIT, as an
  equation and a truth table (#119).
- In a workspace folder, a build is still there after the page is reloaded: the Design Summary
  (utilization, timing, the detailed reports), the processes' states, *View Implemented Design
  (FPGA)* and *View Technology Schematic* come back from the project's `build/` folder
  (`build/reports.json`, the FPGA view's model in `build/open/fpga-view.json`, as the full
  application keeps them, and the build's files) without building again; when
  the sources changed since, the processes are marked out of date, as in the full application. In
  the browser's storage a build still lasts for the session only (#126).

## 15.10.4

- **The browser edition programs the board:** on https://pmnmalo.github.io/Silinx-ISE/, *Configure
  Target Device* ▸ *Program FPGA* loads the bitstream into the FPGA of a Basys2 or Nexys2 through the
  board's own USB port, with nothing to install (WebUSB: Chrome or Edge; Firefox and Safari do not
  offer it). *Initialize Chain* lists the board's JTAG chain, and *Choose .bit…* programs a bitstream
  from the disk. The Platform Flash (PROM) is still programmed by the full application (#112).
- The browser edition's messages about programming: no "install openFPGALoader…" at startup, and a
  failed attempt says why instead of "see log" (#111).
- The start-up update check asks GitHub at most once an hour: reloading the page many times no
  longer runs into GitHub's rate limit (#115).

## 15.10.3

In short:

- **Silinx in the browser at https://pmnmalo.github.io/Silinx-ISE/** (the single-file edition, rebuilt
  from main after every CI run that passes, so the site always has the latest fixes): a course page, Moodle for instance, links it as a URL (an uploaded HTML file is
  filtered by Moodle and does not run). **It also builds the bitstream:** *Implement Design* and
  *Generate Programming File* run the Silinx toolchain in the browser (Basys2, Nexys2), and the
  `.bit` is downloaded (#108).
- **A fourth example, *clock***, set with the buttons; the Start page offers the four.
- **The synthesis tool is a project setting:** *Silinx* (no ISE needed) by default for new projects,
  or *XST*.
- **Large designs build several times faster** with the Silinx toolchain (AES: about 6 minutes
  instead of 40), and **circuits are faster** (register replication, a mapping for logic depth: EPFL
  max 69.9 → 37.1 ns).
- **More of the Spartan-3E:** every DCM site and more than one DCM per design, more DCM settings, the
  side global buffers and the IOB registers measured; better clock placement.
- **More VHDL and SystemVerilog:** packages, records, textio, extended identifiers, initial values as
  in simulation; light8080 and NEORV32 now go through the whole open flow.
- **The nightly checks guard the circuits' size and speed** on 38 open-source designs.
- Many fixes, each a GitHub issue.

In detail:

- **A fourth example, *clock*** (Verilog): a digital clock on the 7-segment display (HH.MM, the
  decimal point blinking every second; 24- or 12-hour), set with the buttons (hours, minutes, seconds
  to zero to synchronise it with another clock, and a minutes-and-seconds view), with a self-checking
  testbench; it runs on the Basys2-100 / 250 and Nexys2-500 / 1200 and is on the Start page.
- The packer, the ISE flow's automatic pins, the Board Emulator and Back-annotate Pin Locations read the UCF with the top's ports, as Check Constraints does: `x[1]` is a bit of `x` only when `x` is a bus, any other name is kept as written.
- **Design corpus: the flow users get.** The corpus placed without the delay table, on every
  global buffer, and without register replication; it now places and routes as the app's flow
  and `open-flow.mjs` do, through one shared helper (`core/fpga/place-route.js`: the placer with
  the delay table and the clock / global buffer sites of known bits, tries, timing-driven routing,
  STA, register replication), so its quality numbers are users' (#79, #88). The app's flow and
  `open-flow.mjs` place and route exactly as before. New quality baselines: replication kept on
  epfl-bar, epfl-i2c and vtr-diffeq2; critical paths within -7 % / +10 % (one design +23 %:
  vtr-ch-intrinsics), the same on a second run.
- **Design corpus: the README's results table is generated** from `expected.json`
  (`run.mjs --table`, and `--update` rewrites it), with each design's device, slices, LUTs, FFs and
  critical path; a test checks that it is the one the committed expectations give (#89).
- **Check Constraints, ports that differ only in case:** in a Verilog design, ports such as `a` and
  `A` are kept apart, as ngdbuild does (measured with ISE 14.7): a UCF name is taken as written
  first, else the one port that matches ignoring case, now with a warning instead of the earlier
  error (ISE accepts `NET "CLK"` for a port `clk`); a name that matches several ports only ignoring
  case is an error.
- **The synthesis tool is a setting of the project** (New Project Wizard and Design Properties:
  *Silinx*, no ISE needed, or *XST*, Xilinx ISE): new projects use Silinx. A project's processes
  and its Implement Design follow it, whatever the execution mode of Toolchain Settings (XST runs
  with the ISE set there); a project from before the setting follows Toolchain Settings.
- **Open synthesis: constant function calls** of a function that reads no signal (verilog-lfsr's
  `lfsr_mask(n)` in a generate loop) are evaluated by the translator, their values literals: the
  CRC-32 synthesizes in 2.4 s (was 160 s) and the PRBS31 in 1.7 s (was 110 s), with the same cells
  and without the ~160 `Replacing memory … with list of registers` warnings each (#13).
- **Open synthesis: start values as in simulation.** A VHDL integer signal with no initial value
  starts at `T'left` (1 for `range 1 to 10`), a `bit` at `'0'`, and an output port at its default
  value (`q : out std_logic := '1'`) in the netlist too: they powered up at 0 there (#60).
- **VHDL testbenches: light8080's own testbench runs and passes.** Subprograms of one name from a
  package and from a use clause are overloads of each other (a package's `hstr(unsigned)` hid
  `txt_util`'s `hstr(std_logic_vector)` and called itself without end); string slices
  (`buf(1 to n)`), `'high` / `'low` of strings, string aggregates (`(others => ' ')`), and string
  signals, which kept their initial value whatever was assigned to them; a character literal picks a
  `character` overload, `std_logic_vector(u)` and `std_logic_vector'(…)` a `std_logic_vector` one
  (#72).
- **Simulator: errors, not crashes:** a function calling itself without end is a simulation error
  (`recursion too deep in function f`), and so is a scheduled assignment that does not fit its target;
  both stopped the simulator with an internal error (#73).
- **SystemVerilog packages:** `package … endpackage` with parameters, typedefs, enumerations and
  functions, in its own file or with the design; `import p::*;` in the compilation unit, a module's
  header or body, or another package; scoped names (`p::W`, `p::word_t`, `p::f(x)`). Simulated and
  synthesized by the open synthesis (#6).
- **More SystemVerilog** (#6): `return` statements; a function's `output` arguments when it is
  called in an expression (they were not assigned); `$floor`, `$ceil`, `$sqrt`… of values known at
  run time; an instance's parameter by its hierarchical name (`u.P`); `rand` / `randc` / `const`
  qualifiers; packed unions; enumeration name ranges (`S[3]`, `T[5:7] = 20`).
- **Silinx toolchain: clocks on block RAMs and multipliers.** A clock's block RAMs and
  multipliers go only on the sites whose clock pins its global buffer's lines reach on switches of
  known bits, as its flip-flops already did. A clock on the bottom GCLK pin (N9 on the FG320, M4 on
  the CP132), whose buffer BUFGMUX_X2Y1 reaches none of them yet, takes BUFGMUX_X2Y11 through
  general routing, with a warning that says so; it kept BUFGMUX_X2Y1 and the block RAM's clock could
  not be routed (#56).
- **Silinx toolchain: a clock with no LOC that drives a DCM** goes on a pad whose dedicated path of
  known bits reaches the DCM's CLKIN (B8 on the XC3S250E and XC3S500E), as one that drives a global
  buffer does since #49; it took any free pad (#57).
- **Silinx toolchain: a clock LOC'd on a GCLK pin** takes the global buffer its dedicated path
  reaches. On a side GCLK pin (K3 on the FG320, G3 on the CP132) those are the side buffers, whose
  settings are not in the bit database yet (#45): a top or bottom buffer, through general routing as
  before, now with a warning that says why (#58).
- **Silinx toolchain: every DCM site, more than one DCM per design.** Each DCM goes on a site from
  which its clock outputs reach global buffers of their own on switches of known bits (the buffers
  matched to all the DCMs' outputs together; then the buffers whose lines reach the clock's loads,
  the DCMs' CLKIN / CLKFB too; then a CLKIN its clock pad reaches on a dedicated path; then the
  top-left DCM first), or on the site its UCF gives (`INST "u_dcm" LOC = "DCM_X1Y0";`). The
  XC3S1200E's top-left DCM is DCM_X1Y3 (its DCM_X0Y1, where the one DCM went, is a side DCM whose
  outputs reach only the side buffers, #45); CLK2X180 now works on the bottom-left DCM of the
  XC3S250E, XC3S500E and XC3S1200E, CLKFX180 on every device (the XC3S100E has no CLK2X180 path
  yet: the design fails with the reason). A DCM's CLKIN from a pad through general routing (no pad
  reaches the XC3S100E's DCMs, nor the other DCMs than the top-left one, on known switches) is
  said in a warning. Fixed on the way, two settings ISE's bitgen derives from the design: a DCM
  whose CLKIN comes from a global buffer (a BUFG before the DCM, two DCMs in cascade) had one bit
  wrong in the .bit, and a DCM whose CLKFX and CLKFX180 drive nothing three (#47).
- **Design corpus:** NEORV32 and light8080 now go through the whole open flow (synthesis, the
  netlist compared with the RTL cycle by cycle, place and route); light8080's, secworks-sha1's and
  secworks-aes's own testbenches pass. Every design of the corpus synthesizes and builds.
- **Design corpus: a quality guard.** The nightly run records the size and speed of every circuit
  the flow completes (slices, LUTs and flip-flops after packing, the critical path by Silinx's
  timing analysis, and the device) and fails when a design gets larger or slower beyond the
  placement noise (5 % on size; 15 % on the critical path, which moves by up to 12.5 % between
  placer seeds; `--size-tolerance` / `--period-tolerance`); designs that got smaller or faster are
  listed, and `--update` records them. Each stage's time is compared with a baseline per machine
  class (`times.json`: `ci`, `local`): a synthesis or a flow 1.5 times slower (and 30 s longer) is a warning, and the run
  prints its slowest designs (test/designs-corpus/README.md). The nightly job also builds the
  corpus's board designs (corpus-int2float, -prbs, -spi, -serv: testbench, open flow, bitstream)
  and fails when one does not.
- **Silinx toolchain: register replication**, as XST and ISE's map do. After placing and routing,
  the flip-flops of many loads (8 or more) whose output is slow on the critical path are copied,
  each copy driving the loads of one region of the chip; the design is placed and routed again and
  the faster of the two kept (Place & Route's log says what it did; the Design Summary counts the
  copies when they are kept). Every copy has the flip-flop's inputs and initial value: the circuit
  computes the same. EPFL bar (a register of 256 loads) 11.1 -> 10.3 ns by ISE's trce, T80 23.0
  -> 22.4 ns. `open-flow.mjs --no-replicate` turns it off (#4).
- **Against ISE** (trce on both, the designs of docs/QUALITY.md furthest from ISE): EPFL max 69.9
  -> 37.1 ns (ISE 25.7), EPFL priority now builds, 16.8 ns (ISE 20.8, faster than ISE's),
  vtr-stereovision3 8.6 -> 7.6 ns, verilog-uart 11.9 -> 10.2 ns, verilog-i2c-master 11.2 -> 10.9 ns;
  every one byte-identical to ISE's bitgen with no DRC error or warning
  (research/s3e-route/README.md, "The design corpus against ISE").
- **Silinx toolchain: logic depth.** The open synthesis maps a design a second time for depth (ABC's
  SOP balancing, `if -g`, then the usual area recovery) and keeps that netlist when its estimated
  critical path is shorter without more LUTs in proportion (or it is as fast and smaller). Logic
  written as long chains of gates gets much faster: the EPFL max benchmark 71 -> 37 ns (ISE: 25.7),
  EPFL priority 43 -> 17 ns (ISE: 21), vtr-stereovision3 -9 %, verilog-i2c-master -6 %, T80 -4 %;
  -6 % over 32 designs of the corpus and the examples (geometric mean), with 1 % fewer slices. The
  examples keep their netlists. Synthesis runs Yosys's LUT mapping twice on designs of up to 5000
  LUTs (research/synth-quality/README.md, "Logic depth") (#52).
- **Silinx toolchain: timing analysis.** A path through a carry chain's data input taken from BX
  (`CY0F = BX`, as comparators are packed) into the XOR of the slice's G stage was not timed, and a
  LUT input the LUT does not read (the carry's data input on a LUT pin) counted as a path through
  the LUT; the false loops this made left everything after them out of the analysis. verilog-uart
  of the design corpus: 6.7 ns by Silinx's analysis, 11.9 ns by ISE's trce on the same routed
  design; now 12.1 ns, and the placer and router see that path (10.2-10.4 ns routed). The carry's
  data input on F1 / F2 (1.16 ns to COUT) and BY into the Y flip-flop (0.36 / 0.38 ns) are trce's.
  On 14 designs of the corpus the analysis is within 0-5 % of trce (part of #26).
- **Silinx toolchain: nets that could not be routed on the XC3S1200E** (EPFL priority and adder of
  the design corpus, and the no-UCF test design on some placements): the router's search for a
  sink stopped after 400 000 nodes; a sink it did not reach is now searched again, much further.
  Both now build to a bitstream (#33).
- **VHDL textio:** `write(l, …); writeline(output, l);` prints in the simulation console (ISim's
  console in the Simulation view): integers, vectors, characters, strings, booleans, `time` (in a
  `unit`), reals (`digits`), in a `field`, `left` / `right` `justified`, and `hwrite` / `owrite` /
  `bwrite`. Testbenches read test vectors from the project's data files with `readline`, `read` (and
  its `good` flag) and `endfile`; a file's own lines are shown with its name. These procedures
  were ignored, with a warning (#76).
- **Design corpus: the board designs synthesized with synth_xilinx options** (SERV on the Basys2:
  `-nobram -nolutram -nosrl`) build again: Yosys was given only the design, not Silinx's
  shift-register map and cells its script reads (`File silinx_srl_cells.v not found`). The options
  now go to every synth_xilinx step, and `-nosrl` also leaves out Silinx's own shift-register
  mapping; the same for the corpus runner's retry without RAMs (#62).
- **UI tests without the npm dependencies** (a fresh clone or worktree) stop at once with
  `npm dependencies missing from node_modules (…): run npm ci`, instead of failing every test with
  the page's `Cannot read properties of undefined (reading 'fold')` (no CodeMirror served). One UI
  test runs alone with `node --test --test-name-pattern=…` (tested; README) (#64).
- **I/O Pin Planning keeps a hand-written `NET "opcode[1]"` as written** (the HDL name of the
  escaped port `\opcode[1] `, whose UCF name is `_opcode[1]_`), so Check Constraints still says
  which name ngdbuild finds; it was rewritten as `opcode<1>`, a net of no port. Only the bits of
  the top's buses written `x[1]` or `x(1)` become `x<1>`: ngdbuild finds all three spellings
  (measured with ISE 14.7) (#63).
- **VHDL extended identifiers keep their case** and are names of their own, as in VHDL
  (`\Mixed\`, `\mixed\` and `mixed` are three names; they were all `mixed`). In the UCF they are
  XST's names, between underscores even when their text is a plain name: `\Mixed\` is `_Mixed_`,
  `\a.b\` is `_a_b_`, `\Bus\(1)` is `_Bus_<1>` (measured with ISE 14.7), in I/O Pin Planning, the
  automatic pins, Check Constraints (which reports `NET "Mixed"` as ngdbuild's error, with the
  right name) and the Silinx toolchain's pads (#65). The pads of Verilog escaped names that start
  with a digit (`\1abc `) are XST's `_1abc_` too (they were `__1abc_`).
- **SystemVerilog: variable initializers that are not constant** (`integer b = a + 1;`) are evaluated
  once at time 0, before the initial and always procedures (#6).
- **Open synthesis: names that differ only in case** (Verilog `a` and `A`, VHDL `\Mixed\` and
  `\mixed\`) keep their names in the netlist; the second was renamed (`a_1`, `\mixed\_1`), so
  its pin in the UCF no longer matched (#83).
- **Open synthesis: a clock or asynchronous reset that is a bit of a vector** (`rising_edge(clks(k))`
  in a `for … generate`, `clks(k)'event and clks(k) = '1'`, Verilog `posedge clks[0]`) is that bit;
  it was the whole vector, which Yosys refuses (`posedge … not 1 bit wide`) (#98).
- **Silinx toolchain: large designs build several times faster** (secworks AES on the XC3S1200E,
  7662 slices: about 40 min -> about 6 min, synthesis included; place and route of SHA-256 on the
  XC3S250E 600 -> 32 s, of T80 99 -> 16 s, of NEORV32 305 -> 27 s), with the same circuits.
  - The placer's annealing keeps its state in flat arrays (the slice grid, positions, the nets'
    pins and connections), keeps the bounding box of each net of more than 6 pins up to date as its
    pins move (VPR's incremental bounding boxes) instead of scanning its pins at every move, and
    compiles its timing graph once instead of looking every pin up by name at every temperature.
    The placements are the same as before, bit for bit: 6-45x faster (SHA-1 714 -> 16 s of CPU
    with its register replication).
  - The router's search does less work per node, and on large nets less searching: a search for a
    sink first stays in the net's region (its pins' bounding box and 3 tiles around it; anywhere
    when that has no path), and a non-critical sink of a net whose tree has more than 200 nodes is
    searched from the tree's nodes near it, not from the whole tree (as VPR does): 1.5-2x faster.
  - The same critical paths and slices: +0.02 % (geometric mean of the routed critical paths of the
    examples and 4 corpus designs, seeds 1-3, register replication on), the examples' bitstreams
    byte-identical to ISE's bitgen with no DRC error or warning (#55).
- **Silinx toolchain: more DCM settings** (measured with ISE, #46): `CLKIN_DIVIDE_BY_2 => TRUE` and
  `DESKEW_ADJUST => "SOURCE_SYNCHRONOUS"` are accepted (they were refused as not in the bit database),
  and the DCM's frequency ranges follow ISE's rule exactly: the input period in whole nanoseconds
  (20.9 ns counts as 20), doubled by `CLKIN_DIVIDE_BY_2`. A CLKFX near 5 MHz, or an input period of
  200-300 ns, is no longer refused. Byte-identical to ISE's bitgen on all four devices.
- **Bit database: the global buffers of the left and right sides** (measured with ISE, #45): their
  switches set no bits (the values measured before were wrong and would have given wrong bitstreams),
  a switching BUFGMUX one bit per buffer, and the centre tiles' switches from them are all known now.
  ISE's designs with any of the 16 side buffers are byte-identical on all four devices (the Silinx
  toolchain's placer does not put clocks on them yet).
- **Bit database: registers in the IOBs** (measured with ISE on every pad of the four devices, #44):
  input, output and tristate flip-flops and DDR registers with all their settings, with the input delay
  ISE chooses by itself, as XST places registers in the IOBs by default. Such designs implemented by ISE
  are written byte-identical to ISE's bitgen; another input delay, or a register setting not measured
  on that pad, is refused as not in the database. (The Silinx toolchain does not put registers in the
  IOBs yet.) The DCM settings for a CLKIN from a global buffer and an idle CLKFX are now measured on
  every DCM of the four devices, and 150 more switches of the DCMs are known.

## 15.10.2

In short:

- **No Xilinx tool needed for the Basys2 and Nexys2:** the *Silinx toolchain* is the default mode of a
  new installation and builds bitstreams for the Basys2-100 / 250 and the Nexys2-500 / 1200 by
  itself (synthesis, place and route, bitstream), byte-identical to ISE's bitgen on the tested
  designs, with block RAMs, multipliers, distributed RAM, shift registers and DCMs.
- **Two more examples**, *pong* (a game for two) and *stopwatch*, besides *blinky*: each runs on all
  four boards' chips and builds with no warning, with the Silinx toolchain and with ISE.
- **How it compares with ISE** ([docs/QUALITY.md](docs/QUALITY.md)): on open-source designs, the
  Silinx toolchain's circuits are smaller than ISE's (23% fewer LUTs) and about 15% slower; XST
  cannot read 11 of those designs.
- **More VHDL and Verilog:** records, slices of arrays, file objects, null ranges, Xilinx primitives
  from Verilog, hierarchical names in testbenches, and design checks closer to XST's.
- Many fixes, each tracked as a GitHub issue (https://github.com/pmnmalo/Silinx-ISE/issues).

In detail:

- **Silinx toolchain: a clock with no pin location** could fail in Place & Route (a design with no
  UCF: its clock could not reach a block RAM on the switches of known bits). A clock input with no
  `LOC` is now put on a free GCLK pin, a pad whose dedicated path reaches a global clock buffer (B8
  -> BUFGMUX_X2Y11 on every Spartan-3E device of the toolchain), as ISE places a clock (#49).
- **Escaped port names in the UCF** (Verilog `\opcode[0] `, as in the EPFL benchmarks): XST names
  such a port `_opcode[0]_` in its netlist (between underscores, with `. + / \ ~ ^ * = % & $` turned
  into `_`; a plain name's `$` too: `b$c` is `b_c`), the only spelling ngdbuild finds (measured with
  ISE 14.7). The automatic pins of the ISE modes, I/O Pin Planning, the board's pin assignment and
  the Silinx toolchain's pads now use it, and Check Constraints accepts it — and reports the HDL
  name (`NET "opcode[0]"`) as the error ngdbuild gives (ConstraintSystem:59), with the right name.
  The EPFL designs epfl-ctrl, epfl-cavlc and epfl-int2float now build with ISE to a bitstream (#34).
- **Silinx toolchain: an input pad that drives nothing** is written as ISE's bitgen writes it: the
  pad without its input, whatever its I/O standard (3 bits per pad differed). Measured on every pad
  of the four Spartan-3E devices (`I:NOLOAD` in the pads' bit database). The open flow leaves such
  inputs out, as ISE's map does; the corpus designs that differed (verilog-lfsr-prbs,
  spi-fpga-master, verilog-axis-fifo) are byte-identical to ISE's bitgen (#18).
- **Silinx toolchain: multiplications by a constant** (such as the stopwatch example's x * 6554)
  failed in Place & Route on every Spartan-3E device: the multiplier's inputs tied to 1 could not
  be routed on the switches of known bits. Each is now tied, as ISE does, to the constant-1 source
  of the block-RAM interconnect tile its pin comes from (#35). A block-RAM word with a bit in a
  parity position that its port writes but does not read (a 14-bit memory) is laid out on the data
  bits instead, as ISE's map does: ISE's design rule check warned about it.
- **The Silinx toolchain for the other Spartan-3E boards:** the Basys2-100 (XC3S100E), the Nexys2-500
  (XC3S500E) and the Nexys2-1200 (XC3S1200E) have their bit databases, measured as the
  Basys2-250's was: Implement Design and Generate Programming File work for them with no Xilinx
  tool. blinky and lab11 on each are byte-identical to ISE's bitgen, with no DRC error or warning.
  The pads are measured for the boards' packages, every I/O standard, drive, slew and pull of every
  pad (CP132 and FG320): the Spartan-3E Starter Kit's settings (LVTTL, drive 8 and 4, fast and slow
  slew, pull-ups and pull-downs) work in the open toolchain too, byte-identical to ISE's bitgen.
  The tile types' bits are shared by the four devices (`research/s3e-bitstream/db`: one
  file of tile types, the layout, LUTs, block RAMs and pads per device), read by one loader.
- **All the DCMs measured:** the settings of every DCM of the four devices (the XC3S1200E's eight
  too), their pins' routing, any input period (`CLKIN_PERIOD`: the DCM's frequency ranges, as ISE
  computes them), and `STARTUP_WAIT` (the configuration waits for the DCM's lock), which the open
  toolchain now accepts. Designs of every DCM of each device implemented by ISE give the same .bit
  with Silinx's writer (but for the side global buffers' clock tiles, not measured yet, and the
  XC3S1200E's long-line splitters).
  Fixed on the way: a DCM's clock outputs CLK0, CLK2X and CLKDV had their enable bits set whether
  they were used or not (each output used has its own bit).
- More of the XC3S250E (and the others) measured: the DCMs' pins, the inputs and the select of
  every global clock buffer (BUFGMUX) of the top and bottom; a placement where the DCM outputs
  could not all get a global buffer is found now.
- **The rest of the Spartan-3E in the Silinx toolchain:** block RAMs (inferred by the open synthesis
  or instantiated: `RAMB16_S*` / `RAMB16_S*_S*`, every port width and write mode, `INIT_xx`,
  `INIT` / `SRVAL`), multipliers (`MULT18X18`, `MULT18X18S`, `MULT18X18SIO` with its registers),
  distributed RAMs (`RAM16X1S`, `RAM16X1D`, `RAM32X1S`, `RAM64X1S`), shift registers in SRL16 LUTs
  (inferred: chains of 3 or more flip-flops without reset; `SRL16(E)(_1)` instantiated) and the
  DCM (`DCM_SP` on the top-left DCM: CLK0, CLK2X, CLKDV, CLKFX on global buffers, LOCKED; input
  period 20 ns) are packed, placed, routed and written into the bitstream with no Xilinx tool. ISE
  converts the routed designs to the same .bit with no DRC error or warning. What the bit database
  does not have yet fails with the reason (the DCM outputs CLK2X180 / CLKFX180 on a global buffer,
  a second DCM, `BUFGMUX` clock switching, the SRLC16 cascade). Shift registers make designs smaller (the srl
  fixture: 63 slices instead of 79). Unused inputs no longer get a pad. Yosys's "Resizing cell
  port" messages of its block-RAM mapping are not warnings of the design.
- **Design corpus:** 38 real open-source designs (SERV, PicoRV32, FemtoRV32, NEORV32, light8080, T80,
  UARTs, SPI, I2C, CRC, FIFO, AES / SHA / SipHash, the VTR and EPFL benchmarks; Verilog and VHDL;
  fetched at pinned commits, never committed) go through every stage of the toolchain, with the
  time and the warnings of each (`npm run test:designs`, test/designs-corpus/README.md): 24 complete the
  fully open flow on the XC3S250E (10 through an I/O wrapper). Fixed on the way: `ieee.math_real` (`ceil`,
  `log2`… and `UNIFORM`), aggregates such as `(others => '0')` as port and generic actuals,
  `boolean(…)`, generics of an unconstrained array type, a Verilog `?:` of strings in a parameter,
  `$display("%02d")` padding with zeros, a spurious "function assigns signal" warning for tasks and
  procedures, a function's local memory in the open synthesis (a CRC and a PRBS generator became
  constant). Fully open bitstreams of four corpus designs for the Basys2, among them SERV, a RISC-V
  CPU, counting on the LEDs.
- Silinx's own messages are labelled Silinx, not XST: the design checks of Check Syntax
  (`WARNING:Silinx:646 - Signal <…> is assigned but never used…`) keep XST's number for the same
  finding, and their explanation says "Xilinx ISE's XST reports this as Xst:646"; the open
  toolchain's errors are `ERROR:Silinx`. XST's own messages (ISE modes) keep `Xst`.
- **Design checks, closer to XST:** an input bus of which only some bits are read gets the unused
  bits, as XST does (`WARNING:Silinx:647 - Input <btn<2:1>> is never used.`), and Verilog names
  that differ only in case (`scorer` and `scoreR`, which XST renames) are reported
  (`WARNING:Silinx:863 - Name conflict (<scorer> and <scoreR>, …)`) (#38). The checks without an
  XST number are labelled `Silinx`, no longer `Lint`, and the `$clog2` warning is at the line of
  its declaration or parameter, no longer at line 1 (#16).
- **Verilog: `$clog2` inside a constant function:** `$clog2` of the function's own argument
  (`function integer f(input integer v); f = $clog2(v); endfunction` with `localparam W = f(N);`)
  was refused as `expression is not constant`. It now folds when the function is evaluated as a
  constant, and works at run time too (#59).
- **Xilinx primitives from Verilog:** a Verilog design can instantiate the UNISIM primitives
  (`BUFG`, `FDCE`, `SRL16E`, `RAMB16_S9`, `DCM_SP` …) with no library clause, as XST allows: they
  simulate with Silinx's models and stay primitives in the open synthesis (#17). In the browser,
  Check Syntax, the RTL schematic, the behavioural simulation, the emulator and the Test Bench
  Wizard now find the primitives of a VHDL `library UNISIM` design too; the project's module list
  still shows only its own modules.
- **Design checks:** an input read only by a pin a primitive samples at its clock edge (an
  `FDCE`'s `D` or `CE`) is no longer reported as `Input <d> is never used.` (#66).
- **VHDL null ranges, the rest:** an integer subtype with a null range (`range 5 to 3`) is null:
  loops over it do not run and arrays of it have no element. A slice with non-constant bounds
  against its direction (`v(i + N - 1 downto i)` with `N = 0`) reads and writes nothing. A process
  that only assigns vectors of no bit no longer gives the open synthesis an empty `always` block
  (#61).
- **VHDL integer subtype attributes:** `'high`, `'ascending`, `'leftof` and `'rightof` of a
  descending subtype (`integer range 10 downto 0`) were those of an ascending one; `'low` and
  `'high` of a null range follow its direction (#67).
- **VHDL: slices of arrays of vectors** (`mem(0 to 3)` of an array of `std_logic_vector`) are
  simulated: read, assigned to variables and signals, from aggregates, sliced again, null, in
  constants and as arguments (#11). The open synthesis reports them as not supported yet, at their
  line.
- **VHDL: unconstrained parameters:** a function or procedure called with vectors or arrays of the
  same width but other index ranges took its first call's `'range`, `'left` and indexing
  (`v'left` of a `7 downto 0` argument after a `15 downto 8` one gave 15) (#68).
- **Verilog testbenches: hierarchical names** of a named block's variables (`dut.state_logic.f`,
  `blk.inner.v`, in generate blocks too) are read from the block's process, from the testbench,
  another process or a module above; `$dumpvars` accepts scopes (the testbench's own name, an
  instance, a path) (#12).
- **Open synthesis: VHDL records** are packed vectors, each field at its own bits: a record was
  written with every field at the first field's width, so wider fields were cut off in the netlist
  (#69). Arrays of records (and of arrays) are memories of those vectors; a field or element is
  read and assigned at any depth, also with a variable index; a record port connects to an
  element of an array of records (neorv32's `trace_o => cpu_trace(i)`), constant arrays of records
  are tables (#10). Constant slices of arrays (`h(0 to 1) <= m(2 to 3)`) are synthesized word by
  word.
- **VHDL: array slices with run-time bounds** (`br(n to size - 1) := (others => x"00")` in a
  function, as light8080's `objcode_to_bram`) are simulated (#11).
- **VHDL file objects** (`file f : TEXT open write_mode is "log.txt";`, `file` parameters, `LINE`
  variables) elaborate; the textio calls on them are still ignored, with their warning.
- **Open synthesis: VHDL bit indexes by `to_integer`** (`sh(to_integer(cnt)) <= din`) are the
  vector itself for Yosys, no longer a 32-bit signed index: nandland's SPI master in VHDL is 49
  LUTs (was 74; 46 in Verilog), and a small receiver gives exactly the Verilog design's cells. A
  signal driven only by a constant (`w_cpol <= '1' when MODE = 2 else '0';`) is read as that
  constant, so a reset value that names it is a constant (#14).
- **VHDL: constrained string variables** (`variable v : string(1 to n);`) start with their n
  characters; they were empty, so writing a character into one stopped the simulation (neorv32's
  version banner) (#70).
- **Fully open bitstreams, tested on the board:** blinky and lab11, synthesized, placed, routed
  and written by Silinx with no Xilinx tool, work on a Basys2-250.
- **How the Silinx toolchain compares with ISE** ([docs/QUALITY.md](docs/QUALITY.md)): the size and
  speed of what it generates against ISE 14.7 (XST, map, par) on the open-source designs of the design
  corpus, on the same chip and the same top, ISE given its best chance (map packing tightly, a tight
  clock constraint), both critical paths by ISE's trce. On the 22 designs both build: 23% fewer logic
  LUTs and 18% fewer slices than ISE, critical paths 15% longer; XST cannot read 11 of the designs.
  ISE projects can set map's packing (`impl.mapPackFactor`, map -c).
- **Two more examples:** *pong* (LED Pong, a game for two players, in Verilog: the ball is the lit
  LED, each player returns it with a button, the score on the 7-segment display) and *stopwatch*
  (in VHDL: seconds and hundredths, laps stored in a block RAM and recalled, the decimal digits
  computed with the multipliers), besides *blinky*; the Start page offers the three. Each has a
  self-checking testbench and runs on every device of the Silinx toolchain (Basys2-100 / 250,
  Nexys2-500 / 1200). They are also Silinx's test designs: their testbenches, the board pin
  assignment, the whole Silinx toolchain on every device and, with ISE, byte-identical bitstreams.
- A project created from an example for another board gets that board's pins (the example's UCF
  was copied unchanged: a Basys2's pins on a Nexys2).
- **The Silinx toolchain, the default:** *Toolchain Settings* has a new execution mode, *Silinx
  toolchain (experimental, no ISE)*, and a new installation starts in it, so students need no
  Xilinx tool for the Basys2 and Nexys2 boards (a saved configuration keeps its mode; one that says
  `open`, the name it had during development, is read as `silinx`). *Synthesize*, *Implement
  Design* and *Generate Programming File* then run Silinx's own flow on the server (Yosys
  synthesis, pack, place, route on the switches whose bits are known, static timing against the
  UCF's PERIOD constraints, bitgen), with the usual console, process icons, Stop and *Design
  Summary* (utilization and timing, marked "Silinx toolchain"). It writes `build/<top>.bit` (what
  *Configure Target Device* programs) and `build/<top>_prom.bit`; *View Implemented Design (FPGA)*
  shows the routed design on the device description. The supported devices' descriptions and bit
  databases ship with Silinx: the mode has no ISE setting. A device the Silinx toolchain does not
  support, or a design it cannot implement yet, fails with the reason and what is missing (use an
  ISE mode); the processes that need ISE are disabled in that mode, with a tooltip. Developers can
  build another device's description from an ISE (`research/s3e-route/build-device.mjs`).
- The device descriptions of the XC3S100E-CP132 (Basys2-100), XC3S500E-FG320 (Nexys2-500,
  Spartan-3E Starter Kit) and XC3S1200E-FG320 (Nexys2-1200) ship with Silinx too (their bit
  databases are next).
- The device description of the XC3S250E-CP132 (Basys2-250) ships with Silinx
  (`core/fpga/devices/`): the Silinx toolchain places, routes and writes the bitstream for that board
  without ISE (from the interface, see above, or from the command line:
  `research/s3e-route/open-flow.mjs`). For other
  devices it is built once from the user's own ISE installation (`~/.silinx/devices/`, which takes
  precedence). The whole open flow on blinky is now part of the tests.
- What is planned, bugs and feature requests are GitHub issues
  (https://github.com/pmnmalo/Silinx-ISE/issues; TODO.md is gone). The Silinx toolchain does not support the Spartan-6 boards (Nexys3,
  Atlys) yet; it will.
- Verilog / SystemVerilog constructs Silinx now reads, simulates and synthesizes (found by the
  corpus of Yosys's test designs): hierarchical names into generate blocks and named blocks
  (`blk.x`, `blk[i - 1].x`, `genblk1.t`: unnamed generate blocks are named as IEEE 1364-2005
  12.4.3 says), the module's own name as a scope, functions and tasks called by hierarchical names,
  arrays of instances (`inv u[3:0] (…)`), `wand` / `wor` / `tri0` / `tri1` / `supply0` /
  `supply1` ports (and wired nets with several drivers in synthesis), typedefs, enumerations,
  packed structures, multi-dimensional packed arrays, unpacked `[N]`, casts `T'(x)`, declarations
  outside modules, `localparam` in functions and blocks, `specparam` and `specify`, immediate
  assertions, `$size` / `$left` / `$right` / `$low` / `$high` / `$increment` / `$dimensions`,
  `$countbits` / `$onehot` / `$onehot0` / `$isunknown`, `$floor` / `$ceil` and the other real math
  functions, elaboration tasks (`$info`, `$warning`, `$error`), `*=` `/=` `%=` `<<=` `>>=`, strings
  used as values, macros that join the text around them (`` `WIDTH'b0 ``, `` f_`name ``), `` ``
  pasting and default macro arguments, an output net's `= value` as a continuous assignment.
- **Smaller, faster netlists from the open synthesis** (research/synth-quality/README.md): lab11
  now needs 165 slices instead of 403 (XST: 180) and runs at 14.1 ns instead of 17.6 ns in the
  open flow; the blinky example 86 slices instead of 104 (XST: 99), 7.7 ns instead of 11.8 ns.
  Yosys's LUT mapping for the Spartan-3E (LUTs of up to 8 inputs, each split into LUT4s and
  MUXF5-8) is replaced by ABC on LUTs of up to 6 inputs at their real cost; arithmetic that reads
  at most 6 input bits (VHDL integers, `shift_left(to_unsigned(1, 32), n) - 1`) is written as a
  table of its values instead of 32-bit carry chains; the packer puts flip-flops fed by
  flip-flops into the free slots of carry-chain and multiplexer slices. Size budgets in the tests
  (test/synth-quality.test.js, a new 42-state accumulator machine fixture `cpu8`).
- **Faster designs from the Silinx toolchain's place and route** (research/s3e-route/README.md):
  lab11 runs at 11.6 ns by ISE's own timing analyzer (was 13.7 ns; ISE's whole flow: 10.9 ns), the
  blinky example at 7.4 ns (was 8.0; ISE: 6.7), and both are placed and routed faster. The placer
  is timing-driven as VPR's (the estimated delay of every connection, from a table of the fastest
  routes of the device, weighted by its criticality), the router may swap the inputs of a LUT
  (rewriting its equation), as ISE's does, and counts the load each new branch of a net puts on
  its critical connections. `open-flow.mjs --tries N` keeps the fastest of N placements.
- The open synthesis of a Spartan-3E design no longer prints Yosys's "Shift register inference
  not yet supported for family xc3se" (it came on every run, whatever the design) nor counts it
  as a warning.
- The differential test of the open synthesis (RTL against the netlist) no longer reports a false
  difference when the RTL's state is at X at power-up: an output of the netlist agrees when it
  agrees with the RTL powered up at 0 or with the RTL with its X's (where a case on an X state
  takes its default), port by port; a difference from both is still reported (#20).
- VHDL null ranges (`N - 1 downto 0` with N = 0, `0 to -1`) have no element, as the language
  says: they gave one bit (two for `-1 downto 0`). Generic designs with optional ports of N = 0
  bits simulate and synthesize (a vector of no bit is left out of the open synthesis's module and
  its ports) (#15).
- Open synthesis: a VHDL state machine whose state signal has no initial value powers up in its
  first state, as in simulation and with XST: the default initial value of an enumeration (or
  boolean) signal is written for Yosys, which could start the re-encoded state register in another
  state (#9).

## 15.10.1

- Fixed in Safari: after a click on a schematic symbol, an ASM chart block or a state of a state
  diagram, the editor's keys (Delete, F1, Ctrl+C…) did nothing. Tests now run what users get: the
  release zip is unzipped, started with its launcher and synthesizes in the browser without the
  Internet; the main UI flows run in Firefox and WebKit as well as Chrome; the unit tests and the
  launchers run on macOS and Windows as well as Linux.
- The modern interface shows the version after "Silinx ISE" in its header, as the classic title bar does.
- *Help ▸ About* and the README: Silinx ISE is described as developed to support the teaching of
  Digital Systems, without naming an institution (Silinx is the work of Pedro Maló, in his own time).
- Fixed: exporting a Xilinx ISE project with several schematics could report identical custom
  symbols as different ("custom symbol … differs"), when the export took more than a second.
- **Synthesis front end** (`core/synth-verilog.js`, first version): Silinx writes the elaborated
  VHDL / Verilog design as one flat synthesizable SystemVerilog module for Yosys, so that synthesis
  needs neither GHDL nor ISE (and can run in the browser). lab11 and the blinky example go through
  Yosys to a Spartan-3E netlist that behaves as the original in simulation.
  It also handles initial blocks (initial values of registers and memories) and Xilinx primitives
  instantiated by name (block RAMs, clock buffers, DCMs, shift registers): every test design
  synthesizes to a netlist that behaves as the original.
- **Packer and placer** for the Spartan-3E (`core/fpga/`, first version): Yosys's netlist packed
  into slices (LUTs, flip-flops, latches, carry chains, F5-F8 multiplexers), I/O pads and global
  clock buffers, and placed by simulated annealing; checked with ISE (routing of our placement and
  simulation of the result) on lab11 and blinky.
- **Router** for the Spartan-3E (`core/fpga/route.js`, first version): PathFinder over the device's
  routing graph (built once per computer from ISE's device report, never shipped). lab11 and blinky,
  synthesized, packed, placed and routed by Silinx, with ISE only writing the bitstream, pass ISE's
  design rule check and work on a Basys2.
- *Toolchain Settings*: the SSH mode (now *Remote host with Xilinx ISE via SSH*) can run the ISE flow in a Docker
  image on the remote host (*Docker image on the remote host*), so another machine with the
  Silinx ISE image can build, e.g. an Intel Mac, where ISE runs natively instead of emulated as on
  Apple Silicon (lab11: about 70 s instead of 10 minutes).
- FPGA view: selecting a site or a net no longer rebuilds the list of nets (a click takes half the
  time, with less memory churn in Safari).
- Memory tests (`test/ui/memory.test.js`): opening and closing the FPGA view, the editors, ISim and
  the board emulator, selecting in the FPGA view and switching projects many times must leave
  nothing behind (JS heap, DOM nodes and event listeners after garbage collection), and the page
  must stay within a memory budget. The same scenarios also run in WebKit, Safari's engine
  (`npm run test:webkit`, with Playwright), within a memory budget.
- **Bitstream writer** for the Spartan-3E XC3S250E (`core/fpga/bitstream.js`, `bitgen.js`, first
  version): a placed and routed design to a `.bit` file, from a bit database measured by black-box
  experiments (`research/s3e-bitstream/db`). For switch -> LED, blinky and lab11 implemented by ISE,
  the file is byte-identical to ISE's bitgen (CRC on and off). Designs placed and routed by Silinx
  still use a few routing switches not measured yet. The package's pads come from the device
  description built from the user's own ISE, never from the repository.
- A test that the repository holds no data that must not be published
  (`scripts/check-private-data.mjs`, run by `npm test` on every tracked file; `--history` also checks
  the whole git history): e-mail addresses, home folders with a user name, logins, computer names
  and network addresses, passwords, keys and access tokens, and Xilinx files (ISE's outputs,
  licences, device reports).
- **Synthesize - Yosys (open)**: a new process that synthesizes the design in the browser, without
  Xilinx ISE: Silinx's front end writes the design as one flat module and Yosys, compiled to
  WebAssembly (YoWASP), maps it onto the cells of the device family in a Web Worker. The console
  shows Yosys's messages and the utilization (LUTs, flip-flops, multiplexers, carry logic, clock
  buffers, I/O…); the netlist is saved in `build/open/` (JSON and Verilog). Generated HDL files in
  `build/` are no longer added to the project's sources. (The app's download grows by the Yosys
  WebAssembly module, about 75 MB unpacked.)
- **Fully open bitstreams** for the Spartan-3E XC3S250E: the router can keep to the routing switches
  whose bits the database knows, and the packer can bring a carry out through an XOR stage instead
  of the unmeasured XB / YB pins, so blinky and lab11 go from VHDL / Verilog to a `.bit` file with no
  Xilinx tool at all (`research/s3e-route/open-flow.mjs`). Checked against ISE: 0 DRC errors and a
  bitstream byte-identical to ISE's bitgen for the same routed design (8 placements, CRC on and off).
- **Timing** in the open flow (`core/fpga/timing.js`): a delay model of the XC3S250E -4 fitted to
  ISE's own timing reports of Silinx-routed designs (0.1 ns rms per connection), a static timing
  analysis (within 1.4% of ISE's on average), and timing-driven routing and placement: lab11 runs at
  17.2 ns (58 MHz) instead of 21-24 ns, under the Basys2's 20 ns clock; blinky 11.5 ns.
- **Bit database, stage D** (`research/s3e-bitstream`): blinky and lab11 placed and routed by
  Silinx are byte-identical to ISE's bitgen; the I/O, block-RAM and DCM tiles share the CLB's
  switch box; the open SLICEM bits are the SLICEM instance type; new: the clock pins from every
  global line, carry outputs, long lines, terminal tiles, block-RAM contents and settings,
  multipliers, distributed RAM and shift registers, the top-left DCM, and I/O standard / drive /
  slew / pull per pad (92% of the device's routing switches; `research/s3e-bitstream/README.md`).
- Tests with Xilinx ISE on another machine (for the developers, e.g. an Intel Mac where ISE runs
  natively): `SILINX_ISE_HOST=user@host` runs the real ISE flow tests there (79 s instead of ~15 min
  emulated), and `npm run check:open-flow` checks the fully open flow against ISE (design rule check,
  byte-identical bitstreams). The open flow now synthesizes with the WebAssembly Yosys (nothing to
  install).
- Open synthesis fixes: instantiated FD, FDE, FDR, FDS, FDC, FDP, FDRS, FDCP, LD, LDE, LDC and LDP
  primitives (not in Yosys's library) become the equivalent FDRE / FDSE / FDCE / FDPE / FDRSE /
  FDCPE / LDCE / LDPE cells; a process variable's declared initial value is kept (it was lost: the
  flip-flop started at 0); a procedure's variables start at their declared values on every call.
- Open flow: the clocks' periods are checked against the UCF's PERIOD constraints (the clock found from its port through the clock buffers; met / not met with the slack, in timing.txt).
- One XDL writer (`core/xdl.js` `writeXdl`) for the router, the bitstream tools and the placer (`core/fpga/xdl-write.js` removed).
- Verilog: SystemVerilog size casts `W'(expr)`.
- **Differential tests** of the front ends, the simulator and the open synthesis: every example
  and test design is simulated as RTL and as the Yosys netlist with the same random stimulus,
  cycle by cycle; Yosys's own test designs (`npm run test:corpus`, fetched at a pinned version)
  and VlogHammer-style random expressions (`npm run test:vloghammer`) are compared with Yosys.
  Fixed what they found: Verilog signed operands in unsigned comparisons, shifts, `?:` and nested
  expressions are zero-extended (they were sign-extended); `?:` of a signed and an unsigned operand
  of the same width is unsigned; `case` items and expression are extended together (signed only
  when all are); the synthesis front end wrote `>>>` of an unsigned value as an arithmetic shift
  and could truncate a `case` item wider than the expression.
- How the open toolchain for the Spartan-3E is being developed: `docs/OPEN-TOOLCHAIN.md`, and the
  first experiments in `research/s3e-bitstream`.

## 15.10.0

- **A new, modern interface** (the default), alongside the classic Xilinx ISE one (*View ▸
  Interface*, remembered by the browser; both have every feature). It has a header with the
  project and a search box; an activity bar for Start / Design / Files / Libraries; document tabs
  above the editor; and labelled buttons for the design flow (Check, Simulate, Implement, Emulate,
  Program). Dialogs, menus and controls follow current design practice, the whole interface is
  usable from the keyboard, and the window adapts to small screens.
- **Light and dark themes** in the modern interface: they follow the system by default, or are
  chosen with *View ▸ Theme* or the header button. Diagram sheets stay light paper; the HDL editor,
  ISim and every panel follow the theme.
- **Command palette** (Ctrl+K / Cmd+K, or Ctrl+Shift+P): search any menu command or project file by
  name and run or open it from the keyboard. In Portuguese it finds commands by their Portuguese
  or English names.
- **View Implemented Design (FPGA)**: how ISE placed and routed the design inside the chip
  (*Processes ▸ Implement Design ▸ Place & Route*, or *Tools*).
  - The device as its grid of logic blocks, I/O pads, block RAMs, multipliers, clock buffers and
    DCMs, with the used sites coloured by module (at any hierarchy level) and the utilisation.
  - Click a site to see its logic: LUT equations with the names of their input signals,
    flip-flops (clock, enable, set / reset, initial value), carry chain and multiplexers; for a
    pad, its port, package pin, direction, I/O standard, drive and slew rate.
  - **Inside a slice** (Spartan-3 / Spartan-3E): a diagram of the slice with the parts the design
    uses (LUTs F and G, F5 multiplexer, carry chain, output multiplexers, flip-flops FFX and FFY)
    in the module's colour and the pins that carry signals; the other slices of the same CLB.
  - **How each function is implemented**: a LUT is a 16-bit memory. The view shows the truth
    table it holds, with the names of its input signals, its 16 memory bits and the INIT value,
    and marks the LUTs that only pass a signal through (route-thru).
  - Nets: what a net connects and the tiles its routing goes through; a site's connections;
    the global clock network; search by name.
  - The Design hierarchy and the chip select each other's modules.
  - Zoom and pan. The view reads the routed design with ISE's `xdl` (a new `fpgaview` step that
    only runs Place & Route first when needed).
- **Board emulator: the power switch works.** Off stops the board (LEDs, displays and LCD go
  dark); on starts the design again from time 0, as configuring the FPGA at power-up does.
  Switches moved while the board is off are read at power-up.
- **Clear Recent Projects** (*File ▸ Recent Projects*, and a link on the Start page). The projects
  themselves are kept.
- Fixed: Check, Simulate, Emulate and Program stayed disabled while an implementation was running;
  only Implement has to wait for it (also for *Run* in the right-click menu of the processes).
- Fixed: the Design Summary could not be reopened from the Processes panel once closed, unless a
  module was selected in the Implementation view. *Design Summary/Reports* is now there whatever is
  selected, in both views.
- *Help ▸ About* describes what Silinx does today (schematics with live simulation, FSM and ASM
  editors, truth tables and Karnaugh maps, wizards, netlist simulation, board emulator).

## 15.9.3

- **Remove from Project keeps the file** in the project folder, as in ISE. The file leaves the
  project (hierarchy, compilation, simulation, synthesis) and is listed as *Not in project* in the
  Files view; right-click ▸ *Add to Project* brings it back.
- **Undo / Redo of Remove from Project**: the toolbar Undo / Redo buttons, *Edit ▸ Undo / Redo*
  and Ctrl+Z / Ctrl+Y (Cmd+Z / Cmd+Shift+Z on a Mac) outside an editor, and the *Undo* button of the
  message shown after removing.
- **Top-Level Source Type** in the New Project wizard: HDL, Schematic, State Machine (FSM),
  State Machine (ASM) or Truth Table. A non-HDL type starts the project with that document and its
  synchronized HDL module `top`.
- **Release notes**: this changelog; each GitHub release and the update dialog show what is new.
- Fixed: two project reloads close together could leave the older file list on screen.
- **Licence: GNU AGPL-3.0** (was Apache-2.0), with an additional permission to combine Silinx
  with elkjs (EPL-2.0); *Help ▸ About* shows the licence, the no-warranty notice and the source code link.
- **Licence notices**: NOTICE and THIRD-PARTY-NOTICES.md (the open-source components Silinx ships
  and their licences), also embedded in Silinx-ISE.html; *Help ▸ About* shows the copyright and the
  components.

## 15.9.2

- **Tri-state buffers** in the schematic library (category *Tri-State*): BUFE, BUFE4, BUFE8,
  BUFE16, BUFT, BUFT4, BUFT8, BUFT16. Several tri-state outputs and inout markers may share a bus;
  live simulation shows Z (blue) and conflicts (red); Symbol Info datasheets with Z in the truth table.
- Exported ISE schematics write tri-state buffers as Silinx symbols with their HDL (ISE's FPGA
  libraries have no BUFE/BUFT); checked with ISE 14.7 for Spartan-3E.

## 15.9.1

- New Source: *State Machine (FSM)* is listed before *State Machine (ASM)*.

## 15.9.0

- **State Machine (FSM) editor**: Moore and Mealy bubble diagrams with plain-language checks
  (unreachable states, overlapping or incomplete conditions), state / transition / encoded tables,
  truth tables of the next-state logic, a step-by-step simulation panel, and VHDL / Verilog kept in
  sync both ways; conversion to and from ASM charts.
- **Beginner-friendly messages and design checks**: every error keeps its ISE message, followed by
  an explanation and how to fix it (English and Portuguese); warnings for latches, missing
  sensitivity entries, two drivers, combinational loops, unused or unassigned signals, clock misuse
  and more. *Edit ▸ Design Checks* turns the warnings off; `-- silinx: ignore` silences one line.
- **Symbol Info**: a datasheet for every schematic symbol (description, pins, parameters, the
  truth / mode table, the equivalent VHDL and Verilog).
- **New Source reorganised**: Truth Table, Module (HDL), Module (Wizard), Schematic (Diagram),
  Schematic (Wizard), State Machines, Test Bench (HDL), Test Bench (Wizard), constraints, memory files.
- **Module Wizard** and **Schematic Wizard**: ports (inputs, outputs, inout), combinational or
  sequential templates with clock / reset, ready-placed I/O markers.
- **Inout ports** in the Module, Schematic and Test Bench wizards; Test Bench Wizard *No vectors*
  mode (a skeleton to write the stimulus yourself).
- No simulation top any more: *Simulate* runs the module selected in the Simulation view.
- Creating a file that already exists asks whether to replace it.
- *Implementation only* association in *Add Copy of Source*.
- The app checks for a newer release when it starts.
- Files are saved atomically (no half-written file after a crash).

## 15.8.0

- **Live schematic simulation** (like Logisim): *Simulate* in the schematic editor; click inputs,
  step or run clocks, wires coloured by their value, outputs and stored values shown.
- **Truth Table / Karnaugh Map tool**: tables of up to 6 inputs, K-maps with the groups drawn,
  minimal SOP / POS, canonical forms, a check of your own expression, and a linked VHDL / Verilog
  module kept in sync both ways; gate schematics generated from the table.
- I/O Pin Planning leaves the I/O standard at *default* unless one is chosen.

## 15.7.0

- **Test Bench Wizard**: self-checking test benches (exhaustive, random, counting, walking or typed
  vectors; expected values typed in or taken from the current design); every mismatch is reported,
  then TEST PASSED / TEST FAILED. The benches also run in Xilinx ISim.

## 15.6.1

- 1-bit vector ports are written as `x<0>` in the UCF; latch gates get global clock pins;
  schematic flip-flops with unconnected CLR / CE generate valid HDL; Files view can rename and
  delete folders.

## 15.6.0

- Many simulator fixes and additions found by a large new test suite (VHDL records, 2-D arrays,
  overloading, case-generate; Verilog macros with arguments, `include`, defparam, named events …).
- Netlists from the real ISE 14.7 are checked against their RTL for 13 designs.
- The board emulator no longer jumps up and down (seen on Safari); knob turns are never lost.
- About and README: Silinx ISE was developed to support the teaching of Digital Systems,
  because AMD/Xilinx discontinued Xilinx ISE.

## 15.5.0

- **Board emulator**: run the design on a drawing of the real board (Basys2, Nexys2, Spartan-3E
  Starter Kit with its LCD and rotary knob); the timing of slow designs is scaled so they visibly run.
- **Netlist simulation**: simulate and emulate the post-synthesis, post-translate, post-map and
  post-place & route models from ISE; technology schematic, timing, power and pin reports.
- DCMs synthesize their real output frequencies; many more Xilinx primitive models.
- A full audit: fixes in the simulator, schematics, ASM charts, UCF handling, server and web UI.

## 15.4.0

- *Help ▸ Check for Updates*; About shows the GitHub project and the developers.
- *Add Copy of Source* only (Add Source removed); New Source left the File menu.

## 15.3.0

- Import / Export of Silinx ISE projects and of Xilinx ISE projects (.zip).
- ASM charts: case (multi-way) boxes and bit / slice conditions; printing and Save PNG.
- Processes panel with ISE-style expand / collapse that remembers its state.

## 15.2.4

- RTL schematic: *Up* and *Push into* buttons.

## 15.2.3

- Distribution files renamed: `Silinx-ISE.html`, `silinx-ise-<version>.zip`.

## 15.2.2

- Maintenance release.

## 15.2.1

- Schematic and ASM editors: Backspace deletes the selection again (as Delete).

## 15.2.0

- The project is renamed **Silinx ISE** (it was XAIlinx ISE).

## 15.1.0

- Schematic editor: T and JK flip-flops, the full D flip-flop family, inverted-input gates,
  decoders, encoders, demultiplexers; moving components keeps their connections.
- The version is shown in the title bar.

## 15.0.2

- ASM charts: registers power up with their reset values.

## 15.0.1

- Window titles without the version number.

## 15.0.0

- Version numbering in the style of ISE (15.x); the project is called *XAIlinx ISE*.

## 0.3.0

- Beginner-friendly start: double-click launchers and a step-by-step guide.

## 0.2.0

- README: download section.

## 0.1.0

- First release: ISE-style projects with VHDL / Verilog, a syntax-checking editor, the schematic
  editor and ASM state-machine charts kept in sync with HDL, ISE schematic import / export,
  behavioural simulation with waveforms, Xilinx ISE 14.7 implementation (Docker / local / ssh),
  UCF checks, ISE project import, English and Portuguese interface.
