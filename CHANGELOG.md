# Changelog

What changed in each version of Silinx ISE. The newest version is first. Each section is also
the "What's new" text of its GitHub release.

## 15.13.0

In short:

- **Schematic Try it: the clock's tick seen:** a click on a clock's I/O marker (one cycle) turns it green for a moment;
  it stays green while the clock runs.
- **Schematics: I/O markers take their direction from what they connect to:** a marker wired to a symbol's output
  becomes an output, to an input an input (to a bidirectional pin, bidirectional).
- **The Board Emulator's status line is readable while it runs:** the time, the cycles and the rate change twice a
  second, not on every frame (it flickered).
- **No false PERIOD warning:** a PERIOD on the clock of a design with one register stage (no path between two of its
  flip-flops) is no longer reported as "no clock of the design comes from this port"; it is met, with no path to time.
- **The Design pane:** no "Hierarchy" heading above the design tree any more; the tree comes right under the View
  selector.
- **Handwritten input, a preview:** hand-drawn Boolean expressions, truth tables and schematics (gates,
  flip-flops, wires), read offline, with a pad that zooms and has Redo, and a Pen and Touch Test: while they do not
  read real handwriting well enough, they are in the Development menu of the development builds only.
- **Program FPGA after a reload:** in the browser, Program FPGA offers to implement the design again when its
  programming file is gone (a build is kept for the browser session only), instead of failing with "no bitstream".
- **Programming on an iPad:** the message no longer says to use Chrome or Edge, already in use there: no browser on an
  iPad or iPhone can program the board (all run on Safari's engine, without WebUSB); it says to program the
  downloaded .bit from a computer or an Android tablet.
- **No Design Utilities in the Processes:** the group and its View HDL Instantiation Template are gone, in every
  interface; the HDL editor's Instantiate module writes the same instantiation.
- **Try it on the RTL and the Technology Schematic:** View RTL Schematic and View Technology Schematic have the
  schematic editor's Try it: click the inputs (switches, bus values, the clock's Step or Run) and watch the
  circuit work, its wires and pins coloured by their values, inside an instance too; Esc stops.
- **The Tasks interface: View RTL Schematic in Implement:** Synthesize's RTL Schematic opens in Implement, where its
  process is, as the Technology Schematic does, not in Design.
- **A wire drawn as one stroke:** with Add Wire, trace a stroke with the pen, a finger or the mouse from a pin or
  a wire to another one, along any curve: it becomes a wire between them, routed square around the symbols.
  Clicking corner by corner works as before.
- **Silinx as an app:** Chrome and Edge offer to install the site (*Install app*; *Add to Home screen* on an
  Android tablet or a classroom's interactive display). It opens in a window of its own, with no address
  bar, and once a project has been opened it opens and implements with no network too.
- **The Tasks interface's Edit task is called Design:** its button, its tooltip and its page; "Design" in
  Portuguese too.
- **No project chip in the header:** the project's name, which opened Open Project from the header of the modern and
  Tasks interfaces, is gone; a project is opened from File or the Start page, and its name is in Design.
- **The Tasks interface without the status bar:** its bottom line (the last message, the device and board, the
  storage) is gone; the messages are in the message centre, the device and board in Design.
- **Tasks ▸ Simulate:** the simulator's icons are in the waves' own top line (where "Default.wcfg" was): the waves get
  the toolbar's height.
- **Program PROM:** every operation of the PROM (Program PROM, Verify, Erase, Back up PROM, Reload FPGA from PROM)
  is shown at once; no "More…" button.
- **Program FPGA implements first:** with no programming file yet, or one older than the sources, Program FPGA asks
  whether to implement the design first, and programs the board once it is built. The Tasks interface's Program no
  longer has the lines "No programming file yet — Implement" and "Up to date with the sources".
- **Tasks ▸ Program:** the programming panel uses the whole width of the window, as in the modern and classic
  interfaces.
- The Tasks interface's Emulate: the emulation's time and rate (t = … ns · … cycles · … kHz) right below the board,
  in place of the board's line.
- The Tasks interface's Emulate: the board keeps its size when the window is made smaller; the Watch and the VGA
  monitor go below the board instead, and the emulator's area scrolls.
- The Tasks interface's Emulate: the Board Emulator opens with its Watch panel shown, beside the board (below it on a
  narrow screen).
- **Simulator: Save and Load Wave Configuration:** the simulator's toolbar saves the wave window's signals (their order
  and radix), dividers, groups and markers as a file of the project (.wcfg, as ISim's) and loads one back into the
  current simulation; Save VCD is no longer in the toolbar.
- **Tasks ▸ Simulate:** choosing the model (Behavioral, Post-Synthesis … Post-Place & Route) or the test bench simulates
  it at once (a model not generated yet is offered to be generated first); the Simulate button beside them is gone.
- **Tasks ▸ Simulate:** no status line under the waves ("Ready … Sim Time"): the waves have its height.
- The Tasks interface's Edit: a Test tab after Design lists the project's test benches, so the Design tab shows the
  design alone.
- **Technology Schematic:** an instance whose registers drive a signal of the top directly (blinky's BCD counter
  driving the display's digits) has its own block, not its cells in the top's logic.
- The Console no longer shows errors of scripts that are not Silinx's (such as "ERROR: func sseError not found" from a
  browser extension or the host application, after the app stayed open a long time).
- The console's filter "Check Syntax" is called "Design" (*Projeto*): its lines are the design's checks.
- The Tasks interface: a schematic's Check writes its errors and warnings in the console below, as every process
  does, rather than in a panel of the editor; clicking one shows its item in the drawing.
- The schematic editor's (and a truth table's schematic's) **Simulate** is now **Try it** (*Experimentar*): it runs
  the circuit in the drawing, click the inputs and watch the wires, and is no longer confused with the design flow's
  Simulate (the test bench's waveforms).
- The Tasks interface: a task's coloured dot is explained by its button's tooltip, for example "Implement — done with
  warnings".
- The header no longer shows "Silinx ISE" and its version, in the modern and classic interfaces (as in the Tasks
  interface): the classic title bar shows the project and its document, the modern header the logo and the project.
  The product and version are the logo's tooltip, the window's title and in Help ▸ About.
- The Tasks interface's Edit: Start, Design, Files and Libraries are tabs at the top of the side panel, above the
  hierarchy, rather than a column of their own: more room for the editor.
- **Blinky counts on the display:** the blinky example shows on the board's 4-digit 7-segment display how
  many steps its LED pattern has made, in decimal from 0000 to 9999 (SW0 resets it, a pause stops it).
- **New Source: shorter type names:** *Schematic*, *Finite State Machine (FSM)*, *Algorithmic State Machine (ASM)*,
  *Petri Net* and *Test Bench* (in Portuguese too); the New Project wizard's top-level types the same.
- **New Source, < Back and another type:** after going back and choosing another source type, the wizard's steps,
  its Next > / Finish button and the File Name page follow the new type, not the first one.
- **Implement in the browser, faster the first time:** the site downloads Yosys (17 MB) and the board's device
  description when a project opens, in the background, and keeps them; Implement no longer waits for them,
  nor downloads them again after the site is updated.
- **New Source: a Wizard button:** the source types have no "(Wizard)" entries any more; on the File Name and
  Location page, *Wizard | < Back | Next > | Cancel*: Next > makes the plain source, Wizard opens the type's wizard
  (Module, Schematic, Petri Net, Test Bench, the Clocking Wizard, Block Memory) with the name typed.
- Schematics: VCC and GND have a Width in the Properties panel; a VCC or GND of 8 bits ties a whole bus to 1s or 0s.
- **Board Emulator on a tablet or a phone:** it starts at once on the event-driven engine, instead of compiling the
  design first; the Engine selector still runs it compiled, and the engine you choose is remembered.
- The Schematic Wizard suggests no ports any more: its Inputs and Outputs page is only the table, where you add your
  own ports.
- **Schematic editor:** an I/O marker's Properties no longer show Rotate, Mirror and Delete buttons; the toolbar
  and Ctrl+R / Ctrl+M / Del still turn, mirror and delete it.
- **Schematic wires no longer overlap:** a wire drawn along another wire, over a pin or a marker, or through a symbol
  is nudged a step aside onto a clear path; a symbol moved or pasted onto a wire has that wire routed around it; the
  schematics made from HDL draw their nets with wires where they used to fall back to labelled stubs. Only the drawn
  paths change: the wires' ends, the nets and the generated HDL stay the same.
- **Simulate a truth table's schematic:** the schematic generated from a truth table has the schematic editor's
  Simulate: click its inputs and watch its outputs and wires, the values of the table; the drawing stays read-only.
- One console in the modern and classic interfaces too: the simulator's (SSim's) console and command line and the board
  emulator's messages are in the Console at the bottom, with filters by source (All, Design, Simulation,
  Emulator, Synthesis, Implementation, Board).
- **The simulator is SSim:** Silinx's own simulator is now called SSim (the Silinx Simulator) in the Processes
  pane, its tab, its console and prompt, the New Project wizard and the README; ISim is Xilinx's (its "I" is ISE's).
  The console's force command is `ssim force`; `isim force` still works.
- **Edit Stimuli: one bit of a bus at a time:** in ISim, with a bus expanded, a click on the wave of one of its bits
  changes that bit as a 1-bit signal's (0 → 1 → Z → X on an input, - → 0 → 1 for an expected output); the bus's value
  follows from its bits.
- **The Board Emulator's status line no longer disappears:** at some window widths the line at the end of its bar
  (t = … ns · … cycles · … kHz (…% of real time)) shrank to nothing or was cut short; it now goes to a row of its own
  when the controls leave no room for the whole line, in every interface.
- **The waveform viewer keeps the whole of a two-finger scroll:** the time's scrollbar, following the view a frame
  later, could take back the gesture's last step (a few pixels of time) when its scroll event came late.
- **Shorter control paths with the Silinx toolchain:** a critical LUT that one or two LUTs cannot make shallower is now
  rebuilt as a tree of LUTs (by ISE's timing iwls05-sasc 12.7 % faster and a quarter smaller at Optimization Effort High, itc99-b13 9.6 %,
  fpu-adder 7.3 %).
- **Faster designs with wide state decoding:** a critical function of 6 or 7 signals that no LUT tree makes shallower
  is now built as XST does, LUTs into the slice's wide multiplexers (MUXF5, MUXF6, MUXF7): verilog-uart 12 % faster,
  vtr-stereovision3 3.5 % (with fewer LUTs).
- **Faster small designs at Optimization Effort Normal with the Silinx toolchain:** Place & Route makes two placements
  of a design of 500 slices at most and keeps the faster, as High does: 1.25 % shorter critical paths on average, up to
  14 % by ISE's trce (the clock example), for a second or two more on a small design; a larger one is placed once, as
  before.
- **Open synthesis:** a large round-robin arbiter written as gates takes about 8 % fewer LUTs and slices at High; the T80
  routes about 7 % faster at High.
- **Block RAMs and multipliers on any global clock:** a block RAM's port B and a multiplier's registers can now take any
  of the eight top and bottom global clocks in the Silinx toolchain (before, only one of them, so a design with two
  such clocks was refused), and a clock on any global clock pad reaches its buffer on the pad's dedicated path.

In detail:

- **CI: the browsers job's time (#1126):** Firefox and then WebKit take about 25 minutes now, so the step has 40 minutes
  and the job 60 (.github/workflows/ci.yml).
- **The release's tests (#1117, #1118):** after #1111, pong's open-synthesis netlist is 1012 cells and its word-level
  model 1203 / 439 cells, and the clock's tables are 32 (test/compiled-words.test.js, test/ui/open-toolchain.test.js).
  The UI tests read SSim's console from its lines' text: since #925 the simulation tab's copy is hidden, and WebKit's
  innerText of a hidden element is empty. #967's test needs the Chrome DevTools Protocol (chromeOnly), and
  test/timings.json is measured again.
- **A clock marker ticked (#1110):** one cycle left the marker at its level (0), so nothing showed the click. It is
  green TICK_MS (300 ms) after a click, and while the clock runs (web/js/sch-live.js, sch-live-inputs.js,
  sch-editor.css); back to its level after, or on Pause.
- **An I/O marker's direction from the pins an edit connects it to (#1109):** core/schdoc-markers.js compares the
  netlist before and after an edit (a wire drawn, the marker or a symbol moved): a marker whose net gained symbols'
  pins becomes an output when an output pin drives the net, bidirectional on an inout pin, else an input. It is done
  in the same edit (web/js/sch-edits.js), so one Undo reverts both; a direction set in the properties stays, since
  that edit connects no new pin.
- **The status line's rewrites (#1106):** while the emulator runs, web/js/emulator-paint.js rewrites it STAT_MS
  (500 ms) apart at most; paused, stepped, powered off or stopped by an error, at once. It was every frame, 180
  rewrites in 3 s.
- **The standalone edition's UI test after #1085 (#1104):** a build said done whose bitstream the browser does not have
  is now asked about (#1084); the test expects the question and its reason, no longer the old failure line.
- **A PERIOD on a clock with no path to time (#1103):** checkPeriods (core/fpga/timing-checks.js) finds the clock from
  the port among the flip-flops' clocks when the static timing has no path for it: met, `noPaths`, as trce's
  "0 paths analyzed". The timing report says so, the Design Summary's row says "no path between flip-flops to time"
  (not a period of 0 ns), and the warning stays for a port that clocks nothing.
- **Tasks ▸ Simulate: the test bench's Edit button (#1102):** its label centred in the button (web/css/tasks.css made it
  `inline-flex` without centring its content).
- **The Start page's spacing (#1101):** "Project Commands" right under the pane's caption, at the page's own padding
  (31 → 18 px in the modern interface, 14 in the classic one), as the Design pane's content.
- **No "Hierarchy" heading in the Design pane (#1100):** removed from web/index.html with its styles and its
  translation, in every interface.
- **Handwriting from the Development menu only (#1098):** the schematic editor's toolbar, the truth table editor
  (Handwritten…, Handwritten Table…) and the New Source wizard's truth table (Handwritten…) no longer offer it; the
  Development menu has Handwritten Expression… and Handwritten Truth Table… (on the open truth table: its output's
  column, its whole table) and Handwritten Schematic… (on the open schematic, not on a read-only view), each disabled
  when no such editor is open. The New Source wizard keeps its typed expression.
- **The design corpus's expectations: the T80 meets its period (#1096):** since the T80 was routed faster (Refs #370,
  #651) its 20 ns PERIOD on clk_n is met, and the Nightly reported the warning "PERIOD 20 ns on clk_n not met" as
  vanished; `test/designs-corpus/expected.json` no longer expects it, and the README's results table follows (`run.mjs --table`).
- **The handwriting pad's Undo and Redo (#1092):** the pad keeps what was done (a stroke, a Clear) and what was
  undone; Undo takes back the last of them (a Clear: the drawing comes back), Redo does it again, a new stroke ends
  what can be redone. `padButtons` (`web/js/ink-pad.js`) gives the three dialogs their Undo, Redo and Clear, disabled
  when there is nothing to do, and Ctrl/Cmd+Z, Ctrl+Y and Ctrl/Cmd+Shift+Z outside their text fields.
- **The handwriting pad's view (#1088):** two fingers pinch and pan it (`twoFingerView`, as in the drawing editors,
  #674; a stroke the first finger had started is dropped), the wheel zooms it about the pointer, *Fit* (over the pad's
  corner) shows the whole drawing; the strokes are kept in the pad's own coordinates, so what is recognized does not
  change with the view. The Handwritten Schematic dialog fills the browser's window: the pad most of it, the circuit
  read and the messages in a column beside it (under it on a narrow screen).
- **The handwriting pad on an iPad (#1086):** the pad cancels its touches' own actions (iPadOS selected the dialog's
  text around the pen, or took the writing for Scribble's), and the handwriting dialogs' text is not selectable (their
  text fields are); the pointer events, which draw, still come.
- **Program FPGA asks whether the file is there (#1084):** the processes' state comes back with the project after a
  reload, the browser's bitstream does not. The file's state (web/js/impact-file.js) is now also the API's bitinfo:
  built but not there is 'gone', and Program FPGA asks to implement first, saying why (in the browser, or the
  project's build folder in the full application); in Portuguese.
- **Hand-drawn flip-flops (#1083, a follow-up of #1067):** `core/ink/flipflops.js` finds the boxes (a closed square
  stroke, or square lines meeting at their ends, with labels inside: an empty box is not one), reads the labels on
  their left (the inputs, a wedge for the clock) and on their right (Q, Q with a bar or a prime), and chooses the
  library's symbol (fd, ft, fjk and their variants by the controls drawn, `ffVariant`). `core/ink/schematic.js` takes
  the flip-flops apart from the gates, ties each wire on a box's left side to the label beside it, a wire on its right
  to Q or Q̄, reads a wire that loops back (its ends close, all of it square), and joins the wires leaving one output
  into one net; its errors: a label that is not a pin, no clock, no data input, a pin without its wire or with two,
  no wire from the outputs, controls the library has no flip-flop for. `core/ink/schematic-doc.js` makes a Q̄ an
  inverter after the Q. The dialog lists a flip-flop with its pins. Held-out circuits (a toggle, a register with an
  enable and a clear, a 2-bit counter, a JK; `core/ink/synth-flipflop.js`) are read, made into a schematic with a
  clean netlist, and their HDL, compiled and clocked (`compileDesign`), gives every cycle the outputs computed from the
  drawing's description (`test/ink-flipflops.test.js`).
- **A small k is read as a k:** it was taken for a letter whose capital is the same shape, larger, so `clk` was read
  as `clK` (#1083).
- **The private-data scan and browser versions (#1080):** a product's four-part version after its name and a slash,
  as in a User-Agent string (`Chrome/…`), is no longer read as an IP address; an address after `://` or a path's `/`
  still is (scripts/check-private-data.mjs). It replaces #1027's allow-list entry, and test/private-data.test.js
  passes again with research/ink-models' results (#1060).
- **Why the board cannot be programmed from this browser (#1079):** core/webusb-support.js gives the reason, an iPad
  or iPhone's of its own (an iPad that says it is a Mac: a touch screen); iMPACT's help in the browser edition names
  them too.
- **The Pen and Touch Test's drawing area in the theme's colours (#1077):** its border and background were colours
  written in the code (white in the dark theme too), which the dark theme's check of the pages refused on `main`.
- **No Design Utilities (#1072):** the Processes' Design Utilities group (`web/js/processes.js`), its only process,
  View HDL Instantiation Template, the read-only template document it opened (`openInstTemplate`, `web/js/app.js`,
  documents `tpl:<module>`) and their Portuguese labels are removed. `instTemplate` (`web/js/editor.js`) stays, for
  Instantiate module. Tests: `test/ui/editing.test.js` (the Processes list neither), `test/tasks.test.js`,
  `test/web-helpers.test.js`.
- **The #839 UI test after the project chip's removal (#1068):** with no project chip (#1042) the Tasks header has more
  room, and at 1280 × 800 every label fits; `test/ui/tasks.test.js`'s #839 now looks for the width where only the
  current task's label shows (from 1280 down to 1040 px) rather than assuming 1280.
- **A schematic drawn by hand (#1067, stage 3 of #1055):** `core/ink/schematic.js` reads the drawing: the wires are the
  square open strokes; the gates the tall groups of the other strokes shaped as a gate (their outlines in
  `core/ink/gates.js`, $P templates: AND, OR, XOR, a triangle; a letter is not one), with the square lines all in their
  box (an AND's or a triangle's back) and a small ring at the tip (an inversion: NAND, NOR, XNOR, NOT); a wire end on a
  gate's left side is one of its inputs (from the top), at its tip its output, on another wire a junction, at a name
  the net's name (an input, or an output when a gate drives the net); the errors (a gate without its wires, the inputs
  a gate has, outputs joined, a wire from nowhere) and warnings (an output without a name, a name or a wire end astray).
  `core/ink/schematic-doc.js` makes it a schematic: Silinx's symbols where the gates were drawn, the I/O markers at the
  names, each net routed square by `routePath` (#1052's router). The Handwritten Schematic dialog
  (`web/js/ink-schematic-dialog.js`) lists the gates with their types and the names, to correct, and replaces the
  editor's drawing in one edit (`web/js/sch-ink.js`). Held-out circuits (`core/ink/synth-schematic.js`) all read with
  their logic, 22 of 24 with every name, their netlists clean, their HDL simulating to their truth tables
  (`test/ink-schematic.test.js`).
- **The slant of the writing** is now measured on its nearly upright parts only, and not on a single letter's
  diagonal (a Z read as an E, #1067).
- **A truth table drawn by hand (#1066, stage 2 of #1055):** `core/ink/table.js` finds the ruling lines (long straight
  strokes), the rows (by their lines or their gaps; the small marks join the nearest), the columns (the cells of the
  rows below the header, aligned), reads the header's names together on their line (`recognizeWords` in
  `core/ink/expression.js`: the case by the digits' height, an i or a j by its dot) and each cell as 0, 1 or X; the
  inputs end at the only upright line across the table, or the double one of a full grid, else the last column is the
  output (a warning). The table's text (`A B | F`, a row a line) is shown to correct and read back by
  `tableFromText` (the rows in any order; a row missing, repeated or contradicted, a value not 0 / 1 / X, the names:
  warnings and errors). The Handwritten Truth Table dialog (`web/js/ink-table-dialog.js`) fills the editor's inputs,
  outputs and columns, one step of Undo. Held-out tables (`core/ink/synth-table.js`: other hands than the templates',
  with lines or a full grid) are read exactly 38 times of 40, every cell right (`test/ink-table.test.js`).
- **Try it on the read-only viewers (#1064):** the drawing of the RTL Schematic (the elaborated design) or of
  the Technology Schematic (the synthesized netlist's device cells: LUTs, flip-flops, carry chain, buffers) is
  simulated live with the design's sources or the netlist's primitive models, and the values of the instance's
  generics; on gates and blinky the outputs equal the RTL simulation's. Try it on a drawing whose module's file
  defines other modules too (the netlist, a module with its submodules) keeps them; the device primitives'
  clock pins (through IBUFG / BUFG) make a clock input steppable.
- **Tasks: the RTL Schematic in Implement (#1063):** `taskOfDoc` (`web/js/tasks.js`) gives `rtl:<module>` documents
  to Implement, as `tech:` ones. Tests: `test/tasks.test.js` (taskOfDoc), `test/ui/tasks.test.js` (#1063: opened
  from Implement's Processes, Implement in front, not among Design's documents; fails on the old code).
- **Handwritten Boolean expressions, Silinx's own offline recognizer (#1056, stage 1 of #1055):** `core/ink/` (pure,
  no dependencies, no network): the $P point-cloud recognizer (`pdollar.js`, with the amount of ink as a second
  measure); the ink split into characters by its layout (`segment.js`: the slant made upright, strokes that overlap or
  meet, the dot of an i or a j, a prime apart, overbars); the expression read (`expression.js`: primes and dots by
  their place, `=` by its two lines, capital or small by the letter's height, the symbols written alike chosen by
  `parseExpr`, brackets balanced, an overbar as NOT); built-in templates made by `scripts/ink-templates.mjs` from a
  skeleton font (`font.js`, `synth.js`) into `core/ink/templates.json`; the user's samples as preferred templates
  (`templates.js`). The Handwritten Expression dialog (`web/js/ink-dialog.js`, its pad `web/js/ink-pad.js`: pen,
  touch and mouse, a resting hand ignored once a pen writes): the truth table editor's *Handwritten…* fills the
  column of the output named; the New Source wizard's Truth Table has an optional expression, typed or handwritten,
  that gives the table's inputs, output and column. Held-out handwriting (other seeds, stronger distortions than the
  templates') is read at 99% glyph by glyph (221 of 222) and 90% expression by expression (76 of 84,
  `test/ink.test.js`).
- **The Development menu's Pen and Touch Test (#1054):** a drawing area where each pointer leaves a trail in its
  own colour; each pointer's `pointerType`, `pointerId`, `isPrimary`, pressure, contact size, tilt and buttons, live;
  the number of pointers down at once; what Silinx would do with it (one touch or a pen edits, a second touch is the
  two-finger pan and zoom, a long press the context menu); the screen's touch points, `pointer` / `any-pointer` /
  `hover` media queries, pixel ratio and viewport; **Copy Report**, all of it as text.
- **Add Wire: a freehand stroke made into a routed wire (#1052):** a press on a pin, an I/O marker or a wire
  that moves 16 screen pixels or more is a stroke, shown as a light ink trail; lifted on another pin, marker or
  wire, the wire router (`routePath`) joins the two points with a square wire clear of the other wires and the
  bodies, and the stroke's shape is dropped. The drawn wire's rules hold (it connects at its ends only, a wire
  between two named nets is refused). A stroke lifted elsewhere, or where it started, leaves the drawing
  unchanged; a shorter press is a click, the wire drawn corner by corner as before; a second finger pans and
  zooms. The Add Wire hint says so, in Portuguese too (`web/js/sch-stroke.js`).
- **The site installable, the page kept for offline use (#1051):** the site's `index.html` links a web app
  manifest (`manifest.webmanifest`: standalone, started and scoped in the edition's folder, so that the
  stable edition and `dev/` are two apps, each with its own storage as before; icons drawn by
  `scripts/pwa-icons.mjs`) and registers a service worker (`sw.js`, from `web/js/sw.js`) scoped to that
  folder: the page from the network first, its copy when there is none; the manifest and icons kept; the
  versioned assets read from their cache (#967), Yosys's bundle among them, which its workers import
  rather than fetch; nothing else intercepted (`version.json`, GitHub's API, the usage counter, the
  root's `dev/`). The downloaded `Silinx-ISE.html` and the application have none of it
  (`scripts/pwa.mjs`, `web/js/sw-policy.js`, `web/js/pwa.js`).
- **Tasks: the Design task (#1046):** `TASK_LABEL.edit` is "Design" (its id `edit` kept, for the kept state and the
  documents). In Portuguese it stays "Design", not "Projeto" (the Project menu's, beside it in the header):
  `web/js/i18n.js` keeps a text untranslated inside an element marked `data-i18n-keep="Design"` (the task's button,
  its empty page's heading), and the tooltip pattern ("Design — concluído, sem avisos"). The Design pane and the
  console's Design filter keep "Projeto". Tests: `test/tasks.test.js`, `test/web-i18n.test.js`,
  `test/ui/tasks.test.js` (the labels and tooltips in English and Portuguese).
- **No project chip (#1042):** `#title-project` (`web/index.html`), its text (`web/js/project.js`), its click
  (`web/js/app.js`) and its styles (`modern.css`'s `.m-chip`, `tasks.css`) removed, in every interface (classic had
  it hidden already). Tests: `test/ui/tasks.test.js` (#1042: none in Tasks, modern and classic),
  `test/ui/modern.test.js`, `test/modern.test.js`.
- **Tasks: no status bar (#1039):** `web/css/tasks.css` hides `#statusbar` under `data-layout="tasks"`; the
  modern and classic interfaces keep it. Test: `test/ui/tasks.test.js` (hidden in Tasks, shown in modern before
  and after).
- **A pull request's UI tests in every part (#1032):** `scripts/related-tests.mjs --shard i/n` balances the
  related UI tests over the parts by their measured times too (the heaviest with the lightest part of the unit
  tests), instead of all of them in part 1, which passed its 45 minutes on a change of an example.
- **The New Project wizard's UI test and the shorter source type names (#1031):** each top-level source
  type's label checked as the wizard names it (Finite State Machine (FSM), Algorithmic State Machine (ASM)).
- **The private-data scan and browser versions (#1027):** Chrome's four-part version in test/emulate-engine.test.js's
  User-Agent strings is not an address: in the scan's allow-list with its reason (scripts/check-private-data.mjs);
  test/private-data.test.js passes again.
- **Tasks ▸ Simulate: the simulator's icons in the wave window's line (#1026):** in the Tasks interface the
  simulator's toolbar moves into the wave window's caption, whose name ("Default.wcfg") and cursor text are no longer
  shown (`placeSimToolbar` in web/js/tasks-sim.js, web/css/tasks.css); back under the title bar in the modern and
  classic interfaces.
- **Program PROM: every operation shown, no More… (#1025):** the Tasks interface's Program hid Verify, Erase, Back up
  PROM and Reload FPGA from PROM behind a "More…" button; they are shown with Program PROM, as in the modern and
  classic interfaces, and the button is removed. A UI test in the three interfaces and in Portuguese.
- **Program FPGA with no programming file, or an old one: implement first (#1024):** in every interface, Program FPGA
  with the project's own programming file not built, older than the sources, or from an implementation that failed
  asks whether to implement the design first (Yes / No); Yes runs Generate Programming File, then programs the FPGA
  when it ends without errors, as Generate and Simulate does (#490); No programs nothing. A .bit file of the
  student's choice is programmed as it is. The Tasks interface's line about the file's state (and its Implement
  button) is removed. The file's state comes from the implementation processes' (web/js/impact-file.js, unit
  tested); UI tests in the three interfaces and in Portuguese, the programmer stood in for.
- **Tasks ▸ Program as wide as its page (#1023):** the programming panel (the chain, Program FPGA or PROM, the
  board's settings) was 920 pixels wide at most in the Tasks interface; it takes the whole width available, as the
  modern and classic interfaces' did already (a UI test at a desktop's and a laptop's width, in the three
  interfaces).
- **The Tasks interface's Emulate: the emulator's status below the board (#1022):** its status line (t = … ns ·
  … cycles · … kHz (…% of real time)) moves from the end of the emulator's bar to right below the board, replacing the
  line "Digilent Basys2 — top · Clock clk: 50 MHz on the board"; in Portuguese too. The modern and classic interfaces
  keep it at the end of the bar, the board's line below the board.
- **The Tasks interface's Emulate: the board keeps its proper size (#1021):** the board's picture is never zoomed below
  its own size (it was down to 0.3 on a small window); on a large window it is still enlarged, at most 1.5 times, to
  the room beside the Watch. When the width runs short, the Watch and then the VGA monitor wrap to the next row, below
  the board, and the emulator's area scrolls (across too, on a tablet in portrait narrower than the board). The modern
  and classic interfaces are unchanged.
- **The Tasks interface's Emulate: the Watch shown at first (#1020):** the task's side panel (the emulator's Watch, its
  timing generics and hints) is open the first time, rather than folded; folded by the viewer, it stays folded. The
  modern and classic interfaces are unchanged.
- **The simulator's wave configuration as a file (#1019):** Save Wave Configuration and Load Wave Configuration in the
  simulator's toolbar, in every interface (web/js/isim-wcfg.js; web/js/sim-wcfg.js: the file next to the simulated
  module's source by default, an existing one replaced when confirmed, the project's .wcfg files offered when loading,
  the module's own first); the file is ISim's .wcfg XML (core/wcfg.js: written and read, a file written by ISim read
  too); a signal the design does not have is said in the simulator's console and left out. The toolbar's VCD export
  is removed (the command line's `sim --vcd` stays).
- **Tasks ▸ Simulate: a choice simulates; no Simulate button (#1018):** the task's bar's model and test bench choices
  run the simulation as soon as they change (web/js/tasks-sim.js), through `runSimulation`, which offers "Generate and
  Simulate" for a model not generated yet (#490); a choice made while another simulation is being prepared replaces
  it (`runSimulation`'s `stale`: the earlier one opens no window). The task's bar has no Simulate button in Simulate
  (web/css/tasks.css); the task's page keeps its own. The modern and classic interfaces are unchanged.
- **Tasks ▸ Simulate: no "Ready … Sim Time" status line (#1017):** the simulator's status line is not shown in the
  Tasks interface (the time is where the waves are, the state in the message centre); the modern and classic
  interfaces keep it.
- **The Tasks interface's Edit: a Test tab (#1016):** the side panel's tabs get Test right after Design, a page with
  the project's test benches (the sources of association Simulation) and their units under test, which leave Design's
  tree. A test bench opens, is checked (Edit's Check) and is removed from the project from it as from Design; its
  button, and its context menu, add one with the Test Bench Wizard (the new one Simulate's) or a copy of a source; with
  none, the page says so. The modern and classic interfaces are unchanged.
- **CodeMirror updated (#1014):** @codemirror/autocomplete 6.20.4 and @codemirror/view 6.43.15, patch releases of
  the editor's modules; the third-party notices with them.
- **The classic title bar in Portuguese (#1007):** "<project> - [Design Summary]" read "[Design Summary]" in English
  since #987 took the product name out of it; it is translated (Resumo do Projeto).
- **The Technology Schematic's blocks by instance (#1003):** a cell that drives a signal of the top which is also a
  signal inside an instance (Yosys names the net by its shortest name, the top's: `digits<3>` for `u_count.ones<3>`)
  belongs to that instance (`core/fpga/techview.js`); blinky's view has five blocks (u_count's 84 cells), pong's 19.
- **Only Silinx's own failed promises in the Console (#997):** the handler of unhandled promise rejections (#408)
  reports a rejection in the Console and the Errors tab only when its stack has a frame of the app's own scripts (the
  page's origin; the standalone file's folder from `file://`; the page's `blob:` workers), or when it is an Error with no
  frames (one the browser makes). An extension's or an injected script's rejection, and a reason that is not an Error,
  are left to the browser's console (`web/js/own-error.js`).
- **The console's Design filter (#994):** the message centre's source of the design's checks (Check Syntax, Check
  Constraints, Check Schematic) is called Design rather than Check Syntax.
- **Check Schematic in the console below (#993):** in the Tasks interface the schematic editor's Check writes a
  process's messages in the message centre (a header, its errors and warnings, its result), under the Design source, in
  the Errors and Warnings tabs too, and opens the messages; each error or warning's line takes the editor to its item.
  The editor asks first (a cancelable event, `web/js/tasks-check.js`); in the modern and classic interfaces its own
  panel is shown as before.
- **The schematic's live simulation is Try it (#992):** its button (Simulate → Try it), its mode's badge, panel title
  and hint (Live simulation → Trying it out), its exit button (Stop Simulation → Stop) and its messages (Simulation
  refused / Cannot simulate / Simulation stopped → Cannot try it out / Stopped), in English and Portuguese. The design
  flow's Simulate is unchanged.
- **The task switcher's dots explained (#991):** each task button's tooltip says the state its dot shows (done, no
  warnings; done with warnings; errors; out of date (a source changed); running…), in English and Portuguese; with no
  dot, the task's name only.
- **The header without the product and version (#987):** the modern header's brand (`#title-brand`, "Silinx ISE" and
  the version) is gone, and the classic title bar reads "project - [document]" (or "Project Navigator" with no project)
  rather than "Silinx ISE 15.12.0 - project - [document]". The logo's tooltip is the product and version.
- **The Tasks interface's Edit: its pages as tabs at the top of the side panel (#984):** the activity bar, Edit's only
  since #876, is a row above the hierarchy: the open page shows its icon and name, the others their icon, their name
  the tooltip (and their accessible name). With the side panel folded neither is shown; on a narrow screen they are the
  drawer's top row. The modern and classic interfaces are unchanged.
- **The blinky example's step counter (#983):** a decimal (BCD) counter (`src/bcd_counter.vhd`, 0000 to 9999
  and then 0000 again) counts each step of the LED pattern (each move of the knight rider's light, each count of
  the binary counter; not while paused) and the clock example's display driver (`src/sevenseg.v`) shows it on the
  four digits, multiplexed (active-low segments and anodes, one digit per ms); the UCF has the display's pins, the
  test bench checks the count, the pause, the wrap from 9999 to 0000 and the reset, and fails on a wrong design
  (`test/blinky-example.test.js`); the Board Emulator shows the digits counting on the Basys2 and the Nexys2.
- **New Source's type names (#975):** Schematic (Diagram), State Machine (FSM), State Machine (ASM), Petri Net
  (Diagram) and Test Bench (HDL) become Schematic, Finite State Machine (FSM), Algorithmic State Machine (ASM),
  Petri Net and Test Bench, and the New Project wizard's FSM and ASM top-level types follow; Portuguese: Esquemático,
  Máquina de Estados Finitos (FSM), Máquina de Estados Algorítmica (ASM), Rede de Petri, Bancada de Teste. Only the
  labels change (the type ids and the files are the same: projects load as before). README and the UI tests updated.
- **New Source follows the type selected last (#974):** the wizard driver takes its pages as a function and draws
  the steps on the side and the buttons from the pages now on every render, with a `refresh` that New Source's
  type list calls on a click (it replaces a Proxy that faked a fixed page list and a hand-patched button label);
  the File Name and Location page shows the type now. A UI test (modern and classic) walks every ordered pair of
  types (Next >, < Back, the other type, Next >), every page of the last type forward and back to the source it
  makes, Cancel and New Source again, and Wizard after a change of type.
- **The browser edition's assets kept in Cache Storage (#967):** Yosys in WebAssembly and the device descriptions
  and bit database, whose URLs name their version, are read from the browser's Cache Storage with no request
  (`web/js/asset-cache.js`, in the flow's worker and the Yosys workers). The HTTP cache kept them 10 minutes
  (GitHub Pages' `max-age=600`), and every deployment of the site changed their ETags, so that Implement
  downloaded the 16.7 MB again; measured, the first Implement of blinky took 18.9 s instead of 5.7 s at 10 Mbit/s,
  and the download from the site alone 36 to 169 s. They are fetched when a project opens (not with Save-Data or
  on 2G/3G), the older versions' entries deleted; the console says "Downloading Yosys … about 17 MB: once" when it
  has to. A page opened from a file has no Cache Storage: the HTTP cache, as before.
- **A cascaded multiplier's B left open in VHDL too (#963):** a schematic's MULT18X18SIO with B_INPUT CASCADE, its B
  unconnected, is generated in VHDL with `B => open` and a component of its own declared in the architecture, its B
  given a default (UNISIM's gives it none) and its BOX_TYPE "PRIMITIVE" as UNISIM's: ISE builds it with no warning (its
  map's PhysDesignRules:1135 gone). Silinx's VHDL keeps a component declaration's ports: an input left open whose
  component gives it a default is not reported as unconnected.
- **New Source's Wizard button (#958):** Module (Wizard), Schematic (Wizard), Petri Net (Wizard), Test Bench
  (Wizard) and Clocking Wizard leave the list (the Clocking Wizard's type is now *Clock Manager (DCM / PLL)*); the
  File Name and Location page has a Wizard button before < Back, which opens the selected type's wizard with the
  file name and the location typed (the Clocking Wizard and Block Memory take the name as the module's). It is
  shown disabled for a type with no wizard (Truth Table, FSM, ASM, constraints, .mem), and Next > is disabled for
  a type that is only a wizard (Clock Manager, Block Memory). The old type ids (`modwiz`, `schwiz`, `pnwiz`,
  `tbwiz`) select the matching type. A wizard-made module still reopens its wizard from the Design pane. The
  wizard driver takes an extra button and a page's `noNext`. UI tests: `test/ui/new-source.test.js` (modern,
  classic, Tasks, Portuguese) and every wizard's test through the button.
- **VCC and GND with a Width (#953):** a parameter like the other symbols' widths, 1 for a new symbol; the output pin a
  bus of that width (its width drawn by it), checked against its net with the usual `width mismatch` error; generated
  as `(others => '1')` / `(others => '0')` in VHDL and `{N{1'b1}}` / `{N{1'b0}}` in Verilog, and simulated in place.
  A VCC / GND saved before has no Width and keeps taking its net's width (the panel says so), its HDL unchanged.
  ISE .sch export: a VCC / GND wider than a bit, exported as a constant symbol, now has the constant's output pin `O`,
  so it is read back connected.
- **The event-driven engine by default on slow devices (#952):** a phone or tablet (User-Agent Client Hints'
  `mobile`, a mobile User-Agent, an iPad that says it is a Mac but has a touch screen), fewer than 4 processor
  cores or less than 4 GB of memory (`deviceMemory`) start the Board Emulator on the event-driven engine, and its
  side panel says why; a browser API that is missing says nothing (`core/emulate-engine.js`). The engine the user
  chooses in the Engine selector is remembered and wins over the default, on any device.
- **Schematic Wizard, no suggested ports (#950):** the Inputs and Outputs page has no quick-add buttons (inputs,
  outputs, bidirectional) and no Clock input checkbox: the table starts empty and Add Port adds a row. Finishing with
  no ports is allowed: a schematic with no I/O markers yet, its VHDL and Verilog a module with no ports. The Module
  Wizard keeps its quick-add buttons, and Module (HDL)'s Define Module page is unchanged.
- **No Rotate / Mirror / Delete buttons in the I/O marker's Properties (#949):** the buttons left the marker's
  panel; the multi-selection panel keeps its own.
- **Wire paths that avoid overlaps (#948):** `core/schpath.js` holds the grid of what a path must keep clear of and an
  orthogonal A* router on it. A path never runs along another wire's segment, never passes over a pin, an I/O marker,
  a net name or another wire's end or bend, never enters a symbol's or a marker's body, and bends only on a free
  point; it may cross a wire at a right angle (a hop-over, #756). Among the clear paths it prefers few bends and
  crossings, leaves and enters a pin or a marker by its side, and keeps a grid step from parallel wires and from the
  bodies. `wireClashes(doc)` lists what a drawing breaks of these rules. A wire drawn by hand (Add Wire) is kept as
  drawn when it is clear, otherwise routed between its ends along the drawn path, leaving it only where it must
  (`nudgeWire`). After a move or a paste, the wires with a clash the drawing did not have before are routed again
  (`untangleNew`; old clashes elsewhere stay as drawn); the wires re-routed after a move use the same router
  (`core/schroute.js`). A schematic made from HDL has its overlapping paths routed again (`untangleWires`) and puts a
  net's name on a point of its wire that no other net's wire crosses: a name at a crossing used to join the two nets,
  and the check that follows then replaced their wires by labelled stubs (in modules of six of the seven examples).
  A wire keeps its id and its two ends, so the netlist and the generated VHDL and Verilog are unchanged (#754's rule,
  a wire never joins two named nets, stays). Tests: `test/schpath.test.js` (the router, the nudge, the examples' and the
  generated schematics, moves), `test/ui/sch-wires.test.js`.
- **The truth table's schematic simulated in place (#946):** read-only blocks editing a drawing, not simulating it:
  the schematic editor's `simulate` option keeps Simulate in a read-only view (the truth table's schematic, opened
  from its Schematic badge), with no editing tool and no edit by keys; a change of the table stops the simulation
  as it redraws the schematic. The RTL and Technology schematics are unchanged. A UI test (modern, classic, Tasks,
  Portuguese) sets every input combination of a table with the switches: the outputs are the table's, every net 0
  or 1, the drawing unchanged.
- **UI tests, Back-annotate Pin Locations (#938):** the two tests (open mode, browser edition) expect the pads the placer
  chooses since #651's two placements at Optimization Effort Normal; they failed on main.
- **A flaky UI test: the Tasks message centre's (#932):** the test waits for ISim's Sim Time to reach the end of the
  `run 2 us` it typed, rather than reading it once the time first changes (while the run was still going).
- **The message centre in every interface (#925):** the Tasks interface's message centre (#798) is built in the
  modern and classic interfaces as well. Each Console line says where it comes from, and the filters above the Console
  show one source or all of them (All by default; the Tasks interface follows its task). SSim's console is mirrored
  into the Console and its own bottom panel is hidden; SSim's command line is the Console's (prompt `SSim>`, with the
  history on ArrowUp / ArrowDown) while a simulation is in front, the command palette otherwise. The emulator's Messages
  box is in the Console too. The styles moved from tasks.css to a stylesheet of their own, `web/css/messages.css`.
- **The Tasks interface's Implement: its own processes only; the Design Summary's cards no longer overlap (#923):**
  Emulate on Board and Configure Target Device, the Emulate and Program tasks', are left out of Implement's
  processes (each process row now carries its id, `data-proc`). The summary's cards are a wrapping row rather than a
  grid, which left each table's caption out of its height, so the cards overlapped. The modern and classic interfaces
  are unchanged.
- **ISim renamed SSim, the Silinx Simulator (#920):** every label, message and document of the app's simulator
  (core/simulator.js) says SSim, in English and Portuguese: "SSim Simulator" / "Simulador SSim", the tab
  "SSim (top, model)", the console's first line and its `SSim>` prompt, the New Project wizard's simulator and
  summary. The console's command is `ssim force add | remove`, and the Force Constant / Force Clock dialogs echo
  it; `isim force`, its old name, is still accepted. The internal names stay (the files isim-*.js, the `.isim`
  classes, the document id `isim` and the `isim:` reopen key), so saved sessions and projects open as before.
  Xilinx's ISim keeps its name where it is meant: ISE's project property, the notes on what Xilinx ISim accepts,
  the trademark notice.
- **ISim's drawn stimuli: a bus's bits edited one by one (#919):** a click on a cycle of a bit of an expanded bus paints
  that bit from the cycle up to its next change, the other bits kept; an output's bit holds its own expected value,
  checked alone (its mismatch red on its row and the bus's), and the grid and the expected values are drawn on the bit
  rows. Nothing new is saved: the stimuli keep a bus's bits per cycle, so Save as Test Bench (VHDL and Verilog) drives
  the bus as its bits were edited, and the bus's value dialog sets it whole again (its note says the bus can be
  expanded to change a bit).
- **The emulator's status line keeps room for the whole line (#918):** it was `flex: 1 1 0; min-width: 0` in a bar that
  wraps, so it always stayed on the controls' row, shrunk to a few pixels or none when they nearly filled it; with
  `min-width: min(100%, 84ch)` it wraps to a row of its own instead, the whole line shown (on two lines in a window too
  narrow for one, never cut). The UI test scans the window
  from 600 to 1920 px in the modern, classic and Tasks interfaces.
- **The Tasks interface's Simulate: the test bench chosen, made and opened from its bar (#917):** the design tree being
  Edit's, Simulate's bar lists the project's test benches, then its design modules (a module simulated with stimuli
  drawn in ISim); the one chosen becomes the simulation top, as Set as Top Module does in the Simulation view. "New
  Test Bench (Wizard)…" opens the wizard for the top and chooses the bench it makes; Edit opens the chosen module's
  source. A project with no test bench says so on Simulate's page and offers the wizard. On a narrow screen the task's
  bar wraps under the toolbar.
- **The waveform viewer's time scrollbar tells its own scrolls from the user's by where it was put (#915):** the view
  counted the scrolls it made and ignored as many scroll events; an event the view had not caused made the count
  drift, and the event of the view's own scroll of a frame before, arriving after a two-finger scroll moved the time
  on, set the time back to the scrollbar's old place (the UI test of #674 found 88 px of a 100 px scroll on a CI run).
  A scroll event that finds the scrollbar where the view last put it is now ignored; the rows' scrollbar needed no
  count (the rows follow it). UI test: test/ui/touch-pan.test.js (the two-finger scroll and a late scroll event in
  one task; the scrollbar moved by the user still scrolls the time).
- **CI: the UI tests in three parts per interface (#912):** `scripts/test-shard.mjs --ui` balances the UI test
  files (`test/ui/*.test.js`) by their times in `test/timings.json`, as the unit tests' parts; the `ui` job runs
  each interface in three parts (six jobs of about 10 minutes, the longest file 7), one file at a time. The
  `--test-concurrency=1` that CI gave the UI tests came after their files, where `node --test` takes no option:
  they ran three files at a time. Each part uploads its files' times (`ui-times-<interface>-<part>`), which
  `scripts/update-test-timings.mjs` merges with the unit tests' (a UI file's time the slower interface's); a
  file's time is now its own process's, from the runner's summary of the file (the UI tests' own events name
  their helper, `test/ui/harness.js`). The UI timings start from a CI run of 22 October 2026 (each test's time in
  its output, summed by its file; then three files at a time).
- **The ISE runner's PATH with Docker's CLI (#904):** registering the runner as its own user with `sudo` left
  sudo's `secure_path` in its `.path`, which `runsvc.sh` exports over the daemon's PATH, so the ISE jobs found no
  `docker` (`/usr/local/bin`). `install.sh --system` now writes `.path` with the daemon's PATH, owned by the
  runner's user. Tests: `test/ise-runner.test.js`.
- **The ISE runner's evening window waits for its scheduled runs (#901):** the window closed after any finished run
  of `ise.yml` since its opening, so a run by hand inside it closed it before the scheduled run, which GitHub starts
  hours late and which then found the runner off line. A window opened by the schedule now counts the scheduled runs
  only (`window.mjs` `runs`, `event=schedule`); one opened by hand still closes after a run of either workflow.
  Tests: `test/ise-runner.test.js` (the API's query; a run by hand inside the evening's window, as on 21 October).
- **The runner's daemon started again only once launchd has let it go (#901):** `window.sh open` right after a
  restart unloaded the daemon and loaded it at once, which launchd refused (`5: Input/output error`), leaving the
  runner off line; `serviceCommands` now waits (up to 30 s) for the daemon to be gone before loading it.
- **A flaky UI test fixed (#894):** test/ui/clipboard.test.js clicked the FSM's state before the editor had fitted
  its view (a frame after it is drawn), so the click missed it now and then. It now waits, as the Petri net step
  already did, until the state's position is the same twice in a row, and for the state to be selected.
- **A cascaded multiplier's B left open in Verilog (#893):** a schematic's MULT18X18SIO with B_INPUT CASCADE, its B
  unconnected, is generated in Verilog with `.B()` instead of B tied to zeros, which ISE's map warned about
  (PhysDesignRules:1135); Silinx's elaboration says nothing of a primitive's input left open on purpose (`.B()`), as XST.
  In VHDL B stays tied (UNISIM's component gives it no default; a component of its own makes XST warn Xst:2211 and 753):
  ISE's map still warns there.
- **Tasks: no empty column in Simulate and Emulate (#882):** their side panel is ISim's Instances and Objects,
  or the emulator's Watch. The Design pane is hidden there, and its column no longer keeps its width
  (web/css/tasks.css), whether the side panel is open or folded.
- **The Tasks interface: the activity bar in Edit only (#876):** Start, Design, Files and Libraries are Edit's pages,
  so the other tasks no longer show them. Simulate and Emulate have no left column (their side panel is ISim's
  Instances and Objects, the emulator's Watch); Implement's side panel is its Processes whichever page Edit left in
  front; Program has no side panel, nor its button. The modern and classic interfaces are unchanged.
- **The Tasks interface's Program task: iMPACT arranged for the task (#803):** the programming file and its state
  come first (up to date with the sources, out of date, none yet, or failed, with Implement when it is not up to
  date), then the chain, Initialize Chain and Program FPGA or Program PROM, each with its line. The board,
  programming tool and cable fields fold away when a board is selected (it chooses them); the PROM's other
  operations (Verify, Erase, Back up, Reload) are behind More…. iMPACT's programming is unchanged; the modern and
  classic interfaces show it as before.
- **Bit database, XC3S1200E: every long-line splitter measured, and used by the router (#709):** the centre column's
  (CLKV_LL, CLKT_LL, CLKB_LL: the horizontal long lines joined across it), the I/O columns' (CLKL_IOIS_LL /
  CLKR_IOIS_LL) and the side DCM columns' (CLKLH_DCM_LL / CLKRH_DCM_LL: the vertical ones joined across the centre
  row), all 48 switches of each, one bit each, measured with ISE (`research/s3e-bitstream/ll-splitters.mjs`, 46
  rounds of `gen-pipcover.mjs`; a switch's bit is the one candidate all its observations share). Before, 92 of the
  336 were known and none could be routed. The router takes them where they are faster, as CLKH_LL's since #23; the
  placer's delay table leaves out the splitter types' own switches only (`knownRouting` `delayPip`). ISE's
  bitstreams of 1427 earlier XC3S1200E designs: 480 byte-identical (150 before), none left with an unknown splitter.
- **The critical LUTs made shallower as a tree of LUT4s (#652):** when neither one LUT nor two (h(g(A), S)) can make the
  LUT ending a critical path one level shallower, its cone (up to 12 leaves, the latest LUTs expanded first) is rebuilt
  as a tree of LUT4s by disjoint decompositions, its output and so its fan-out kept (`core/lut-resynth.js`,
  `shallowerTree`); kept by `DEPTH_RULE` as before. On the corpus's 53 designs of 1500 LUTs at most and the 7 examples:
  6 of the 120 builds changed, all faster by Silinx's static timing (iwls05-sasc at High −16.1 %, 66 → 49 slices, its
  FIFOs in distributed RAM; itc99-b13 at High −10.3 %; fpu-adder −3.4 %), the others the same; every changed netlist
  simulates as its design. By ISE's trce on the 6 changed routings: 5.80 % shorter (iwls05-sasc at High −12.7 %,
  itc99-b13 at High −9.6 %, fpu-adder −7.3 %; iwls05-sasc at Normal +4.5 %), every bitstream byte-identical to ISE's
  bitgen with a clean DRC. research/synth-quality/README.md, "A tree of LUT4s where one or two LUTs cannot do it".
- **The critical LUTs made shallower: the wide multiplexers, and the ends that can be (#652):** core/lut-resynth.js.
  - A critical LUT whose cone has 5 to 7 signals at a level three below it, and no form of one or two LUTs or a tree
    of LUT4s, becomes its 2^k cofactors as LUT4s into MUXF5, MUXF6 and MUXF7, selected by its k latest signals (a LUT
    level and the multiplexers). vtr-stereovision3's I2C clock line and stop, a 128-entry case of its 7-bit state,
    were 4 to 5 levels of LUTs. Each cofactor's LUT reads only the signals it depends on (ISE refuses a LUT pin its
    equation leaves out), and none is constant.
  - A round makes shallower the critical ends it can and leaves the others; the pass ends when a round makes none
    (before, a round was undone when one end could not be made shallower). DEPTH_RULE keeps the result or not.
  - Measured on 20 designs of the corpus (the routed period, Silinx's STA, mean of placer seeds 1–3 where it changed):
    verilog-uart −12.2 %, vtr-stereovision3 −3.5 % (129 → 119 LUTs, 78 → 76 slices), iwls05-usb-phy −0.8 %, serv −0.6 %;
    the other 16 unchanged; every netlist simulates as its design. ISE's check of the four changed designs: every
    bitstream byte-identical to ISE's bitgen, DRC and xdl2ncd clean.
- **Two placements at Optimization Effort Normal for a design of 500 slices at most (#651):** a placement's seed moves a
  design's critical path by several per cent, and on the small designs, the ones furthest from ISE at Normal, the
  placement is most of what is left of the gap. The flows (`core/open-flow-core.js`, Implement Design and the
  Post-Place & Route model's design) now make `effortTries(effort, slices)` placements (`core/fpga/place-route.js`):
  `HIGH_TRIES` (2) at High, `NORMAL_TRIES` (2 up to 500 slices) at Normal, else one; the console says both periods and
  the seed kept. Measured with Silinx's static timing on the corpus's 53 designs of 1500 LUTs at most and the 7
  examples at Normal (the same netlists): 1.25 % shorter in geometric mean over the 60 (two placements for every size:
  1.42 %), 23 designs faster (verilog-axis-fifo −11.2 %, the clock example −10.4 %, spi-fpga-slave −7.3 %,
  uart-for-fpga −5.6 %, verilog-i2c-master −4.8 %, epfl-i2c −4.5 %), one slower (iwls05-usb-phy +2.2 %: register
  replication from the other placement), the slices the same. The place and route of a small design takes 0–2 s more;
  of 400–700 slices it would take 1.5 times as long, so those keep one placement. By ISE's trce on the 24 changed
  routings: 2.38 % shorter in geometric mean (the clock example −14.3 %, verilog-axis-fifo −9.1 %, vga −5.3 %,
  spi-fpga-slave −5.2 %, verilog-lfsr-crc −4.6 %), 6 slower by 2.1 % at most, every bitstream byte-identical to ISE's
  bitgen with a clean DRC. research/s3e-route/README.md, "Two placements at Normal for a small design".
- The ASM chart editor's code split (#405): its model operations (`web/js/asm-ops.js`), its view
  (`web/js/asm-view.js`), Arrange (`web/js/asm-layout.js`) and its pointer and keys (`web/js/asm-pointer.js`), out of
  `mountAsmEditor` (764 → 292 lines); no change in behaviour.
- **core/asm-from-hdl.js split: the decision trees, the comparison and the text candidates (#405):** an ASM chart
  made from HDL's per-state decision trees (asm-trees.js), the charts' structural comparison (asm-same.js) and
  asmFromHdl's text candidates (asm-candidates.js) move to modules of their own (asm-from-hdl.js 1385 → 727 lines,
  asmFromHdl 326 → 273). No change in behaviour: every HDL file of the repository and the HDL of the 454 charts the
  ASM tests make, read back with and without the chart as `previous` (1839 results), give the same charts as
  before. Tests: `test/asm-from-hdl-parts.test.js`.
- **core/asm-hdl-analysis.js split: analyzeModule's states, synchronisers and logic bodies (#405):** the states
  of the state register (asm-hdl-states.js), the input synchronisers (asm-hdl-sync.js) and the logic bodies with
  the every-cycle blocks (asm-hdl-bodies.js) move to modules of their own, called where they were (analyzeModule
  459 → 292 lines). No change in behaviour: every HDL file of the repository and the HDL of the 454 charts the ASM
  tests make (1840 results) give the same charts as before. Tests: `test/asm-hdl-parts.test.js`.
- **core/asm.js split: the expression language, its HDL and analyze's graph checks (#405):** the ASM charts'
  expression language (asm-expr.js), the expressions' VHDL and Verilog (asm-emit.js) and analyze's checks of the
  chart's graph (asm-graph.js) move to modules of their own; asm.js still exports them (asm.js 1393 → 753 lines,
  analyze 302 → 189). No change in behaviour: the 454 charts the ASM and FSM tests analyze give the same analysis,
  validation and VHDL and Verilog as before. Tests: `test/asm-parts.test.js`.
- **server/devices.js split: the boards in server/boards.js (#405):** the boards' table moves to a module of its
  own, the device family it shares with the parts to server/family.js; devices.js still exports both (devices.js
  1023 → 517 lines). No change in behaviour: the same device database, boards and every board and variant resolved
  as before. Tests: `test/boards.test.js`.
- **core/compiled-sim.js split: compileNetlist in eight parts (#405):** the compiled simulator's constants and helpers
  move to compiled-helpers.js (CompileError among them), its VGA monitor to compiled-vga.js, and compileNetlist's
  parts to modules of their own: the netlist read (compiled-cells.js), the expressions (compiled-exprs.js), the
  elements (compiled-elements.js), the clocks and DCMs (compiled-clocks.js), the activity (compiled-activity.js), the
  edges and counts (compiled-watch.js), the loop's steps and template (compiled-steps.js), the code
  (compiled-generate.js) (compileNetlist 691 → 103 lines; compiled-sim.js 1209 → 345); compiled-sim.js still exports
  everything it did. No change in behaviour: every netlist of the compiled simulator's tests compiles to the same code,
  with every activity, wide values and a split run(). Tests: `test/compiled-parts.test.js`.
- **core/compiled-words.js split: wordLevel's cells of one bit and its registers (#405):** the cells of one bit
  with the carry chains (compiled-words-bits.js) and the registers proposed (compiled-words-regs.js) move to mounts
  of their own, called where they were (wordLevel 428 → 288 lines). No change in behaviour: the 82 gate-level
  netlists the compiled simulator's and models' tests make give the same word-level netlists as before. Tests:
  `test/compiled-words-parts.test.js`.
- The drawings' code split (#405): the truth tables (a table opened in its editor, kept in sync with its HDL module
  both ways, a table loaded from a module, the table's schematic view) in `web/js/drawings-tt.js`, out of
  `web/js/drawings.js` (1101 → 906 lines); no change in behaviour.
- The HDL editor's code split (#405): its completion (the words offered at the cursor and their ranking, the kind
  letters, a template inserted, the languages' vocabulary) in `web/js/editor-complete.js`, out of `createEditor`
  (366 → 289 lines); no change in behaviour.
- **core/elab-expr.js split: the calls in core/elab-call.js (#405):** the built-in VHDL subprograms, std.textio's
  procedures, Verilog's system functions and calls, overloads and subprogram binding move to a module of their own;
  elab-expr.js still exports what it did (elab-expr.js 1129 → 719 lines). No change in behaviour: every HDL folder of
  the repository elaborates the same, and the designs that simulate standalone give the same values and messages.
  Tests: `test/elab-call.test.js`.
- **core/elaborate.js split: the instances and the statements (#405):** a module's instance elaborated
  (elab-instance.js) and the sequential statements bound (elab-stmt.js) move to modules of their own; elaborate.js
  still exports what it did (elaborate.js 1689 → 897 lines). No change in behaviour: every HDL folder of the
  repository elaborates the same, and the designs that simulate standalone give the same values and messages.
  Tests: `test/elab-parts.test.js`.
- The Board Emulator's code split (#405): its toolbar (`web/js/emulator-toolbar.js`), the board's parts and layout
  (`web/js/emulator-board.js`), the VGA monitor and the side panel (`web/js/emulator-side.js`) and its painting
  (`web/js/emulator-paint.js`), out of `mountEmulator` (535 → 289 lines); no change in behaviour.
- The FPGA view's code split (#405): the details of a selected site (its site, tile, module, port and pin, I/O
  standard, the elements inside, a LUT's contents, the connections) in `web/js/fpgaview-details.js`, out of
  `mountFpgaView` (348 → 255 lines); no change in behaviour.
- The state diagram editor's code split (#405): its history (`web/js/fsm-history.js`), its view
  (`web/js/fsm-view.js`), its inline editing (`web/js/fsm-inline.js`), its pointer and keys (`web/js/fsm-pointer.js`)
  and its bottom panel, the tables, the HDL and the simulation (`web/js/fsm-bottom.js`), out of `mountFsmEditor`
  (718 → 292 lines); no change in behaviour.
- **core/fsm.js split: the HDL and the ASM chart conversions (#405):** an FSM diagram's VHDL and Verilog
  (fsm-hdl.js) and its conversions to and from an ASM chart (fsm-asm.js) move to modules of their own; fsm.js still
  exports them (fsm.js 1326 → 812 lines). No change in behaviour: the diagrams, charts and HDL of the repository and
  every call the FSM and ASM tests make (235) give the same HDL, charts and diagrams as before. Tests:
  `test/fsm-parts.test.js`.
- **core/interp.js split: formatting and std.textio (#405):** the simulator's strings and formatting
  (interp-format.js: images, times, $display's formats) and std.textio with math_real (interp-textio.js) move to
  modules of their own; interp.js still exports them (interp.js 1105 → 865 lines). No change in behaviour: every HDL
  folder of the repository elaborates the same, and the designs that simulate standalone give the same values and
  messages over 5 µs. Tests: `test/interp-parts.test.js`.
- **core/isesch.js split: the library symbols' HDL in core/isesch-hdl.js (#405):** the exact HDL of the ISE
  library symbols with no Silinx twin (gates with inverted inputs, multiplexers, decoders, comparators, adders,
  counters, flip-flops, tri-states, multipliers) moves to a module of its own (isesch.js 1217 → 981 lines). No change
  in behaviour: the 168 library names' templates (1008, both languages) and the repository's ISE schematics, imported,
  are the same as before. Tests: `test/isesch-hdl.test.js`.
- ISim's drawing code split (#405): the drawing of one wave (a scalar's levels, a bus's values, the dense bursts) in
  `web/js/isim-draw-wave.js`, out of `mountDraw` (363 → 250 lines); no change in behaviour.
- ISim's window code split again (#405): its toolbar (`web/js/isim-toolbar.js`), its view of time and scrollbars
  (`web/js/isim-view.js`), its status bar and cursor (`web/js/isim-status.js`), its public API with the state saved
  and restored and the VCD export (`web/js/isim-api.js`), and its colours (`web/js/isim-colors.js`), out of
  `mountISim` (538 → 295 lines); no change in behaviour.
- **core/lint.js split: designChecks' later rules in core/lint-design.js (#405):** the combinational loops, unused
  and unassigned signals, names differing only in case, clocks, Verilog's = / <= and integers without a range move
  to a mount of their own, called where they were (designChecks 468 → 257 lines). No change in behaviour: every
  design of the repository, every top, with each option set (366 runs), gives the same findings as before. Tests:
  `test/lint-design.test.js`.
- **core/logic.js split: the gate schematic of a truth table in core/logic-sch.js (#405):** a truth table's
  outputs as trees of gates placed and wired as a schematic move to a module of their own; logic.js still exports
  them (logic.js 1245 → 940 lines). No change in behaviour: the repository's truth tables and 120 random ones, in
  every form and both languages (2420 results), give the same schematics and errors as before. Tests:
  `test/logic-sch.test.js`.
- **web/js/wizards.js split: the New Source wizard in web/js/new-source.js (#405):** newSourceWizard, its source
  types and the test bench's port reading move as they were to a module of their own; wizards.js still exports
  newSourceWizard (wizards.js 1209 → 938 lines, off the list of files over the limit). No change in behaviour.
  Tests: `test/new-source-module.test.js`.
- **core/open-flow-core.js split: runOpenFlow's simulation models and its timing, bitstream and reports (#405):**
  the open flow's simulation models (open-flow-models.js) and its timing, bitstreams, back-annotated pins and power
  estimate (open-flow-reports.js) move to mounts of their own, called where they were (runOpenFlow 483 → 247 lines).
  No change in behaviour: every example through every step, from the synthesis to the PROM bitstream, gives the same
  log, reports and files as before, the bitstreams byte for byte. Tests: `test/open-flow-parts.test.js`.
- **core/fpga/pack.js split: packWith in thirteen parts (#405):** the packer's parts move to modules of their own,
  each called where its code was: the netlist prepared (pack-prep.js), the slices under construction
  (pack-slices.js), the registers in the IOBs (pack-iobregs.js), the carry chains (pack-carry.js), the wide
  multiplexers (pack-muxes.js), the distributed RAMs and shift registers (pack-mems.js), the LUTs and flip-flops
  (pack-luts.js), the IOB settings (pack-iobcfg.js), the block RAMs (pack-bram.js), the DCMs and multipliers
  (pack-dcm-mult.js), the pads and clock buffers (pack-pads.js), the site pins of the connections (pack-nets.js) and
  the configuration strings (pack-cfg.js) (packWith 1538 → 109 lines; pack.js 1767 → 351). No change in behaviour:
  the 558 packed designs of the packer's, placer's, router's and I/O registers' tests are byte-identical to before,
  as fast. Tests: `test/pack-parts.test.js`.
- The Petri net editor's code split (#405): its drawing (`web/js/petri-draw.js`), its side panel
  (`web/js/petri-side.js`) and its bottom panel, the simulation, the HDL and the analysis (`web/js/petri-sim.js`),
  out of `mountPetriEditor` (519 → 278 lines); no change in behaviour.
- **core/fpga/place.js split: place in seven parts (#405):** the placer's parts before the annealing move to modules
  of their own, each called where its code was: the pads and clock reach (place-pads.js), the DCMs
  (place-dcms.js), the I/O pads (place-iobs.js), the global clock buffers (place-bufgs.js), the block RAMs and
  multipliers (place-hard.js), the slices (place-slices.js), and the annealing's moves (place-moves.js) (place
  888 → 239 lines; place.js 1222 → 580). No change in behaviour: the 342 placements of the placer's, the router's
  and the I/O registers' tests are byte-identical to before, in the same time. Tests: `test/place-parts.test.js`.
- **core/fpga/route.js split: routeDesign's power nets, delays, polish and output (#405):** the power nets with no
  source (route-power.js), the connections' delays (route-delays.js), the polish after the routing (route-polish.js)
  and the routed design written (route-output.js) move to mounts of their own, called where they were (routeDesign
  484 → 291 lines). No change in behaviour: the 92 routings of the router's, placer's and I/O registers' tests are
  byte-identical to before, no slower. Tests: `test/route-parts.test.js`.
- The schematic editor's code split (#405): its skeleton, toolbar, palette, view, edits, selection operations,
  mouse, keyboard, Check, Try it, Symbol Info and small helpers in modules of their own (`web/js/sch-dom.js`,
  `sch-toolbar.js`, `sch-palette.js`, `sch-view.js`, `sch-edits.js`, `sch-select.js`, `sch-mouse.js`, `sch-keys.js`,
  `sch-check.js`, `sch-try.js`, `sch-info.js`, `sch-ui.js`), out of `mountSchEditor` (874 → 299 lines); no change in
  behaviour. The last function over the limit: `test/code-size.test.js`'s lists are empty.
- The schematic's Try it code split (#405): its inputs, the clocks and the bus value editor
  (`web/js/sch-live-inputs.js`), and its panel with a module instance's pins (`web/js/sch-live-instance.js`), out of
  `liveController` (373 → 278 lines); no change in behaviour.
- **core/schdoc.js split: a schematic made from HDL in core/schdoc-from-hdl.js (#405):** schematicFromHdl and
  modulesFromLibrary move to a module of their own, the placement and routing to schdoc-place.js, and two parts of
  schematicFromHdl to schdoc-source.js (the source text pieces) and schdoc-gates.js (the gate conversion);
  schematicFromHdl 586 → 286 lines, schdoc.js 2286 → 1276; schdoc.js still exports them. No change in behaviour: every
  design of the repository becomes the same schematic. Tests: `test/schdoc-from-hdl.test.js`.
- **core/schdoc.js split: the symbol library in core/schdoc-symbols.js (#405):** the symbols, their parameters and
  local geometry and the I/O markers' geometry move to a module of their own; schdoc.js still exports every name it
  did, and is now under the 1000-line limit (1276 → 777). No change in behaviour: every symbol type and preset
  (608 sheets, both languages) and every schematic and HDL folder of the repository (289 results) give the same
  documents and HDL as before. Tests: `test/schdoc-symbols.test.js`.
- The RTL schematic viewer's code split (#405): its rendering (`web/js/schematic-render.js`), its hover, selection
  and tooltip (`web/js/schematic-hover.js`) and its SVG export (`web/js/schematic-export.js`), out of
  `mountSchematic` (519 → 290 lines); no change in behaviour.
- **core/scopes.js split: analyzeVhdl's scope helpers in core/scopes-vhdl.js (#405):** a scope opened, a design
  unit's scope and a declaration's type move to a module of their own (analyzeVhdl 312 → 295 lines). No change in
  behaviour: every HDL file of the repository, with damaged copies of each (1122 texts), gives the same scopes,
  symbols and occurrences as before. Tests: `test/scopes-vhdl.test.js`.
- The open synthesis's code split (#405): running Yosys (`core/synth-open-yosys.js`), the critical path of a
  netlist (`core/synth-open-path.js`) and the depth-oriented mappings (`core/synth-open-depth.js`), out of
  `core/synth-open.js` (1387 → 848 lines; `synthesizeOpen` 478 → 198); no change in behaviour.
- The Test Bench Wizard's code split (#405): its vectors page (the table of the vectors, Fill Expected from Current
  Design, the vectors as bits for the generator) in `web/js/tbwizard-vectors.js`, out of `testBenchWizard`
  (324 → 231 lines); no change in behaviour.
- **core/fpga/timing.js split: the logic's arcs and the timing checks (#405):** each instance's timing arcs
  (timing-arcs.js) and the clock and constraint checks with the timing report (timing-checks.js) move to modules of
  their own; timing.js still exports them (timing.js 1203 → 729 lines). No change in behaviour: on the 70 routed
  designs of the router's and placer's tests, the timing graph, every instance's arcs, the clock sources and ports
  and the switching checks are the same as before. Tests: `test/timing-parts.test.js`.
- **core/verilog/parser.js split: the parser's methods in three parts (#405):** the parser class's generate
  blocks, functions and instances (parser-items.js), statements (parser-stmts.js) and expressions
  (parser-exprs.js) move to modules of their own, assigned to its prototype; its definitions to parser-defs.js
  (parser.js 1461 → 780 lines). No change in behaviour: every Verilog file of the repository, with damaged copies of
  each (400 texts), parses to the same units and errors as before. Tests: `test/verilog-parser-parts.test.js`.
- **core/vhdl/parser.js split: declarations, concurrent and sequential statements (#405):** the parser's
  declarations (parse-decls.js), concurrent statements (parse-concurrent.js) and sequential statements (parse-seq.js)
  move to modules of their own, methods of the parser as its expressions already were (parse-expr.js); its shared
  definitions and helpers to parse-defs.js and parse-helpers.js (parser.js 1720 → 517 lines). No change in
  behaviour: every VHDL file of the repository, with damaged copies of each (1096 texts), parses to the same units
  and errors as before. Tests: `test/vhdl-parser-parts.test.js`.
- **server/impl-routes.js split: the ISE project routes in server/xise-routes.js (#405):** the .xise export, import
  and sync and the project zip's export and import move to a module of their own, mounted where they were
  (registerImplRoutes 320 → 167 lines). No change in behaviour: the same 20 routes registered in the same order.
  Tests: `test/xise-routes.test.js`.
- **The fourth balanced candidate: its area mapping made four more times (#370):** the mapping balanced once more onto
  LUT4s alone (`DEPTH_ABC2_LUT4`) ends with four more rounds of ABC's area mapping (choices, mapping, `mfs2 -M 5000`),
  each sharing more of a round-robin arbiter's terms at the same depth: the EPFL arbiter in the corpus's I/O wrapper
  1537 → 1410 LUTs and 769 → 705 slices at High (8 levels, 9.92 ns estimated both); a 32-request arbiter written as
  gates 320 → 248 LUTs. On the design corpus the T80 at High takes the candidate's new netlist inside its
  distributed-RAM mapping (1782 → 1720 LUTs, 992 → 961 slices, routed 7 % faster); the other designs and the examples
  keep their netlists and warnings (the stopwatch example one LUT fewer). The candidate's remap takes about 1.6 times
  as long (the arbiter's 10 s → 16 s), beside the other three.
- **Device measurements, round 5 (#3):** observation designs with every block RAM, every multiplier and 90 pads
  (`research/s3e-device/gen-obshdl.mjs`), implemented by ISE, as sources for the join tests round 4 could not drive:
  270 new tests (184 joins, 86 islands) and round 4's 716 again, every verdict agreeing with the shipped graph;
  2401 joins stay untestable. `ise-remote.sh` runs in a folder Docker Desktop shares (`RWBASE`, #482).
- **Bit database: the block RAMs' and multipliers' clock pins from every global line, the clock pads' paths to the
  global buffers (#2):** the switches `GCLKk -> BRAM_CLKj` of the block-RAM interconnect tiles (20 of 24 were unknown)
  and `CLKT_CKIk -> CLKT_GCLKj` / `CLKB_CKIk -> CLKB_GCLKj` (13 of 16 unknown), measured with ISE on designs that clock
  every block RAM and multiplier from each line and every buffer from each of its pads
  (`research/s3e-bitstream/gen-bramclk.mjs`, `gen-clkpad.mjs`, `measure-bramclk.sh`: 10 designs, 210 xdl + bitgen
  runs). The designs are byte-identical to ISE's bitgen; `feat_bram_clocks`, refused before, routes. A clock on the
  bottom GCLK pin (M4 / N9) now takes its own buffer on its dedicated path, with no warning (#56).

## 15.12.0

The Silinx toolchain is now a production toolchain, no longer marked experimental. Its circuits are faster:
- deep logic and small control paths;
- one-hot state machines;
- registers in the IOBs of every pad, including DDR and bidirectional ones;
- the DCMs' clocks on any global buffer.

Each target device's own resources are offered to the user:
- Device Primitives in the schematic library and the Language Templates;
- a Clocking Wizard (DCM / PLL) and a Block Memory wizard;
- every resource shown as used of available, with an overflow reported early;
- a change of device checked against the design first.

The schematic editor gains hop-overs, wires that connect only where they end, names checked before use, and
Cut / Copy / Paste in every editor. On touch screens, two fingers move a drawing and a pinch zooms it. The Board
Emulator runs the simulation models several times faster, on less energy. The development builds add a
Development menu and a third interface, Tasks, still in progress.

In short:

- **Paste in Firefox and Safari:** Edit ▸ Paste no longer opens the browser's own Paste prompt nor waits for it; it
  pastes what was copied in Silinx, and is off until something is (Ctrl+V still pastes from other applications).
- **The Board Emulator's Model menu offers every model:** a netlist model not generated yet (Post-Synthesis,
  Post-Translate, Post-Map, Post-Place & Route) can be chosen; the emulator asks to generate it, as Emulate from the
  Processes list does.
- **Device Primitives built with ISE:** a schematic's RAMB16_S1, Spartan-6 block RAMs and DSP48A1 now give HDL that
  Xilinx ISE synthesizes and implements; a DSP48A1 with both M and P connected is an error.
- **Edit Stimuli is seen:** ISim's toolbar shows the button with its label, "Edit Stimuli", next to its icon,
  so that drawing the inputs' waveforms is not hidden among the icons.
- **Clock switching:** a design that chooses between two clocks with a BUFGMUX (the schematic library's Device
  Primitives, or instantiated in VHDL / Verilog) builds with the Silinx toolchain on the Spartan-3E.
- **Board Emulator, Spartan-6 clocks:** a design with a PLL_BASE (the Clocking Wizard's Spartan-6 module) or a
  BUFIO2 now runs at the emulator's full speed instead of falling back to the slower simulator.
- **View ▸ Interface: Modern and Classic** ("Xilinx ISE (Classic)" is named Classic); the Tasks interface is in the
  development builds only, for now.
- **XST's global buffers by family:** an ISE build of a Spartan-3 project lets XST use the part's 8 global clock buffers
  (24 on the Spartan-3A / 3A DSP / 3E, 32 on the Virtex-4), not 24 on every family.
- **The Design Summary of every Spartan-6 part:** before an implementation it shows the part's horizontal clock buffers
  (BUFH), not only on the Nexys3's and the Atlys's parts.
- **Schematic: a move or a paste that would short two named nets is refused too:** like a drawn wire, moving a
  symbol, a marker or a wire, dragging a wire segment, or pasting, so that a net named x touches a net named y,
  leaves the schematic as it was, and the status line says why.
- **A third interface, Tasks (View ▸ Interface ▸ Tasks), in the development builds for now:** the five tasks of a lab session (Edit, Simulate,
  Emulate, Implement, Program) in the header, each with its own documents and arrangement: the task in front
  gets the space, the side panel and the messages fold away and come back with one click, a document
  maximizes with a double-click on its tab. On a tablet in portrait the tasks are a tab bar at the bottom.
  The modern and classic interfaces are unchanged.
- **The Tasks interface's message centre (in the development builds for now):** in View ▸ Interface ▸ Tasks every flow's messages are in the bottom
  panel, with filters by source (Check Syntax, Simulation, Emulator, Synthesis, Implementation, Board) that follow
  the task in front. ISim's console and its `ISim>` command line, and the emulator's Messages box, are there
  too, so the waves and the board get their space. Folded, the panel shows its last line.
- **Changing the target device checks the design first:** in Design Properties, a new device (or family) that the
  design does not fit is said before the change: the modules that use a primitive the new family lacks, with its
  equivalent (MULT18X18SIO → DSP48A1 on a Spartan-6, DSP48A1 → MULT18X18SIO on a Spartan-3E…), and the resources
  over the new part's ("5 block RAMs needed, the XC3S100E has 4"). The device can still be changed.
- **Every resource used of available, an overflow said early:** the Silinx toolchain's synthesis and MAP reports and the
  Design Summary give the block RAMs, multipliers, DCMs, global clock buffers and I/O as used of the device's, and a
  design with more of one than the device has fails at synthesis (or MAP) with it named ("5 block RAMs needed, the
  XC3S100E has 4"), not at Place & Route.
- **Block Memory:** New Source ▸ Block Memory writes a RAM or a ROM of the device's block RAMs (width × depth,
  one or two ports, its contents from a .mem or .coe file of the project), showing how many block RAMs it takes
  of the device's. Opening the module in the Design pane reopens the wizard.
- **Clocking Wizard:** New Source ▸ Clocking Wizard writes a module with a DCM (Spartan-3E) or a PLL (Spartan-6)
  for the frequencies you ask, from the board's oscillator: it shows the frequency each output gets and the
  ones near it the device can make. Opening the module in the Design pane reopens the wizard.
- **Device Primitives in the Language Templates:** the HDL editor's Templates ▾ (and its context menu) has an
  instantiation template of each primitive of the project's family, VHDL and Verilog, with how many the device has.
- **Device Primitives in the schematic library:** the target device's block RAMs, multipliers / DSP slices, DCM /
  PLL and clock buffers as symbols of their own, the ones of the project's family (Spartan-3E: RAMB16_S*, single
  and dual port, MULT18X18SIO, DCM_SP, BUFG, BUFGMUX, IBUFG; Spartan-6: RAMB8BWER, RAMB16BWER, DSP48A1, PLL_BASE,
  DCM_SP, BUFG, BUFIO2), their attributes in the Properties panel, their count on the device in Symbol Info.
- **The Design Summary of a Spartan-6 project:** before an implementation it lists the part's own resources (RAMB16BWER
  and RAMB8BWER, DSP48A1, BUFG/BUFGMUX, BUFIO2, BUFH, DCM, PLL, MCB) instead of the Spartan-3E's.
- **Start page:** the seven "Open Example (…)" entries are gone; the examples are in New Project…, under *Start from*
  (Example: gates, traffic, blinky, pong, stopwatch, clock, vga).
- **UCF wildcards in the Silinx toolchain:** `NET "sw<*>" IOSTANDARD = LVCMOS33 ;` (and `*`, `?` anywhere in a NET
  name) now sets the I/O standard, drive, slew, pull and LOC of every port bit it matches, as ISE does.
- **Menus inside the window:** a menu or a submenu near the window's right edge (the Development menu on a 1024 px
  window, an iPad's) opens inside it, on the left when there is no room on the right; a long change title is cut with
  an ellipsis, whole in its tooltip.
- **I/O registers on two clocks in a differential pair:** two input (or output) registers on different clocks LOC'd on
  the two pads of a differential pair now build with the Silinx toolchain, the second on its IOB's second flip-flop as
  ISE puts it.
- **Schematic: hop-overs on by default:** where two wires cross without connecting, the horizontal one hops over
  the other with a small arc, in every schematic, printed too; untick Hop-overs to turn them off (remembered).
- **Schematic: a wire between two named nets is refused, as in ISE:** drawing a wire from a net named x to a net
  named y (or to an I/O marker's net) no longer makes one net with two names; the status line says the wire would
  short them and to rename one first (the same name connects them).
- **An input register on a pad whose neighbour is unused:** the Silinx toolchain's bitstream is now byte-identical to
  ISE's there too: on the XC3S500E and XC3S1200E such a register (on B3, E17, F14 or G13, for example) set a bit that
  belongs to the input-only pad next to it.
- **Two IOB registers on different clocks in one I/O tile:** the Silinx toolchain no longer ends with "the routing did
  not converge" when two pads of one tile hold registers on different clocks.
- **Schematic: a net connected by name renamed as a whole:** renaming one of its net names renames the others of
  that name too (and its I/O marker, a port of the module), so the net stays one; one Undo takes it all back.
- **Board Emulator, less energy:** it pauses while it is not seen (another browser tab, a minimised window, another
  document tab) and goes on where it was when shown again; the new "When hidden" setting of its toolbar keeps it
  running instead, and is remembered. It draws the board at most 60 times a second, and nothing wakes up while it is
  paused or powered off: hidden, Chrome's CPU drops from about 55 % to under 2 %.
- **Board Emulator: designs run up to twice as fast at Max speed:** the compiled engine skips more of the logic
  whose inputs did not change. The examples' designs run at 60 to 210 million cycles a second, pong's at 75
  instead of 39 and clock's at 115 instead of 71. pong's post-synthesis model runs at 30 instead of 22.
- **A Development menu in the development builds:** after Help, the changes since the last release, as Features,
  Bug fixes and Other: each one opens with its text and its issue on GitHub; "All Changes since …" lists them all.
- **Truth table:** the results no longer list the essential prime implicants; the Karnaugh map's legend still marks
  each essential group.
- **Language Templates in the HDL editor only:** the Edit menu no longer lists them; they are the editor's
  Templates ▾ button and its context menu, where the error hints now send you.
- **Truth tables:** the language of a table's HDL module, VHDL or Verilog, is chosen in the editor (*Language*,
  next to *HDL logic*) and can be changed at any time.
- **Board Emulator, a simulation model on the event-driven engine, 3 to 5 times faster:** blinky's post-map model
  runs about 84 000 cycles a second (was 16 000) and pong's about 25 000 (was 6 000), with the same results.
- **Truth tables:** the schematic of a table is always drawn from it, in its HDL logic, and opens from the
  *Schematic* badge of its row in the Design pane; two new HDL logic forms, *NAND gates only* and *NOR gates
  only*, and the editor shows the NAND and NOR forms of each output. *Generate Schematic* and *Check my
  answer* are gone.
- **Hop-overs in the schematic editor:** an option draws a small arc where two wires cross without
  connecting, so a crossing no longer looks like a connection; real connections keep their junction dot.
- **A net name already used asks first:** naming a wire with the name of another net asks whether to connect
  the two by name (one net, without a wire drawn between them, as in ISE); Cancel leaves them apart.
- **Dragging a wire segment moves only that segment:** a horizontal one up or down, a vertical one left or
  right; the segments next to it stretch to stay attached and the rest of the wire stays where it is. An end
  segment keeps its pin connected, with a short segment added.
- **Check Syntax warns of an unconnected inout port:** a bidirectional port neither read nor driven (in a
  schematic, a bidirectional I/O marker left unconnected) gets XST's warning, `Inout <io> is never assigned.`,
  with its explanation and fix in English and Portuguese, as an unused input and an unassigned output already do.
- **Schematic: the width of an adder, subtractor or comparator on its symbol:** an 8-bit adder reads ADD8
  under it, a 4-bit comparator COMP4, as the Xilinx symbols are named, and the width of each bus pin is
  shown beside it; they change as soon as Width does.
- **I/O markers anywhere on the sheet:** the schematic editor's Add I/O Marker tool now places a marker on
  empty space too, named in1, out1, io1… (renamed in place), and a wire drawn later to its tip connects it.
- **Reserved words refused as names:** a new source, a module, a port, an I/O marker, a net or an instance can no
  longer be named with a reserved word of VHDL or Verilog (AND, OR, BEGIN, MODULE, wire, signal…, in any letter
  case): the message names the word and the language. A project that already has such a module is warned when it
  is opened and at Check Syntax.
- **Schematic wires connect only where they end:** a wire drawn across a symbol's pin, or across the end
  of another wire, no longer connects to it (no more nets with two drivers because a wire passed over a
  gate). Ending a wire on a pin, a marker or another wire, and dropping a symbol onto a wire, still connect
  there, as in ISE. Schematics saved before keep their connections.
- **Cut, Copy, Paste in the state machine and Petri net editors:** the ASM chart's boxes, the FSM diagram's
  states and the Petri net's places and transitions are copied and pasted too (Edit menu, toolbar, Ctrl+X, C,
  V), with new names, also into another drawing.
- **Cut, Copy, Paste and Delete everywhere:** Edit ▸ Cut / Copy / Paste / Delete (Ctrl+X, C, V, Del) and the
  toolbar's buttons work in the text editors and in the schematic editor; a schematic's parts are pasted next
  to the original, selected, with new names, also into another schematic or another project.
- **The Silinx toolchain is a production toolchain:** Toolchain Settings, the start page, the processes and the
  documentation no longer call it experimental ("Silinx toolchain (no ISE)").
- **Touch screens (iPad): two fingers move the drawing, a pinch zooms it:** in the schematic, ASM chart, state
  diagram and Petri net editors and the waveform viewer, a two-finger drag pans the view (it selected, like one
  finger) and a pinch zooms it; one finger still selects and moves parts as before.
- **Registers in the IOBs of every pad with the Silinx toolchain:** an I/O register on a left, right or top pad
  (IOB = TRUE) is clocked from the global clock lines as ISE clocks it, and its bitstream is byte-identical to ISE's.
- **Faster designs with the Silinx toolchain:** the router gives the critical path's connections the fast
  wires other nets held: about 1.3 % shorter critical paths on average (up to 15 % on small control designs).
- **A DCM's frequency limits in the timing report:** the Silinx toolchain's timing checks each DCM's input and outputs
  against the frequencies they allow, as ISE's trce does ("Component Switching Limit"), with a warning when one is
  out of range: a CLKFX of 5 MHz with CLKIN_DIVIDE_BY_2, for one, which ISE counts as a timing error.
- **Board Emulator: the simulation models run 2 to 4 times faster again:** a post-synthesis, post-translate,
  post-map or post-place & route model of vga, clock, stopwatch, traffic or blinky runs at 35 to 200 million
  cycles a second in Chrome (the board's clock is 50 MHz): vga's at 67 instead of 18, clock's at 35 instead of 17.
  pong's runs at 20 instead of 15.
- **Faster deep logic:** the open synthesis restructures deep arithmetic written as gates (multipliers, adders,
  comparators) at both Optimization Efforts: the EPFL multiplier, max and adder benchmarks are now faster than
  with ISE.
- **Faster small control designs with the Silinx toolchain:** the synthesis maps the critical path once more for
  speed and, where it ends on a flip-flop's clock enable, puts that enable in the logic before the flip-flop, as XST
  does: about 3 % shorter critical paths on average at Optimization Effort Normal (up to 22 % on small state
  machines and counters), with no more slices; the synthesis takes 0.3 to 1 s longer.
- **Faster small control paths with the Silinx toolchain:** after the LUT mapping, the synthesis makes the LUTs at the
  end of the critical path one level shallower where it can, without making shared logic again: spi-fpga-slave's shift
  register 18 % faster, the clock example 15 %, iwls05-sasc 11 %; 1.2 to 1.4 % shorter critical paths on average, with
  as many slices.
- **Faster state machines written one-hot with the Silinx toolchain:** a state machine of 8 states or more that Yosys
  would leave as written (its states tested on all their bits) is tried one-hot too, at both Optimization Efforts:
  iwls05-i2c's I2C bit controller 33 % faster at Normal and 27 % at High, with 15 % fewer slices.
- **Faster designs at Optimization Effort High with the Silinx toolchain:** Place & Route makes two placements and keeps
  the faster: 1.5 % shorter critical paths on average, up to 10 % (the clock example), for a third more place and route
  time.
- **Board Emulator: the simulation models run faster, in Chrome as in Node:** a post-synthesis, post-translate,
  post-map or post-place & route model of an example runs up to 5 times faster than before (in Chrome blinky's 2.5
  times, near the board's 50 MHz; pong's and clock's 4 to 5 times), and Chrome no longer runs one for seconds at a
  tenth of its speed before it optimizes it.
- **Clocks on the side GCLK pins:** a clock on a left or right global clock pin goes on its own side global buffer
  through the dedicated path, as ISE places it, without a warning.
- **Timing of the pads of a DCM's clocks:** the Silinx toolchain's OFFSET IN / OUT checks and its data sheet (pad to
  setup, hold, clock to pad) now cover the inputs and outputs of a DCM's clocks, which they left out ("no pad of the
  design is bounded by it"): deskewed by the DCM, with its phase shift and, for a falling-edge register, half the
  clock's period, as ISE's trce times them; within 0.13 ns of trce on average.
- **Open synthesis:** a large round-robin arbiter written as gates takes about a quarter fewer LUTs and slices at High.
- **IDDR2 / ODDR2 and bidirectional pads with the Silinx toolchain:** designs that instantiate the DDR registers IDDR2 and
  ODDR2, or that have inout ports (IOBUF), build to a bitstream, byte-identical to ISE's; the simulators know IDDR2 and
  ODDR2.
- **Silinx toolchain: registers in the IOBs on any pad:** a plain register (no enable, no reset) in an I/O block, and a
  tristate output whose enable comes from the logic, are no longer refused for want of measurements on most pads.
- **Silinx toolchain, synthesis at effort High:** a 4:1 multiplexer of the mapping with the wider functions is two
  LUTs and an F5 multiplexer, as XST builds it, instead of four LUTs and three F-multiplexers: the EPFL barrel
  shifter takes as many LUTs as with XST (941 instead of 1201; XST 939) and fewer slices (471; XST 534), and is faster.
- **Silinx toolchain, synthesis at effort Normal:** the T80 (Z80) takes about as many slices as with XST at the default
  effort too (1009 instead of 1146), its register file in distributed RAM, and is 6 % faster by ISE's timing analysis.
- **Silinx toolchain, synthesis at effort High:** a memory written at one address and read asynchronously at several
  (a processor's register file) becomes distributed RAM when that makes the design smaller and no slower: the T80
  (Z80) takes about as many slices as with XST (1009 instead of 1146; XST 1000), 233 flip-flops instead of 361, and is
  6 % faster by ISE's timing analysis.
- **Silinx toolchain, synthesis at effort Normal:** the mapping with the wider functions (two LUTs into an F5
  multiplexer for a 4:1 multiplexer) is tried at Normal too, and kept when better: the EPFL barrel shifter takes as
  many LUTs as with XST at the default effort (941 instead of 1199; XST 939), 471 slices instead of 600, and is 15 %
  faster.
- **DCM outputs on any global buffer:** every output of every DCM of the Spartan-3E devices now reaches its four global
  buffers in the Silinx toolchain (before, CLK90, CLKDV, CLKFX180 or CLK2X180 often reached none), so a Clocking
  Wizard module places on the DCM nearest its clock.
- **Cascaded multipliers:** MULT18X18SIO instances that take B from the multiplier below (B_INPUT = CASCADE, BCOUT ->
  BCIN) build with the Silinx toolchain.
- **Shift registers chained through Q15:** SRLC16E instances whose Q15 drives the next one's D (up to four) build
  with the Silinx toolchain, packed on the two SLICEMs of a CLB as ISE packs them.

In detail:

- **CI: the UI tests' time limit 25 minutes (#912):** the UI tests grew to about 15 minutes in each interface
  (the Tasks interface, the device primitives and wizards, the clipboard), their step's limit; the 15.12.0 release
  CI stopped there after 196 tests that passed. The step's limit is 25 minutes, the job's 30; the UI tests are to
  run in parts, as the unit tests do.
- **The compiled engine's speed test on CI (#909):** `test/compiled-words.test.js`'s #670 speed check compares two
  wall-clock measurements, which on a shared CI runner vary with its load (6 against 5, then 4 against 4 million
  cycles a second on the 15.12.0 release CI). On CI the ratio is now reported, not checked; it is still checked on a
  developer's machine, and the work the activity saves is checked everywhere, deterministically.
- **The #490 emulator test waits for simulated time (#908):** blinky's light first steps 400 ms after the start
  (2.5 steps a second). The test watched the Post-Translate model's LEDs for 4 s of wall time, which on a slow
  runner (8.5 % of real time) was 365 ms simulated, before the first step. It now watches until 1.2 s of
  simulated time, 90 s of wall time at most (test/ui/open-toolchain.test.js).
- **The ISE runner's hook in a folder without spaces (#891):** the GitHub runner runs its job-started hook
  without quoting its path, so `…/Library/Application Support/Silinx-ISE-runner/job-started.sh` split at the
  space and every job on the ISE runner failed before its first step. `scripts/ise-runner/install.sh` now copies
  the scripts to `/Library/Silinx-ISE-runner` (`--system`) or `~/Library/Silinx-ISE-runner`, and removes the old
  folder. Tests: `test/ise-runner.test.js` (the hook's path in `.env` has no whitespace; the old folder removed).
- **Edit ▸ Paste and the system clipboard (#888):** the system clipboard is read only where the browser has a
  clipboard-read permission (Chromium), and waited for 300 ms at most. Firefox and Safari answer a read with a
  Paste prompt of their own, which held the paste and stayed open in the way of the next clicks
  (web/js/clipboard.js). There a text Paste is enabled once something was copied in the session (`canPasteText`):
  before, it was on with nothing to paste, and did nothing.
- **The emulator's Model menu: a model not generated chosen offers "Generate and Emulate" (#878):** its options are no
  longer disabled (still marked "(not generated)"); choosing one goes through the question of #490 and the emulator
  opens on the model once it is generated; cancelled, the emulator and its menu stay on the model running. The Tasks
  interface's Emulate task (#801), which has no Processes list, had no way to emulate a netlist model.
- **Memory: closed documents no longer kept by the Tasks interface's Emulate (#879):** its watcher for an emulator's
  board put an observer on every document opened, in every interface, for up to two minutes, so closed documents
  (ISim, the editors, the FPGA view) stayed in memory and `test/ui/memory.test.js` failed. It is now one observer on
  the workspace, connected only in the Tasks interface, with no timer.
- **Device primitives under ISE (#859):** a 1-bit data port of a RAMB16 (RAMB16_S1, a dual port's 1-bit side) is
  associated `DI(0) =>` as UNISIM's vector (XST's HDLParsers:800); RAMB8BWER / RAMB16BWER's DATA_WIDTH_A / _B written as
  integers (XST's HDLCompiler:837 on the string); RAMB16BWER's SIM_DEVICE = "SPARTAN6" always written, in the schematic
  and in its Language Template (ngdbuild changed it from SPARTAN3ADSP, a warning); DSP48A1's M and P both connected an
  error (ISE's map refuses it, PhysDesignRules:2136), Symbol Info's HDL leaving M out; a bus tap of bit 0 of a 1-bit net
  written as the net (an index of a scalar, refused by XST in VHDL and Verilog).
- **The Tasks interface: no tab bar in Simulate, Emulate and Program (#854):** ISim, the board emulator and iMPACT
  are one document each (a new one replaces the old), so the task's tab bar only repeated their name. There
  it is gone; the document's module and model (Behavioral, Behavioral (RTL), Post-Synthesis…) and its Close
  are in the task's bar. Edit and Implement keep their tabs.
- **A document closed brings no other task to the front:** the document that comes forward in its place,
  of another task, leaves the task where it was, with its page.
- **ISim's Edit Stimuli button with its label (#853):** the toolbar's only labelled button (web/js/isim.js),
  in the modern, classic and Tasks interfaces; in Portuguese "Editar Estímulos".
- **Schematic: a MULT18X18SIO cascaded (#848):** with B_INPUT = CASCADE its input B is no longer needed (no warning
  when it is left unconnected), and BCIN is: left unconnected, it warns.
- **Timing: a DCM's CLKDV with a half-integer divider (#847):** CLKDV_DIVIDE 1.5, 2.5 … 7.5, written `2_5` in the
  XDL, was read as the integer below (2.5 as 2): the PERIOD derived for CLKDV, its switching limit and the paths
  between it and the other clocks used a period too short (40 ns instead of 50 ns from a 20 ns input).
- **BUFGMUX in the Silinx toolchain (#846):** the packer makes a BUFGMUX a global buffer with I0, I1 and S, as ISE's map
  writes it (I1_USED, its select not inverted); a clock switch's input from the BUFG Yosys put on that clock is taken
  from the BUFG's input (the clock into the switch on its own line), the BUFG dropped when nothing else uses it; a
  BUFGMUX whose select is a constant is a BUFG of the input it selects. The placer keeps a switch off the other
  buffer of its pair unless that buffer's input is the switch's I1 (the two share their input lines). The timing
  checks apply the PERIOD of the switch's I1 clock to it too (before: "no clock of the design comes from this port").
  BUFGMUX_1 (its output held high while it switches) too: its DISABLE_ATTR HIGH measured with ISE on the 24 global
  buffers (one bit each, research/s3e-bitstream/measure-846.sh). Two new open-flow fixtures, feat_bufgmux and
  feat_bufgmux_1, byte-identical to ISE's bitgen with a clean DRC.
- **ISE runs in a folder Docker Desktop shares (#482):** check-open-flow.mjs works in SILINX_ISE_REMOTE_DIR, else the ssh
  configuration's remoteDir (e.g. /Users/Shared/silinx-ise/build), else ~/silinx-open-check as before; the research
  scripts impl-remote.sh and fuzz-remote.sh mount an absolute RW as it is.
- **PLL_BASE and BUFIO2 in the compiled cycle simulator (#845):** the PLL scheduled as the DCM is (a black box whose
  outputs follow a schedule of their edges in the main clock's cycles: CLKFBOUT, CLKOUT0-5 with their DIVIDE,
  DIVCLK_DIVIDE, duty cycles and phases, LOCKED, RST driven by the design, cascaded with a DCM); BUFIO2 a wire or a
  divider (DIVIDE, DIVIDE_BYPASS, I_INVERT, SERDESSTROBE). A DCM on a clock whose duty cycle is not 50 % is not
  compiled. The event-driven BUFIO2 with I_INVERT no longer sees a rising edge at time 0 (its inverted input is
  high from the start, as on the FPGA). Both engines compared cycle by cycle, in VHDL and Verilog, with the
  Clocking Wizard's PLL module among the designs.
- **The Tasks interface's header fits in a development build, in Portuguese (#839):** the task switcher's labels
  give way when the header is short of room, measured rather than at a fixed width: first the other tasks'
  labels (their names in their tips), then every label, then a shorter project name. The Development menu
  and Portuguese labels at 1280 × 800 had pushed the switcher past the right edge.
- **The classic interface named Classic; Tasks in the development builds only (#838):** View ▸ Interface's "Xilinx
  ISE (Classic)" is Classic (pt Clássica). The Tasks interface (#804) is offered only where core/version.js BUILD is
  set (the dev/ site, the development single file): web/js/modern.js tasksAvailable, getInterface and applyPrefs
  read a stored 'tasks' as the modern interface elsewhere (the dev/ and stable sites share their storage) and
  setInterface('tasks') does nothing there; web/index.html's early script takes it only with a development build's
  `<html data-dev>` (scripts/build-standalone.mjs), so a release shows no Tasks layout before its first paint either.
  Tests: test/modern.test.js and test/tasks.test.js (a release reads tasks as modern, the early script without
  data-dev), test/ui/tasks.test.js (its tests as a development build; without one, no Tasks item and a stored tasks
  opens the modern interface), test/ui/modern.test.js (Modern and Classic, in English and Portuguese).
- **Pack: a never-written block-RAM port's constant inputs left out (#836):** a port whose WE is tied to 0 and whose data
  and parity inputs are all constants (a ROM, the read-only port of a RAM, the Block Memory wizard's) leaves them
  unconnected, as ISE's map trims them; ISE's DRC called that block's unread outputs dangling pins
  (PhysDesignRules:812) before. A never-written port with a signal on a data input keeps them all, as ISE does.
- **The Clocking Wizard's Spartan-6 module simulated (#829):** its PLL_BASE (the model of #791) elaborated and simulated in
  VHDL and Verilog, each output's period and a 90° phase measured once LOCKED rises; the DCM's CLK90 and CLKFX180
  offsets measured too.
- **XST's -bufg from the device resources model (#821):** server/ise.js reads the part's global clock buffers from
  core/resources.js, which now has them for the Spartan-3 (8 BUFGMUX), 3A and 3A DSP (24) and Virtex-4 (32 BUFGCTRL),
  measured with ISE's device reports; a part outside the database keeps 24. Those families' LUTs are 4-input ones in
  the model (the Virtex-4's were labelled 6-input), and their Design Summary before an implementation shows the global
  buffers.
- **The BUFH of every Spartan-6 part (#820):** the device resources model (core/resources.js) has the count of every
  part (128 on the LX4 / LX9 / LX16, 160 on the LX25(T), 256 on the LX45(T), 384 on the LX75(T)), measured with ISE's
  device report (`xdl -report`), which also confirms 16 BUFGMUX and 32 BUFIO2 on every part and the model's other
  counts; the test has those reports as its reference.
- **Moves and pastes that short two named nets refused (#806):** after #754 refused a drawn wire between two
  named nets, a move, a wire segment dragged or a paste could still make one net with two names ("net has several
  names" in Check Syntax). Now they are refused the same way (core/schdoc.js netShort, the schematic before and
  after): the document as it was, nothing to undo, the note "The move would short…" / "Pasting would short…".
  Tests: test/sch-netname.test.js (a wire moved, the same name moved, a paste), test/ui/sch-netname.test.js (a
  segment dragged, a marker moved, a paste, refused with the note; a move that shorts nothing still moves; both
  interfaces, English and Portuguese).
- **The Tasks interface and its frame (#804, from #782's direction A):** a third choice in View ▸ Interface,
  with the modern look and its own layout (`<html data-layout="tasks">`, web/js/tasks.js, web/css/tasks.css).
  - The task switcher in the header (a tab bar at the bottom of a screen 1024 px wide or less) shows each
    task's state from its processes (done, warnings, errors, running, out of date).
  - Each task keeps its arrangement per viewer: the side panel open or folded into the activity bar, the
    messages open or folded to their tabs, a maximized document, and its last document. Only its own
    documents' tabs are shown, and a document brought to the front brings its task. Implement opens the
    Design Summary and Program opens iMPACT.
  - A task with no document says what it does and offers its action (the design-flow button of the modern
    toolbar). New errors open the messages.
  - Maximize: double-click a document's tab, press Ctrl/Cmd+Shift+Enter or use the task's bar.
  - Its parts exist only in that interface; labels are in Portuguese, and the header fits from 1025 to
    1440 px in both languages.
- **The Tasks interface's Implement task: the top's processes, the Design Summary as cards (#802):** its side panel
  is the Implementation view's Processes list for the top module whatever is selected (ISE's names: Synthesize,
  Implement Design ▸ Translate, Map, Place & Route, Generate Programming File; each with its state, a double-click
  to run it, its other processes in its menu; I/O Pin Planning and the UCF's processes with them). Its page is the
  Design Summary, laid out as cards, which comes to the front when an implementation ends; its Programming File
  links to Program ("Program the board…"), and its reports open in Implement. The modern and classic interfaces
  keep the summary's tables.
- **The Tasks interface's Emulate task: the board gets the screen (#801):** the board's picture is zoomed to the
  room it has (at most 1.5×), so its LEDs, display, switches and buttons are on screen without scrolling on a laptop,
  a tablet in either orientation and a lab desktop (at 1366 × 768 its switches and buttons had been below the fold).
  The emulator's Watch and timing generics are the task's side panel, folded at first: beside the board, below it on
  a tablet in portrait. No Design pane in Emulate; the emulator's own bar stays its controls, right under the task's
  bar. The modern and classic interfaces keep the board at its own size.
- **The Tasks interface's Simulate task: the waves get the screen; Simulate runs the test bench (#800):** ISim's title
  bar is the task's bar's (the module and the model, #854); its Instances and Objects are the task's side panel,
  folded at first, and the Design pane is not shown, so the wave window has the workspace's width and most of its
  height (on a tablet in portrait too, where the side button folds ISim's columns). Simulate runs the project's test
  bench (its simulation top, else its first test bench, else the top) whatever module is selected, with the model
  chosen in the task's bar (Behavioral, Post-Synthesis, Post-Translate, Post-Map, Post-Place & Route). ISim's run
  controls stay its toolbar, right under the task's bar. The modern and classic interfaces are unchanged.
- **The Tasks interface's Edit task: one design tree, no views (#799):** the Design pane shows the design (as the
  Implementation view does: the top, its modules with their drawings' and wizards' badges), then a Test Benches group
  (each with its unit under test) and a Constraints group (the UCF); no Implementation / Simulation switch and no
  Processes list, their processes being the tasks' actions. Check checks the selected module, a test bench with the
  simulation's sources (Behavioral Check Syntax). The groups' names are in Portuguese too. The modern and classic
  interfaces keep their two views.
- **One message centre in the Tasks interface (#798, from #782):** web/js/messages.js, built in that
  interface only (the modern and classic ones keep their Console, ISim's console and the emulator's box).
  - Each Console line says its source. It is read from the processes' headers (`Started : "…"`,
    `=== SILINX STEP …`, iMPACT's operations), and the lines after a header are its process's.
  - The filter follows the task (Implement: Synthesis and Implementation) until the viewer picks one or
    All.
  - ISim's console and the emulator's Messages box are hidden, and their lines are written into the message
    centre.
  - One command line: ISim's commands while simulating (`ISim> run 1 us`), else the command palette with
    the text typed.
  - The Design Summary opened behind a project at its opening no longer brings the Implement task to the
    front (#804's frame).
- **A change of the target device checked against the design (#796, part of #787):** core/resource-check.js's
  `deviceChangeIssues` takes the design's primitive instances (its elaborated hierarchy, the drawings' HDL among the
  sources), its top's ports and the last synthesis's or MAP's resource use (carried over to the new family: a
  RAMB16_S* is a RAMB16BWER, a RAMB8BWER takes a whole RAMB16), and names each primitive the new family lacks with
  its equivalent and each resource over the new part's count. Design Properties shows them in a "Device Change"
  dialog (Change Device or Cancel; in Portuguese too) and logs them as warnings when the device is changed.
- **Resources used of available, the overflow caught at synthesis or MAP (#795, part of #787):** core/resource-check.js
  counts the resources of a netlist's cells (core/resources.js's primitives; a Spartan-6 RAMB8BWER is half a block RAM)
  and names the ones over the part's counts. The Silinx toolchain's synthesis lines carry the part's totals (also the
  Spartan-6's: DSP48A1s, RAMB16BWER/RAMB8BWERs, PLLs…) and fail on a design over any of them; MAP lists every resource
  of the device's sites (block RAMs, multipliers and DCMs too) and fails before Place, its report kept. The Design
  Summary shows every resource of the part: from MAP (ISE's unlisted ones as 0), or after the synthesis alone its
  used of available, a row over 100 % in red.
- **New Source ▸ Block Memory (#794):** the name, language and location; the memory: RAM or ROM, one port or two
  (A and B, each its own clock), width × depth, READ_FIRST or WRITE_FIRST, the block RAM primitives or the
  inferable HDL, its initial contents from a `.mem` (`$readmemh`'s format) or `.coe` file of the project (its
  errors said); the block RAMs it takes against the device's (`core/resources.js`: RAMB16s, or the Spartan-6's
  9 Kbit halves), one that does not fit refused. The module (`core/blockram.js`): the shape with the fewest blocks
  (RAMB16_Sw / RAMB16_Sw_Sw, the parity bits as data; RAMB8BWER / RAMB16BWER counted in halves), then the fewest
  rows, side by side for the width and in rows for the depth (the high address bits choose a row's write enable
  and, registered, the output), their INIT_xx / INITP_xx from the file; or an array read on the clock edge, its
  initial words written in (XST's templates; the Silinx toolchain maps it to the same RAMB16). Its settings in a
  `silinx-wizard:` header line: the Design pane shows *[Block Memory] [VHDL]*, and reopening it reads the file
  again. Three board tests of its output (`feat_bramwiz`, `feat_bramwiz_v`, `feat_bramwiz_inf`) build on the four
  Spartan-3E devices of the Silinx toolchain. In Portuguese.
- **New Source ▸ Clocking Wizard (#793):** the name, language and location; the input clock (the board's
  oscillator by default, from a pin through an IBUFG or not), the reset and LOCKED, on the Spartan-3E the input
  divided by 2 and a fixed phase shift; the outputs: the DCM_SP's nine (CLKDV's divide and CLKFX's multiply /
  divide chosen nearest the frequency asked) or the PLL_BASE's six (one VCO for all, its multiply and divides
  chosen with the smallest error, then the fastest VCO; the phase in eighths of the VCO period), each with the
  frequency it gets and the ones near it the primitive can make; DS312's (Stepping 1) and DS162's ranges, with
  the input divided by 2 trce's halved limits. The module (`core/clocking.js`) has the primitive and a BUFG per
  output (CLK0 fed back to CLKFB, the PLL's feedback internal), its parameters commented, its settings in a
  `silinx-wizard:` header line: the Design pane shows *[Clocking Wizard] [VHDL]*, a double-click, the badge or
  *View/Edit Clocking Wizard* reopen the wizard (a module changed by hand since is said so). Two board tests
  of its output (`feat_clkwiz`, `feat_clkwiz_v`) build on the four Spartan-3E devices of the Silinx toolchain.
  In Portuguese.
- **The Language Templates' Device Primitives (#792):** a template per primitive of the schematic library's list
  (core/prim-templates.js reading core/primitives.js): its attributes at their defaults with their ranges, its pins
  with what they do, the inputs it works without tied, a comment with the primitive and its count on the project's
  part; its placeholders (the instance's name, the signals, a DCM's or a PLL's frequencies) inserted with the
  instance's name selected.
- **The schematic's Device Primitives (#791):** a category of the palette with the primitives of the project's
  family, following it when the device changes (core/primitives.js, one list read by the library and the
  templates); each symbol has UNISIM's pins and its attributes as parameters (their ranges checked: a value out of
  range an error), a block RAM's width and its initial contents (hex words from address 0, its INIT_xx); the
  generated HDL instances the primitive itself (VHDL with `library UNISIM`, Verilog), an unconnected input tied
  to its inactive value, a needed one (a clock, an address, a DCM's feedback) a warning; Symbol Info gives its
  resource on the device and the schematic's use of it ("Block RAM (18 Kb): 12 on this device, 2 used").
- **PLL_BASE and BUFIO2 simulated (#791):** functional models of the Spartan-6 PLL (CLKOUT0-5 at the VCO's
  frequency divided, their duty cycle and phase, LOCKED) and I/O clock buffer (IOCLK, DIVCLK divided,
  SERDESSTROBE).
- **The device resources' test (#826):** its shipped devices' check takes the Spartan-3E ones, the Spartan-6
  device descriptions shipped too.
- **One model of each device's resources (#790, part of #787):** core/resources.js describes, for every part of the
  device database, the resources it has and how many: the common ones (flip-flops, LUTs, slices, distributed RAM, user
  I/O per package) and the family's own (Spartan-3E: RAMB16, MULT18X18SIO, 24 BUFGMUX, DCM; Spartan-6: RAMB16BWER /
  RAMB8BWER, DSP48A1, 16 BUFGMUX, 32 BUFIO2, BUFH, DCM, PLL, MCB), each with its label in English and Portuguese, its
  line of ISE's MAP report and the UNISIM primitives that use it. `resourcesOf`, `resourceCount`, `familyResources`,
  `primitivesOf` and `resourceOfPrimitive` are its API, for the schematic primitives, templates, wizards, reports and
  checks of #791-#796. The Design Summary reads it instead of its hard-coded 24 BUFGMUXs. Tested against DS312's and
  DS160's tables, the shipped devices' sites and ISE's MAP report of the LX16 and LX45.
- **The Start page's Open Example entries removed (#776):** its Project Commands are New Project…, Open Project… and the
  two imports; the examples stay New Project's templates, in their order (web/js/project.js, their Portuguese
  labels out of web/js/i18n.js). docs/GETTING-STARTED.md and docs/COMECAR.md say New Project… ▸ Start from ▸ Example.
  Test: test/ui/projects.test.js (no Open Example entry; the wizard's templates in their order; gates, traffic and
  pong opened through New Project…).
- **Test: the word-level models' counts of pong and clock (#775):** test/compiled-words.test.js records pong's and
  clock's cells, equalities and tables as the synthesis makes them since #742, #743 and #652's changes (the models still
  give the same outputs as bit by bit).
- **NET names with wildcards in the Silinx toolchain (#773):** the packer looked a NET's constraints up by its name as
  written, so `NET "led<*>" IOSTANDARD = LVCMOS33 ;` left those pads in LVCMOS25 (seen in the feat_iob_pair fixture).
  The constraints of each port bit now come from every NET statement whose name matches it (`*` any characters, `?`
  one, ignoring case), each attribute the last statement's that sets it, as ngdbuild does (core/ucf.js
  `portAssignments`; measured with ISE 14.7). Check Constraints reports a wildcard NET that matches no port: an error
  with I/O attributes (ngdbuild stops on one that matches no design object, ConstraintSystem:58), a warning with
  timing ones. feat_iob_pair's pads are now LVCMOS33, its bitstream byte-identical to ISE's.
- **The related tests of a data file (#772):** a pull request that changes only data (the bit database's JSON,
  a device description of `core/fpga/devices/`, an example, a test fixture, a research tool's measurements) runs
  the tests of the modules that read it and of the modules that import those, at any depth, as the tests that
  read it themselves; `scripts/related-tests.mjs` finds the readers in the code (a folder or a file named from
  the module's own place, `path.join(path.dirname(fileURLToPath(import.meta.url)), …)` or
  `new URL('…', import.meta.url)`), so a new file of the database is covered too. The research tools are among
  the sources it reads.
- **A menu and its submenus kept inside the window (#767):** web/js/ui.js menuBar and buildMenu move a menu left, a
  submenu to its menu's left (or against the window's edge) when it would run past the right edge, and up past the
  bottom; the Development menu's change titles at most 60 characters wide (web/css/app.css), whole in the item's
  tooltip. Test: test/ui/dev-menu.test.js (a 1024 px window, a long title: the menu and the submenu inside it, the
  title cut, its tooltip whole; both interfaces).
- **The bit database: an IOB's second flip-flop alone (#759):** IFF2 / OFF2 / TFF2 without the first, as ISE's map
  uses them for two registers of one kind on different clocks in a differential pair, measured with ISE on every DIFFM
  pad of the four devices (research/s3e-bitstream measure-759.sh, gen-iobpair.mjs; ana-iobreg.mjs --known solves only
  the settings the database lacks). A LOC'd pair of #749 writes a complete bitstream, byte-identical to ISE's (its
  placer warning is gone).
- **The UI test of the open mode's Technology Schematic (#758):** pong's netlist is 1009 cells since the synthesis makes
  the critical LUTs one level shallower (221fc1b, #652); the test expected 1012.
- **Hop-overs on by default (#756):** the Hop-overs checkbox of the schematic editor (#692) is now ticked unless
  the user turned it off (the choice remembered, as before); crossing wires that connect keep their junction dot.
  The printed schematic (and its saved SVG) shows the hops as drawn. Tests: test/ui/sch-hops.test.js (on with
  nothing remembered, the T's dot, the printed SVG, off remembered after the schematic is opened again, Portuguese;
  both interfaces).
- **A wire that would short two named nets is refused (#754):** the wire was added and the net had two names, the
  drawing keeping both, the HDL one of them, the error "net has several names" found only later. Now, as ISE's
  schematic editor ("Wire would create a short between net x and net y"), a drawn wire joining two nets that each
  have a name of their own (a net name or an I/O marker; VHDL case-insensitive) is not added, and the status line
  says why (core/schdoc.js netShort). Still allowed: the same name, an unnamed net, an output marker on another
  marker's net (assigned, y <= a). Tests: test/sch-netname.test.js (net names, markers, two input markers, VHDL's
  case, the cases allowed, the HDL of an allowed wire compiled and simulated in VHDL and Verilog),
  test/ui/sch-netname.test.js (refused with the note, an allowed wire drawn; both interfaces, English and
  Portuguese).
- **The pads' input delays measured with each pad used on its own (#751):** #97 solved them from designs where every pad
  had an input, so a bit of one pad's delay could go to its neighbour's. The issue's five bits are each the input-only
  pad's next to the I/O tile (46,31 / 47,31 A3's register, not B3's; 538,356 D18's, not E17's; 767,740 and 767,996 the
  XC3S1200E's E17 and E18's, not F14 and G13's), and designs with only some pads used found more such bits on all four
  devices. New measurements with ISE (research/s3e-bitstream: `gen-pairdly.mjs`, `gen-paddly.mjs`: every pad's kind and
  delay varied apart from its neighbours', 2 020 designs; `ana-paddly.mjs` gives each bit to the one pad it follows):
  1 199 of the 10 051 delay features change (`measured/fix-28-pad-delays.json`, applied by `pad-delays.mjs` at the end
  of `build-db.sh`), and every measured design, the 32 held-out random ones too, is byte-identical to ISE's bitgen. New
  board test `feat_iob_lone` (lone input registers on the XC3S500E, and on the XC3S1200E in the ISE tests). Tests:
  `test/iob-reg.test.js` (the five bits as ISE sets them with each pad alone, no delay bit in two pads' features,
  `pad-delays.mjs --check`), `test/open-flow.test.js`, `test/ise/open-flow.test.js`.
- **The two IOBs of a differential pair share each clock wire of their I/O tile (#749):** registers of one kind (input,
  or output / output enable) in a DIFFM / DIFFS pair on different clocks made the routing fail to converge. As ISE does
  (checked with ISE 14.7 on the Basys2-250: input and output registers, both ports' orders), the DIFFM's register goes
  on the IOB's second flip-flop (IFF2 / OFF2 / TFF2), clocked from the tile's second clock wire (IOIS_CLK4 / 5), with
  the static timing and the Post-Place & Route model following it; ISE's DRC is clean on that routed XDL. Pads without
  a LOC are kept out of such a pair by the placer (the bit database does not have the second flip-flop's settings on a
  pad alone yet, #759): a LOC'd pair is said with a warning naming the ports, their clocks and the tile, and the
  bitstream writer names the settings it lacks. `feat_iob_pair` (new): registers on two clocks, their pads left to the
  placer, byte-identical to ISE's bitgen.
- **Carry chains written as gates: a sum that starts another chain driven once (#746):** in an AND-inverter graph a
  sum is an AND of two inverted nets, so it was also found as the first carry (c = a & b) of the chain that adds it
  next, and both chains' rewrites drove it (Yosys's "multiple conflicting drivers": the EPFL multiplier 10 nets, sin 4,
  log2 16). Such a chain now starts at its next bit, the sum its carry in, and no bit is redriven twice. A regression
  test: an adder whose sum is the carry in of a second one, its netlist simulated against the design.
- **The netlist without the chains kept when larger by no more times than it is faster (#746):** the multiplier's
  netlist with its chains, now correct, was kept by the choice of #742 (2.1 times slower by the estimate, 128.6 ns
  routed instead of 63.9, for 36 % fewer slices); the one without them is kept again (the EPFL adder keeps its chains:
  1.8 times slower for a quarter of the LUTs).
- **A negation that wraps, read wider, synthesized right (#743):** Yosys 0.70's alumacc, after wreduce, merged a `$neg`
  narrower than the sum reading it into that sum at its full width, so -(-16) at 5 bits, read at 16, came out
  unwrapped (the Nightly's VlogHammer wideexpr_24040: `-($signed(-x))` gave 0xfff0 instead of 0x0010, at both
  efforts). core/synth-verilog.js writes `-x` as `0 - x`, a subtraction, which Yosys keeps at its width; the examples'
  netlists are unchanged, and the corpus's nine designs with a negation (ITC'99) within ±1.5 % in LUTs (b04 25 %
  faster). Test: test/synth-negation.test.js (the value by hand, the simulator, the netlist at Normal and High).
- **The carry chains' netlist chosen both ways (#742):** a design written as gates is mapped with and without its
  carry chains (#77); the netlist without them is now kept only when better than the one with them by `DEPTH_RULE`,
  not by default whenever the chains' was not better (`keepChains`). Since the SOP balancing (#654) the EPFL adder in
  the design corpus had kept a netlist 44 % faster by the estimate with 4 times the LUTs (171 → 676) and 74 % more
  slices, routed only 9 % faster: it has its chains again (171 LUTs, 194 slices, 12.98 ns). The EPFL max keeps its
  chains too: 1437 → 1367 LUTs, 27.9 → 23.6 ns. A netlist whose chains Yosys finds driven twice (the EPFL
  multiplier's rewrite, #746) is never kept. The EPFL multiplier's (+15 % LUTs, 38 % faster) and bar's (24 more
  flip-flops replicated, 7 % faster) results since #654 are recorded as the corpus's expectations.
- **Renaming a net connected by name renames the set (#734):** a net name's Name, a wire's Rename net and a net name
  put on an existing one now rename every net name of that net with the old name (case-insensitive in VHDL), each
  keeping its own bus range (d(7:0) becomes q(7:0)), and its I/O marker of that name (core/schdoc.js renameNet); the
  status line says what else took the name. Tests: test/sch-netname.test.js (the set, VHDL's case, a bus range,
  another name on the net left alone, the marker, the HDL compiled and simulated, in VHDL and Verilog),
  test/ui/sch-netname.test.js (the rename, the note, one Undo, the marker; both interfaces, English and Portuguese).
- **The Spartan-6 open toolchain's plan (#733, #1):** `research/s6/README.md`: what the Nexys3 (XC6SLX16) and the
  Atlys (XC6SLX45) need that the Spartan-3E flow lacks (the SLICEX / SLICEL / SLICEM slices, CARRY4, RAMB8BWER /
  RAMB16BWER, DSP48A1, the clocking, the I/O, the routing fabric, the UG380 bitstream), how each part is measured
  with ISE, the order of the work and its issues (#720–#733); the scripts of the first measurement night, checked
  without ISE: the work folder of the examples on both boards and their open-synthesis netlists (`night1.mjs`),
  the ISE runs (`ise-s6.sh`, `night1-remote.sh`), a reader of the Spartan-6 `.bit` (`bits6.mjs`) and the summary
  of the results as Silinx's own record (`summarize-night1.mjs`).
- **The Spartan-6 boards' device descriptions (#723, #1):** the packed routing graphs of the XC6SLX16-CSG324
  (Nexys3, 1.4 MB) and the XC6SLX45-CSG324 (Atlys, 2.9 MB), computed by Silinx from ISE's device reports of the
  first measurement night, ship in `core/fpga/devices/` as the Spartan-3E boards' do; their tiles, sites by type and
  PIPs are the reports', every pin of both boards a bonded pad.
- **The Spartan-6 devices of the Silinx toolchain, behind a developer flag (#722, #1):** `core/fpga/s6/devices.js`:
  the parts of the Nexys3 (XC6SLX16-CSG324) and the Atlys (XC6SLX45-CSG324) with UG380's IDCODE, frame length and
  configuration size, until the measurements replace them. With `SILINX_SPARTAN6_OPEN=1` in the server's environment
  the Silinx toolchain takes them for the steps it has (the synthesis and the Post-Synthesis Simulation Model) and
  refuses the others with a message naming them; without the flag nothing changes.
- **The Spartan-6's first ISE measurements (#721, #723, #724, #1):** night 1 of `research/s6` run on ISE 14.7: the
  device reports of the XC6SLX16 and XC6SLX45 (their tiles, sites and PIPs: DS160's slices exactly), the empty
  designs' bitstreams (the UG380 packet sequence, the IDCODEs confirmed), and the seven examples implemented from
  HDL and from Silinx's netlist on the Nexys3 and the Atlys, all routed; recorded as `research/s6/measured/night1.json`
  and in the research note. The packer's SLICELs are map's on every example (a test); map's SLICEX are a placement's.
  The scripts' fixes: the empty designs uploaded, `ngdbuild -aul` for Silinx's netlists, one device report at a time.
- **The Spartan-6 packer, a carry's sum and carry out both out of one position (#721):** as ISE's map packs it
  (night 1, the clock example), the carry out leaves by the position's multiplexed output and the sum through the
  position's storage element set as a gate (AND2L), out by its Q, in a slice of no other storage element; the
  packer's last warning on the examples is gone. Its SLICEL counts equal map's on every example and both boards.
- **The Spartan-6 slice model and packer (#721, #1):** `core/fpga/s6/pack.js` packs a netlist of the open synthesis
  for the Spartan-6 into SLICEX, SLICEL and SLICEM slices: four LUT6 positions (O6, and O5 when LUT combining is on,
  off by default as in ISE's map), eight storage elements of one control set (latches in the FFs only, never beside
  a 5FF), carry chains as columns of SLICELs with their LUTs at S and DI by O5 or the bypass inputs, the F7AMUX /
  F7BMUX / F8MUX with their LUTs, the SLICEM's RAMs and shift registers by clock, write enable and write address, the
  multiplexed outputs; `checkSlice` checks every rule. Every example packs into legal slices for the XC6SLX16; the
  comparison with ISE's map comes with the first measurement night.
- **The Spartan-6 primitives simulated (#720, #1):** Silinx's models of the cells the open synthesis maps a Spartan-6
  design onto (Yosys `xc6s`): CARRY4, SRLC32E, the SLICEM's RAM128X1S / RAM128X1D / RAM256X1S / RAM32M / RAM64M,
  DSP48A1 (its registers, pre-adder, multiplier, X / Z multiplexers, post-adder, synchronous or asynchronous reset)
  and RAMB16BWER / RAMB8BWER (every width, TDP and SDP, byte write enables, the write modes, the output register,
  SRVAL, INIT), in the UNISIM library of the simulator (`core/unisim-s6.js`) and in the Board Emulator's compiled
  engine (`core/compiled-prims-s6.js`). The Post-Synthesis Simulation Model of a design synthesized for the XC6SLX16
  (Nexys3) can be simulated: every example's test bench passes on it in VHDL and in Verilog, with no warnings, and
  the compiled engine runs it as the event-driven simulator does; each primitive's netlists simulate as their RTL.
- **The Board Emulator while it is not seen, and its drawing (#719):** paused by default while `document.hidden` and
  while its document tab is not the active one (an IntersectionObserver on its element), the status line saying
  "paused while hidden"; seen again, it goes on in real time from where it was (no backlog). "When hidden: Keep
  running" (remembered in `silinx.emulator.hidden`) simulates on and draws nothing. The frames come by
  `requestAnimationFrame` (at most 60 a second, a timer only while it runs hidden), an LED's style, a digit's segments,
  the watched values and the status written only when they changed; no timer while paused or powered off (it was every
  4 ms running and every 30 ms paused). Measured with blinky in Chrome on macOS: running about the same (the worker's
  50 MHz simulation), 0 timers a second instead of 205; behind another document tab 0 % CPU instead of 60 %; hidden
  0.1-1.6 % instead of 53 %; paused 0 timers a second instead of 31. Tests: `test/ui/emu-hidden.test.js`.
- **The compiled engine's activity by the bits of a value read (#715, found with #670):** a cell reading part of a
  value is evaluated only when those bits change. Logic reading a counter's high bits no longer runs at every
  cycle. Every combinational cell of up to 32 bits may now track its changes for the cells that read it; the
  profile keeps this only for a cell whose value changes less than a quarter as often as what it reads, since the
  test costs more than it saves otherwise. The choice of the guarded segments weighs each cell by its operations (a
  table read with a ten-bit address against a NOT), and puts the cells evaluated at most cycles together. A cell
  read only inside its own segment sets no flag. The results are the same, cycle for cycle. In millions of cycles a
  second, Node / Chrome, against the previous version: the behavioural designs traffic 151 / 133 (from 73 / 78),
  blinky 210 / 180 (131 / 185), pong 76 / 74 (39 / 45), stopwatch 103 / 104 (70 / 77), clock 118 / 115 (71 / 75),
  vga 63 / 63 (64 / 64); the post-synthesis models pong 30 / 31 (22 / 22), stopwatch 77 / 67 (59 / 60), traffic,
  blinky, clock and vga as before. pong's and clock's models stay below the board's 50 MHz (#670): their test
  bench's generics make most of their logic change every cycle or two. With the same generics, the behavioural
  designs run at 52 (pong) and 68 (clock). A compiled model's `stats.work` gives the estimated work of a cycle.
- **The XC3S1200E's other long-line splitters in the bit database (#709):** the centre column's (CLKV_LL, 36
  switches) and the I/O columns' (CLKL_IOIS_LL / CLKR_IOIS_LL, 28 each), one bit each, measured with ISE
  (`ll-splitters.mjs`), not used by the router yet. ISE's XC3S1200E designs that use them are byte-identical with no
  exception for the splitters' frames. The side DCM's `DCM_CLKFB -> DCM_CLKFB_PINWIRE` loses a bit stage F gave it,
  which was a splitter's. `merge-db.mjs` keeps a type's `noRoute`, which keeps the router off
  the type's own features only (CLKV_LL's clock switches, shared with CLKV, stay routable).
- **The Development menu tested on real builds (#707):** scripts/build-info.mjs takes GitHub's API from
  GITHUB_API_URL (a workflow's, api.github.com by default). test/build-dev-menu.test.js builds the single file on a
  repository of its own against an API served by the test: a development build carries its changes typed by their
  labels and never the token; the same commit tagged v<VERSION>, a release, carries none and asks the API nothing.
- **The Development menu (#707):** a development build (the site's dev/ and the development single file) carries its
  changes since the last release, the changes/*.md fragments typed by their issues' labels (bug, enhancement) from
  GitHub's API at build time (scripts/build-info.mjs devChanges, only with the publishing workflows' token, issues:
  read in pages.yml and dev-release.yml; core/changelog.js buildChanges), in core/version.js BUILD. web/js/devmenu.js
  shows them after Help, their text written as text (bold and code as elements); a release and the local server show
  no menu. Tests: test/changelog.test.js, test/build-info.test.js (the labels, the token only in the requests, no
  request without one), test/ci-workflow.test.js (the permissions, the token in the build step only),
  test/ui/dev-menu.test.js (the menu in both interfaces and in Portuguese, a change's window, the text not as HTML,
  no menu without a development build).
- **The truth table's "Essential prime implicants (SOP)" line removed (#705):** below the NAND and NOR forms, with
  its Portuguese translation; the K-map legend's "essential" marks stay. Test: test/ui/truthtable.test.js (the line
  gone, in both interfaces; the results' other forms as before).
- **Edit ▸ Language Templates removed (#703):** the templates stay in the HDL editor (its Templates ▾ button and its
  context menu's Language Templates); the error hints that sent to the menu item (core/hints.js, in English and
  Portuguese) name the editor's button. Tests: test/ui/editing.test.js (the Edit menu without it, in both
  interfaces; the editor's button inserts a template), test/hints.test.js (no hint names the menu item),
  test/ui/app.test.js (the menu test's list).
- **A truth table's HDL language in its editor (#696):** *Language* (VHDL / Verilog) beside *HDL logic*, as the
  ASM, state diagram and Petri net editors have it: a change makes the table's HDL file again in that language
  and removes the other one (`drawnHdlLanguage`), the Design pane's badge follows (`[VHDL]` / `[Verilog]`,
  last), a module that instances it and the table's schematic keep working. A new table is in the project's
  preferred language, as before.
- **Native primitives with a fixed sensitivity (#695):** the netlist primitives evaluated in JavaScript
  (core/native.js) no longer run as generators that allocate a waiter at every wake. Each has one waiter, kept in its
  inputs' waiter sets (core/simulator.js). Their inputs' bits are compared, not masked (a BigInt `&` allocates). A
  whole write of a value of the signal's width and sign stores that value itself instead of a copy, so the
  primitives' shared 0 and 1 reach their inputs (core/interp.js). blinky's models now run 123k / 85k / 83k cycles a
  second (post-synthesis / post-translate / post-map, was 31k / 17k / 16k) and pong's 33k / 28k / 25k (was
  10k / 6k / 5.9k), with the same outputs cycle by cycle. The behavioural design's speed is unchanged.
- **A reset of a netlist's simulation (#698):** the native primitives kept the previous run's state: their outputs'
  values projected under the old run's delta stamps, and a shift register's or a distributed RAM's contents. After
  `Simulator.reset()` (the Board Emulator's Power cycle) a counter could stand still. They now start again from
  their initial state.
- **The schematic of a truth table, always generated, in its HDL logic form (#694):** the table's module row
  in the Design pane has a *Schematic* badge (between *Table* and *VHDL* / *Verilog*) that opens it,
  read-only, redrawn whenever the table or its form changes; not a file of the project. HDL and schematic
  are made from the same expression of each output (`outputForm`): minimal SOP (AND / OR / NOT gates), POS,
  the XOR form (XOR / XNOR gates), NAND or NOR gates only; at most 5 inputs an AND / OR gate, 4 the
  others. The *Generate Schematic* button and its *NAND gates only* check box are removed; a schematic an
  older project made with them stays a module of its own.
- **NAND gates only and NOR gates only (#694):** two new *HDL logic* forms, the minimal SOP with NAND gates
  only and the minimal POS with NOR gates only, by double negation (`gateForm`; a complemented input is an
  inverter, a NAND / NOR of one input): the HDL with NAND (NOR) operations only (`a nand b`,
  `not (a and b and c)`, `a nand a`; `~(a & b)`), the schematic with NAND (NOR) gates only. The editor's
  results show the *NAND form* and the *NOR form* of each output, below the XOR form, with their gate
  counts.
- **No Check my answer (#694):** the editor's *Check my answer* and *My expression* are removed
  (`compareExpr` too).
- **Hop-overs (#692):** the schematic toolbar's Hop-overs checkbox (off by default, remembered) draws the
  horizontal segment of a crossing with a small arc over the vertical one, where the two cross inside both
  (`wireCrossings`, core/schdoc.js); not at a T-junction, a bend or a wire's end. A view only: the document,
  its nets and its HDL do not change. In Portuguese, "Saltos".
- **Connecting nets by name, asked (#689):** Add Net Name, a wire's Rename net and a net name's Name, given
  a name that another net has (a net name or an I/O marker, case-insensitive in VHDL, a bus name by its
  base), ask "Connect by name" or "Cancel" (`netByName`, core/schdoc.js); Cancel adds or changes nothing.
  The rule itself is the same as before (the same names are one net, as the gates example uses it): only
  a new name no longer joins a net silently. In Portuguese too.
- **One wire segment dragged (#688):** with Keep connections, dragging a wire moves the segment under the
  pointer across its direction (`moveSegment`, core/schroute.js); its two neighbours stretch or shrink, a
  neighbour shrunk to nothing is merged away; the wire's end on a pin, a marker or another wire stays, joined
  by a new short segment (a free end moves with the segment); the net names on the segment go with it, one
  on a neighbour that shrank past it is put back on the wire. The nets and the generated HDL do not change.
  Without Keep connections the wire still moves whole; a part dragged still drags its wires' ends.
- **An inout port neither read nor driven, as XST (#684):** the design checks (`core/lint.js`, check
  `unused-inout`) report a bidirectional port that nothing in its module (or below it) reads or drives, at the
  port's line, as `WARNING:Silinx:2565 - Inout <io> is never assigned.`: XST's warning (Xst:2565, learnt from XST
  14.7 on probe designs), one per bit of a bus from its right index (`Inout <iob<0>> is never assigned.`). A port
  only read, only driven (a tri-state buffer) or connected to an instance that uses it gets none, as in XST. Its
  help text is in `core/hints.js`. Silinx's open synthesis gives none of these unused-port warnings (Check Syntax
  does), so it is not added there. Tests: `test/lint.test.js` (VHDL and Verilog, a scalar and a bus, read, driven,
  through an instance, the suppression comment), `test/sch-iomarker-void.test.js` (a schematic's bidirectional
  marker left unconnected), `test/hints.test.js` (the help, English and Portuguese), `test/ui/hints.test.js` (Check
  Syntax and the help in the app, VHDL and Verilog, English and Portuguese).
- **The width on the arithmetic symbols (#681):** ADD, SUB and COMP with bus pins draw their type with their
  width under the symbol (ADD8, SUB16, COMP4, as the gates their type) and the width by each bus pin (A, B,
  S / D), as multiplexers and module symbols do; a CONSTANT wider than a bit shows its width by its output.
  The name comes from one function, `symbolTypeName` in core/schdoc.js (the counters' and registers' CNT8 /
  REG8 too), so the canvas, the printed / saved SVG and the Symbol Info drawing show the same.
- **I/O markers placed on empty space (#680):** Add I/O Marker no longer needs a wire end or a pin. On empty
  space it places a marker of 1 bit (an input unless the options choose another direction) and asks for its
  name with the next free one, in1, out1 or io1 (core/schdoc.js `freePortName`: not taken by a marker, a net
  name or an instance). Its port is in the generated VHDL and Verilog. A wire drawn later from or to its tip,
  or the marker dragged onto a pin or a wire end, connects it. Left unconnected, the editor's Check warns
  `I/O marker 'in1' is not connected`, and Check Syntax gives XST's warnings: `Input <in1> is never used.`,
  `Signal <out1>, unconnected in block <top>, is tied to its initial value.` (a bidirectional one: XST's warning
  to come, #684). The tool's hint and the name prompts are in Portuguese.
- **One list of the reserved words of VHDL and Verilog (#679):** `core/reserved.js` holds the words of VHDL-93 /
  2008, Verilog-2005 and SystemVerilog-2017, used by the New Source wizard (and its Module, Schematic, Petri net
  and Test Bench wizards), Rename, Add Copy of Source (a drawing so named is refused), the truth table's and the
  schematic editor's names, Rename Symbol, and the checks of the schematics, FSMs, ASM charts, Petri nets and
  truth tables (several copies of the list, which differed, are gone). A new name is refused in any letter case
  and in both languages, as a drawing's HDL is generated in either; an existing name is an error of its drawing
  when its HDL would not compile (a schematic named AND now says so instead of failing in the compiler), else a
  warning (a word of VHDL or Verilog; SystemVerilog's own words, good names for XST and Yosys, only refused for
  a new name); a module so named is warned of when the project is opened and at Check Syntax.
- **Schematic connectivity at the wires' ends (#678):** pins, I/O markers and wire ends at the same point
  connect; a wire's segments and bends do not (a pin or a wire end lying on them stays apart). A connection
  made in the middle of a wire (a wire ended on its segment or bend, a symbol or a marker dropped onto it,
  #170) splits that wire there, so the joint is an end of both (`splitWiresAt`). The documents become
  version 3: one of version 2 is converted on opening, its wires split where they connected (its nets and
  its HDL the same; with module symbols, once the modules are known). The schematics made from HDL, from a
  truth table and from ISE's `.sch` join each net's own wires only: two of their nets that merely touched no
  longer merge (an imported ISE adder's CO and OFL, a fallback layout's nets). The junction dots: three
  wire ends, or two at a pin; a named bus split at its taps still shows its name once per straight run.
- **The ASM, FSM and Petri net editors' Cut / Copy / Paste (#677, core/drawclip.js):** the nodes selected and
  the connections between them (ASM connections, FSM transitions and self-loops, Petri arcs), pasted offset and
  selected, a name already used made new (_1, _2…); pasted into an empty drawing, the copy's initial state
  becomes its. Edit ▸ Delete deletes the selection, a transition or an arc included.
- **Edit ▸ Cut / Copy / Paste / Delete in a text field (#677):** with a field of an editor in focus (a name, an
  expression, a property, the truth table's or the pin planner's), the menu and the toolbar act on its selected
  text, not on the drawing; the toolbar's buttons leave the focus where it was.
- **Edit ▸ Cut / Copy / Paste / Delete and the toolbar dispatched to the active editor (#677):** as Undo / Redo
  are; disabled when there is nothing to copy or paste; the modern interface shows the toolbar's Cut / Copy /
  Paste too. Through the system clipboard where the browser allows it, else a clipboard of the app's own
  (file://, a permission refused).
- **The schematic's Cut / Copy / Paste (#677, core/schclip.js):** the selected parts, wires, net names and I/O
  markers, with the wires joining the copied parts (not those leading to parts left behind); pasted offset and
  selected, an instance name already used gets the next inst_n, a marker's or a net's name already used gets
  _1, _2… (a net name of a marker of the sheet is kept: the copy joins that port). Ctrl+V reads the system
  clipboard, so a copy made in another tab pastes too.
- **The Silinx toolchain no longer called experimental (#675):** the mode's label "Silinx toolchain (no ISE)"
  (Toolchain Settings, the processes' tooltip, the start page's tip, the server's log and status, the CLI) and its
  Portuguese "Toolchain Silinx (sem ISE)"; the settings' note "Experimental: check the design on the board." left
  out; README.md and docs/QUALITY.md (test/designs-corpus/quality-page.mjs) updated. Tests: test/docs.test.js (no
  doc and no label of the interface calls it experimental), the label's tests in test/cli.test.js,
  test/open-toolchain.test.js, test/ui/app.test.js and test/ui/open-toolchain.test.js.
- **Two fingers on a drawing (#674):** `twoFingerView` (`web/js/ui.js`): a second finger on a drawing's canvas takes
  the gesture from the editor, undoing what the first finger started (a selection band, a move, a changed
  selection; in the waveform viewer, the cursor moved); the fingers' centre pans the view and their spread zooms it
  about that centre, once a frame from every finger's last point; Safari's own pinch of the page is turned off on
  the canvas. The UI test simulates the gestures (real touch events in Chrome, the touch screen's pointer events
  in WebKit and Firefox: `page.touchGesture`).
- **The I/O registers' clocks (#671):** the left and right I/O tiles' clock pins from every global line (only line 4
  was measured) and the horizontal clock rows of the I/O columns (GCLKH_PCI_CE_S / _N: GCLKH's switches, 2 frames
  further in the left column; the writer had set them 2 frames early there), measured with ISE (`measure-671.sh`:
  designs with IDDR2 / ODDR2 on every pad clocked from each of the 8 top and bottom buffers, every PIP removed by
  codewords, on the XC3S100E, XC3S250E and XC3S1200E; `measured/learn-16iob-clk-lines.json`, the layouts' `typeCols`).
  The router reaches an I/O register's clock pin from the global lines only, as ISE does (the clock search takes the
  tile's IOIS_CLKj on its way; B4's register came through general routing), and the packer keeps out of the IOB a
  register whose clock is not on a global buffer, with a warning. Two kinds of bits of the pads' own features (#44 /
  #96's solution) corrected with ISE: the clock rows' bits one pad of each row held for the writer's error
  (`pad-clock-rows.mjs`), and the bits of `R:ICLK2INV:#OFF` given to the pad they belong to, not the other pad of the
  tile or one of the next (the 3,71 ISE sets for B4 had gone to C4: `pad-owners.mjs`,
  `measured/fix-27iclk2-owners.json`); 5 bits of an input delay stay open (#751). Two registers of one I/O tile on different clocks do not route (#749).
  `feat_iob_plain` has its registers on pads of the four sides, `feat_iob_lines` (new) clocks left and right IOB
  registers from each of the eight lines: DRC clean and byte-identical to ISE's bitgen on the four devices.
- **A gate-level model's comparisons with a constant found before its tables (#670):** core/compiled-tables.js now
  recognizes a model's comparisons of a counter with a constant (LUTs of 4 bits each and the LUT of their results)
  in a pass of their own, before the tables. Each is one equality, and the logic beneath it no longer goes into a
  table: clock's model has 8 500 words of tables instead of 30 000. In Node, clock's post-synthesis model runs about
  9 % faster and stopwatch's about 4 %, the others the same. In Chrome stopwatch's runs about 18 % faster. Measured
  under load, against main, interleaved. Two words compared bit by bit (a ^ b = v) as one equality was tried and
  was slower: pong and blinky about 10 %.
- **The router's polish of the critical path (#662, #651):** once the routing is legal, the critical path's
  connections one at a time, the slowest first, each one's own branch routed again on the wires no other net
  uses, or on those of less critical nets, which are then routed again around it; a change is kept only when
  the critical path is no longer. The timing passes after the routing is legal are 4 (were 2), at a lower
  congestion factor, so that a critical net can take a contested wire. On 19 designs (the slowest of the
  corpus against ISE, those with multipliers or block RAMs, and the examples; three placements each) the
  critical path is 1.3 % shorter by Silinx's analysis (itc99-b08 −5 %, itc99-b12 −6 %, T80 −1.6 %), none
  longer; by ISE's trce, on the 9 slowest at seed 1, 2.1 % shorter (T80 −5.5 %, itc99-b08 −12.5 %, itc99-b10
  +2.9 %), the examples as before (±0.8 %), every bitstream still byte-identical to ISE's bitgen with a clean
  DRC. The routing takes about 1.3 times as long.
- **trce's Component Switching Limit checks on the DCMs (#661):** `checkSwitching` gives each DCM's CLKIN and each
  output it drives (CLK0 / 90 / 180 / 270, CLK2X / 2X180, CLKDV, CLKFX / FX180) its period, derived from the PERIOD
  of the pad its CLKIN comes from, against the pin's minimum and maximum period as trce 14.7 checks them on the -4
  (measured on 23 designs built by ISE's own flow, `research/s3e-route/switching-limits.mjs`): CLKIN 4.166 to 200 ns
  when the DLL is used (CLK_FEEDBACK 1X / 2X), 3.002 to 5000 ns when not; CLK0 4.166 to 200, CLK2X 3.214 to 100, CLKDV
  6.249 to 3225.8, CLKFX 3.067 to 200 ns; with CLKIN_DIVIDE_BY_2, trce halves every one of them, the outputs' too. The
  timing report has a line for each ("switching limit of u_dcm/CLKFX (Tdcmpfx): NOT MET, period 200.000 ns, max
  period limit 100.000 ns (10.000 MHz), slack -100.000 ns"), the flow a `WARNING:Timing` and a timing error for each
  one not met, the Design Summary a row. Not in the packer: the limits are checked against the PERIOD constraint,
  as trce does, not CLKIN_PERIOD, and ISE's map and par accept such a DCM. The board test `feat_dcm_div2` had
  this error under ISE (CLKFX x 3 / 15 of its halved input: 200 ns): its CLKFX is now x 2 / 5, 100 ns, at trce's
  limit. Tests: `test/fpga-timing.test.js` (every limit against trce's figures on the same settings),
  `test/open-flow-core.test.js` (the old and new feat_dcm_div2 settings in the flow, the report, the warning).
- **A gate-level model's irregular logic as lookup tables (#659):** core/compiled-tables.js turns a model's
  one-bit logic into tables after core/compiled-words.js. This covers a counter's comparisons with constants, the
  decoders and the next state of a state machine. Each cone of gates, multiplexers and LUTs with 12 inputs at most
  is a ROM of its outputs at every value of those inputs: one read for tens of cells, several outputs in one word.
  When a netlist's tables would exceed 50 000 words, they get fewer inputs. A wide comparison of a counter with a
  constant becomes one equality. wordLevel then makes the flip-flops the tables feed into registers again, and each
  table's inputs follow their register's bits. Nets inside a table are no longer listed in the Watch box.
  Results are cycle for cycle the same: each example's models against bit by bit, and a synthesized design against
  the event-driven simulator. In millions of cycles a second (Node / Chrome), the post-synthesis models now run:
  traffic 165 / 203 (from 47 / 46), blinky 80 / 79 (39 / 44), stopwatch 50 / 49 (29 / 32), clock 35 / 35
  (16 / 17), vga 56 / 67 (18 / 18), pong 20 / 20 (15 / 16).
- **Research: where the speed against ISE is lost, design by design (#656):** a section of
  research/synth-quality/README.md, from the weekly comparison's breakdown of the critical paths (#646): for each
  design slower than ISE at Normal and at High, its logic (levels, LUT, carry and flip-flop delay) and its routing
  against ISE's, and the causes ranked by the speed each could win: the critical path's routing first (#651), then a
  LUT level more on short control paths (#652), the clock enable at the end of the path (#653), the EPFL
  multiplier's depth (#654) and the adder's carry chain (#655).
- **The GIA's SOP balancing, a candidate of the deep designs (#654, #655, #52):** a design whose usual netlist is
  more than 16 levels of logic deep (of 20 000 LUTs at most) is also mapped by ABC's `&sopb` (the logic balanced
  as sums of products on its GIA, then `&if -g` and `&synch2`, twice) onto LUT4s, at both efforts, and that
  netlist kept when better by the depth-oriented mapping's rule (at Normal, for a design too large for High's
  mappings, only when a quarter faster). Measured by ISE's trce on the routed designs (XC3S1200E, I/O wrapper):
  the EPFL multiplier 93.2 ns -> 61.6 (ISE 66.8; 16 % more slices, still 29 % fewer than ISE's), max 27.3 ->
  22.5 (ISE 25.7, fewer slices), adder 13.3 -> 11.4 (ISE 12.2: 8 levels of LUTs as ISE's, in place of the
  128-bit carry chain). `r.depth.sopb` says what happened.
- **The critical path mapped again, its clock enables folded into D (#653, #652):** two candidates after every other
  mapping, at both efforts (designs of 1500 LUTs at most), each from the netlist before the LUT mapping and kept by
  `DEPTH_RULE` against the netlist chosen: ABC's `speedup` after the usual mapping (`SPEED_ABC`: the critical path's
  LUTs remapped with their timing-critical cuts as choices), then the flip-flops whose CE ends the critical path
  (`criticalEnables`, from the estimate's path ends, `pathEnds`) with their enable a multiplexer before D and CE tied
  high (`FOLD_CE_MAP`, every FDRE / FDSE / FDCE / FDPE and its falling-edge form), so that the enable's last LUT and the
  hold share one LUT and the path does not pay the CE's setup (Tceck 0.555 ns). Recorded in the synthesis's
  `depth.speed` and `depth.fold`; a remap that fails keeps the netlist chosen, with a warning. By ISE's trce on the
  corpus's 53 designs of 1500 LUTs at most and the examples: at Normal 24 change, 6.1 % shorter on average (itc99-b09
  −22 %, serv −21 %, itc99-b08 −15 %, iwls05-i2c and usb-phy −12 %, the traffic example −12 %; light8080 +2.9 %, the
  clock example +4.2 %), 2.8 % over the 53; at High 7 change, 0.7 % over the 53; slices 10029 → 10015 (Normal) and
  9942 → 9904 (High); every bitstream byte-identical to ISE's bitgen with a clean DRC. The level more of
  spi-fpga-slave (#652) is found by the speedup but duplicates its shared enable (21 LUTs → 33): refused, still open
  (research/synth-quality/README.md, "The short control paths").
- **The critical LUTs made one level shallower, their fan-out kept (#652):** a last candidate of the synthesis
  (`core/lut-resynth.js`, at both efforts, designs of 1500 LUTs at most), on the netlist chosen of all the others and
  kept by `DEPTH_RULE`: each LUT that ends a critical path, at level L, is made again from its cone's signals of level
  L-2 at most, as one LUT of up to 4 of them or as h(g(A), S) (a decomposition of its function with a new LUT g of
  signals of level L-3 at most), found by truth tables, its output (and so its fan-out) kept; the LUTs it read stay
  where something else reads them, and a LUT that the netlist already has (the same function of the same signals) is
  read instead of a new one. Round after round while every end of the critical path can be made shallower. On
  spi-fpga-slave the shift register's enable is 2 levels instead of 3 with its shared `load_data_en` kept (21 LUTs → 23,
  14 slices; ABC's speedup found the 2 levels with 33 LUTs and 19 slices, refused). Recorded in the synthesis's
  `depth.resynth` (`resynth: false` leaves it out). Measured with Silinx's static timing on the corpus's 53 designs of
  1500 LUTs at most and the 7 examples, routed: at Normal 14 change, 5.8 % shorter on average (1.4 % over the 60), at
  High 16 change, 4.3 % (1.2 %); slices +5 at each effort (of 10935); at placer seeds 1 to 3 the changed ones 4.5 %
  shorter (spi-fpga-slave −18 %, the clock example −15 %, itc99-b13 at High −14 %, verilog-uart at Normal −12 %),
  three slower (verilog-uart at High +5 %, vtr-ch-intrinsics and iwls05-sasc at High +3 %: faster by the estimate,
  slower routed). By ISE's trce on the same routed designs: 4.55 % shorter over the 20 changed builds (spi-fpga-slave
  5.76 → 4.95 ns, ISE's own flow 4.94), every bitstream byte-identical to ISE's bitgen with a clean DRC.
  research/synth-quality/README.md, "The critical LUTs made shallower".
- **The state machines fsm_detect refuses for their users alone, one-hot (#652):** Yosys's fsm_detect turns down a
  state register whose users "don't seem to benefit from recoding" (a heuristic), where XST re-encodes it: iwls05-i2c's
  bit controller, 18 states written one-hot (idle all zeros) and tested on all 17 bits, two LUT levels more than XST's
  netlist on the critical path. The search for state machines (`core/synth-fsm.js`, #539) now reads fsm_detect's
  messages, marks such registers by hand (never one a port reads, nor one refused for another reason), extracts them in
  a quiet run of their own, and tries those of 8 states or more one-hot, their power-up state kept (state 0, the
  flip-flops', when the register has no initial value), kept by `DEPTH_RULE`; at Normal too (one quiet Yosys run more
  beside the usual one), where #539's machines stay High's. The copy of an old state register that `fsm` keeps for a
  reader it cannot take in now gets the old initial value too (it powered up undefined). Measured on the corpus's 53
  designs of 1500 LUTs at most and the 7 examples, routed (Silinx's static timing, seed 1): iwls05-i2c alone changes,
  at Normal 253 → 211 LUTs, 137 → 116 slices, 8.66 → 5.82 ns (ISE's flow 5.91 by trce), at High 260 → 205 LUTs,
  141 → 123 slices, 8.68 → 6.32 ns; verilog-i2c-master's 16-state machine is tried and not kept; the other netlists
  are the same. By ISE's trce on the same routings (seeds 1 to 3, both efforts): 29.8 % shorter, Normal 8.33 → 5.71
  ns at seed 1 (ISE's own flow 5.91), every bitstream byte-identical to ISE's bitgen with a clean DRC.
  research/synth-quality/README.md, "State machines fsm_detect refuses for their users".
- **Two placements at Optimization Effort High (#651):** a placement's seed moves a design's critical path by several
  per cent, more than the placer's options do, so at High the flows (`core/open-flow-core.js`, Implement Design and the
  Post-Place & Route model's design) place and route the design from seeds 1 and 2 (`HIGH_TRIES`) and keep the faster
  (then register replication from it, as before); the console says both periods and the seed kept. Normal makes one
  placement, as before. Measured with Silinx's static timing on the corpus's 53 designs of 1500 LUTs at most and the 7
  examples, routed at High: 1.52 % shorter in geometric mean, 29 designs faster (3.1 % on average: verilog-axis-fifo
  −10.8 %, the clock example −10.4 %, spi-fpga-slave −7.3 %, epfl-router −6.9 %, picorv32 −4.8 %), two slower
  (iwls05-usb-phy +2.2 %, iwls05-sasc +0.1 %: register replication from the other placement), the slices the same, the
  place and route 1.33 times as long. Tried and dropped: a second, cool placement from the first one with each
  connection's estimate scaled by its routed delay (0.6 % on 15 designs, against 2.3 % for a second seed at the same
  time). By ISE's trce on the 29 changed routings: 2.92 % shorter (the clock example −14.3 %, femtorv32-quark −8.1 %,
  picorv32 −7.3 %), 8 slower by 2.3 % at most, every bitstream byte-identical to ISE's bitgen with a clean DRC.
  research/s3e-route/README.md, "Two placements at Optimization Effort High".
- **The router's polish of the critical path: a connection's whole net routed again, and a lookahead (#651):**
  two more moves after #662's, each kept only when Silinx's timing analysis says the critical path is shorter,
  so never slower by it. The whole net of a connection of the critical path routed again on the wires no other
  net uses, its branch loads weighted by the most critical load below a node instead of the sum of their
  criticalities: a reset or a clock enable whose loads are all critical had a chain of shared doubles
  (vtr-ch-intrinsics' reset, 1.41 ns where 0.51 was free), which no change of one load at a time shortens,
  each new branch slowing the others. And, when no change gains, a lookahead: one of the path's three slowest
  connections made faster though another path gets longer, then up to 16 changes from there, all of it kept
  when the critical path ends shorter. The polish's searches count the branch loads of the net's tree, as the
  router's do. By the analysis, on 31 designs (the issue's, the examples and more; seeds 1-3 of the same
  placements, without replication): −0.33 % on the XC3S250E (epfl-bar −2.8 %, epfl-max −1.8 %, verilog-uart
  −1.1 %), −0.49 % on 16 of them on the XC3S1200E (epfl-bar −2.7 %, iwls05-i2c −1.7 %), none slower, the
  routing 3–4 % longer; in the app's flow (with register replication, seeds 1-2) −0.27 % and −0.29 %, the place
  and route as long as before. Checked with ISE: by trce −1.12 % on the examples and six corpus designs (epfl-max
  −4.4 %, epfl-bar −2.9 %, iwls05-i2c −2.5 %, verilog-uart −2.2 %, none slower), every `.bit` byte-identical to
  ISE's bitgen, DRC clean. `research/s3e-route/crit-path.mjs` no longer counts a carry chain's connection as
  −0.103 ns of the placement's floor (it inflated the router's share by 0.1 ns per carry stage).
- **A gate-level model at word level again (#650):** core/compiled-words.js rewrites the netlist the compiled
  simulator reads from a synthesized or implemented netlist: a carry chain (MUXCY / XORCY, or their folded gates)
  is an addition, the flip-flops of its operands one register in its order, the multiplexers, gates and LUTs of
  the same kind side by side between them one word cell (a LUT a few bitwise operations, its pins in any order as
  the router leaves them); what is not such a word stays bits. Cycle for cycle the same values (the event-driven
  simulator on primitive netlists, every example's models against bit by bit). pong's and clock's models run at
  13 to 15 million cycles a second instead of 3 to 4, blinky's at 45 to 58 instead of 32.
- **The compiled code optimized by Chrome from the start (#650):** `CompiledSim.cycle` calls `run()` in pieces of
  10 000 cycles, the same values and counts: V8 optimizes a function called again and again with Turbofan, while a
  long-running `run()` stayed seconds in Maglev in Chrome (vga's model: 3 million cycles a second over its first 8
  million, now 10, as Node). A UI test runs vga's model in the browser and in Node: the same outputs, counts and VGA
  state, and in Chrome at least 0.6 of Node's speed.
- **The side clock pads' dedicated paths in the bit database (#641):** measured with ISE on the four devices (each side
  clock pad on the buffer ISE's placer gives it): the side clock tiles' CKIk -> GCLKk, one bit each; the pads' pin
  switches set none. The nearest side buffer a pad reaches on known switches is the one ISE gives it (the 58 measured),
  and the placer puts a clock on a side GCLK pin there instead of on a top / bottom buffer through general routing; the
  router no longer takes the pad's own IOIS_Yk -> IOIS_Fk_B3 in the CLK_PCI I/O tiles (`noRoutePips`). A new
  open-flow fixture, feat_side_clock.
- **A DCM's clocks at the pads, fitted to trce (#601, the second part):** `clockArrivals` gives a DCM's clocks the
  arrival at its CLKIN plus `SPEED_4.clock.dcm` (the deskew: CLKIN from a pad or from a global line, DESKEW_ADJUST's
  taps), then the output's phase (its first edge times the pad's PERIOD; a falling-edge flip-flop half its period
  later), three arrivals as trce counts them: the latest (clock to pad), the earliest (setup) and the inputs' hold.
  `analyzeTiming` takes the UCF's clocks (`opts.clocks`) for the phases; `checkOffsets` finds a DCM clock's pad; a pad
  bounded on two clocks names each in the report, the warning and the report's constraints ("met on sw<0>, clock
  clkfx_b"). Measured with trce on six DCM designs (research/s3e-route/dcm-timing.mjs, ISE's own flow and Silinx's
  routing with a PCF in map's form; dcm-timing-compare.mjs): the derived constraints and the requirements between two
  clocks are the first part's (CLK0 -> CLKFX 6.666, CLKFX -> CLK2X 3.334), the skew between a DCM's outputs within
  ±0.02 ns and the clock uncertainty 0 (none counted); model - trce on Silinx's routing: setup rms 0.131 ns, hold
  0.094, clock to pad 0.116 (27 values each), the data paths between two clocks 0.179. New board tests
  `feat_dcm_cross` (CLK0, CLK2X, CLKFX, CLKDV and a falling edge into each other, OFFSET on two clocks; its CLKFX ->
  CLK2X path not met on Silinx's routing, as trce finds) and `feat_dcm_phase` (a fixed phase shift, CLK90, CLK180).
  Tests: `test/fpga-timing.test.js` (the arrivals' terms, the six routings against trce's numbers in
  test/fixtures/fpga/trce, the OFFSET lines, the trce report reader and the PCF), `test/open-flow-core.test.js` (a
  DCM's OFFSET in Implement Design, its one expected warning), `test/open-flow.test.js` (the two board tests).
- **The ISE runner as a user of its own (#482):** `scripts/ise-runner/install.sh --system <user> <folder>`
  installs the self-hosted runner as a launchd daemon run by a standard user with no keys or tokens, and its
  on-line window as a daemon of root, whose scripts and Node.js are copied where that user cannot change them
  (`window.mjs` `serviceCommands`: the daemon loaded and unloaded with `launchctl`). The runner's jobs keep
  their temporary files in its folder (`TMPDIR`) and reach Docker Desktop through its socket, which
  `install.sh --docker-acl <user>` opens to that user again each time Docker Desktop makes it. Docker Desktop
  shares only `/Users/Shared/silinx-ise`, so that no container can mount the machine's main user's home; ISE
  work over ssh goes there too (`ssh.remoteDir`). A tag ruleset lets only the admin create, move or delete a
  `v*` tag. Tests: `test/ise-runner.test.js` (both install modes in a scratch folder, with `launchctl` and
  `chown` recorded; the service's commands).
- **core/asm.js split: the generators in core/asm-gen.js (#405):** the VHDL and Verilog generators of an ASM chart move
  to a module of their own; asm.js still exports them. No change in behaviour: the same code generated for every
  chart, language and encoding. Tests: `test/asm-gen.test.js`, the generated code compiled and elaborated with no
  diagnostics and recovered to the same chart.
- **core/asm-from-hdl.js split: the module's analysis in core/asm-hdl-analysis.js (#405):** the recovery of an ASM chart
  from HDL reads the generator's header, the clocked process and the module's state register, states, outputs and logic
  in a module of its own, with the small helpers on the parsers' IR in core/asm-hdl-util.js. No change in behaviour:
  the same recovered charts as before. Tests: `test/asm-hdl-analysis.test.js`.
- **mountAsmEditor split, first part: the inspector in web/js/asm-inspector.js (#405):** the ASM chart editor's
  inspector (the selection's properties and the machine's: its name, clock and reset, initial state, inputs, outputs,
  registers and generics) moves from mountAsmEditor to mountInspector(ctx), called at the same point of the mount; no
  change in behaviour. Tests: `test/ui/asm-inspector.test.js`, the inspector mounted alone.
- **core/asm-from-hdl.js split: the layout in core/asm-layout.js (#405):** the layout of an ASM chart recovered from HDL
  and the reuse of a previous chart's ids, positions and edge points move to a module of their own; asm-from-hdl.js
  still exports asmLayout and nodeSize. No change in behaviour: every HDL file of the repository and the generated
  code of the charts recover to the same result as before. Tests: `test/asm-layout.test.js`.
- **mountAsmEditor split, second part: the drawing of the chart in web/js/asm-render.js (#405):** the ASM chart
  editor's drawing (the ASM blocks, the connections, the boxes with their codes and problems, the status line) and the
  toolbar's state move from mountAsmEditor to mountRender(ctx), called at the same point of the mount; no change in
  behaviour. Tests: `test/ui/asm-render.test.js`, the drawing mounted alone.
- **Small modules and functions, a rule of the project (#405):** CLAUDE.md (and its summary in ONBOARDING.md) asks
  for source files under 1000 lines and functions under 300, one module per concern, and says how to split one (the
  way #405 did); `test/code-size.test.js` enforces it, the files and functions over the limit today listed as
  exceptions that only shrink, and a pull request that changes a source runs it (`scripts/related-tests.mjs`).
- **core/elaborate.js split: the expressions in core/elab-expr.js (#405):** the elaboration of expressions (names and
  hierarchical names, operators typed and sized for Verilog and VHDL, slices, fields, conversions, the built-in
  subprograms, function calls and their overloads, std.textio) moves to a module of its own. No change in behaviour:
  every design of the repository elaborates and simulates as before. Tests: `test/elab-expr.test.js`.
- **mountFsmEditor split, second part: the drawing of the diagram in web/js/fsm-render.js (#405):** the FSM editor's
  geometry of a transition and its drawing of the states and transitions (codes, labels, selection, problems, the
  simulation) move from mountFsmEditor to mountRender(ctx), called at the same point of the mount; no change in
  behaviour. Tests: `test/ui/fsm-render.test.js`, the drawing mounted alone.
- **mountFsmEditor split, first part: the side panel in web/js/fsm-side.js (#405):** the FSM editor's side panel (the
  selected state's or transition's properties and the machine's) moves from mountFsmEditor to mountSide(ctx), called
  at the same point of the mount; no change in behaviour. Tests: `test/ui/fsm-side.test.js`, the panel mounted alone.
- **core/isesch.js split: the export to ISE in core/isesch-export.js (#405):** writing a Silinx schematic as an ISE 14.7
  schematic (its library symbols, the Silinx-only xl_… symbols with their .sym and HDL files, wires, bus taps, net
  names, I/O markers) moves to a module of its own; isesch.js still exports exportIseSch, decodeXlSymbol and
  iseTimestamp. No change in behaviour. Tests: `test/isesch-export.test.js`.
- **core/isesch.js split: importIseSch in three phases (#405):** the import of an ISE schematic reads its netlist
  (core/isesch-nets.js), lays out its blocks and maps its coordinates (core/isesch-geometry.js), places and wires them,
  then assembles and checks the document (core/isesch-assemble.js); importIseSch keeps the placement and calls the
  phases (731 → 277 lines). No change in behaviour. Tests: `test/isesch-import.test.js`.
- **mountISim split, fourth part: the dialogs in web/js/isim-dialogs.js (#405):** the dialog open over the window
  (one at a time: `show`, `closeDialog`) and Force Constant / Force Clock (`forceDialog`) move from mountISim to
  mountDialogs(ctx), called at the same point of the mount; the drawn stimuli's dialogs open through `show`. No
  change in behaviour. Tests: `test/ui/isim-dialogs.test.js`, the dialogs mounted alone.
- **mountISim split, seventh part: the rendering in web/js/isim-draw.js (#405):** the drawing of the names column
  and of the wave window (the ruler, the grid, the waves, the markers, the cursor and their delta) moves from
  mountISim to mountDraw(ctx), called at the same point of the mount; the scheduling of a frame stays in mountISim;
  no change in behaviour. Tests: `test/ui/isim-draw.test.js`, the drawing mounted alone on its own canvases.
- **mountISim split, eighth part: the wave window's pointer and keys in web/js/isim-input.js (#405):** the names
  column's selection, twisties, drag of rows, column widths, double click and menu, the waves' cursor and markers
  (dragged, snapped), two-finger scroll and zoom, wheel and menu, and the keys of both move from mountISim to
  mountInput(ctx), called at the same point of the mount; no change in behaviour. Tests: `test/ui/isim-input.test.js`,
  the wave window's input mounted alone on its own canvases.
- **mountISim split, sixth part: the Objects panel in web/js/isim-objects.js (#405):** the signals of the instance
  selected, their values at the cursor, their selection, their drag into the wave window and their menu move from
  mountISim to mountObjects(ctx), called at the same point of the mount; no change in behaviour. Tests:
  `test/ui/isim-objects.test.js`, the panel mounted alone.
- **mountISim split, ninth part: the rows of the wave window in web/js/isim-rows.js (#405):** the rows model (the
  signals, dividers and groups, the lines shown with a bus's bits, a bit's wave, the value at a time) and the rows'
  commands (Delete, New Group, Ungroup, the dividers, the radix, the rows' menu) move from mountISim to
  mountRows(ctx), called where the rows model was; no change in behaviour. Tests: `test/web-isim-rows.test.js`, the
  rows on the simulator.
- **mountISim split, fifth part: the drawn stimuli in web/js/isim-stimuli.js (#405):** Edit Stimuli (#336), its
  clicks on the inputs' and outputs' cycles, the run of the stimuli and the check of the expected outputs, Fill
  Expected, their drawing over the waves, and the Stimulus Timing and bus value dialogs move from mountISim to
  mountStimuli(ctx), called at the same point of the mount; no change in behaviour. Tests:
  `test/ui/isim-stimuli.test.js`, the stimuli mounted alone.
- **mountISim split, tenth part: the context menu and the instance tree in web/js/isim-menu.js and
  web/js/isim-tree.js (#405):** ISim's context menu (its submenus, closed by a click elsewhere or Escape) and the
  instance tree (the instances and their processes, the selection, their menu, an instance added to the wave window)
  move from mountISim to mountMenu(ctx) and mountTree(ctx), called at the same point of the mount; no change in
  behaviour. Tests: `test/ui/isim-menu.test.js` and `test/ui/isim-tree.test.js`, each mounted alone.
- **mountSchEditor split, fourth part: moving and dragging a wire's segment in web/js/sch-move.js (#405):** the
  schematic editor's drags that change the drawing (the selection moved with its wires stretched, one segment of a
  wire dragged) move from mountSchEditor to mountMove(ctx), called at the same point of the mount, and the geometry of a
  wire (keptEnds, rubber) to plain functions; no change in behaviour. Tests: `test/web-sch-move.test.js`, on real
  documents against their geometry and connectivity.
- **mountSchEditor split, first part: the Properties panel in web/js/sch-props.js (#405):** the schematic editor's
  Properties panel (the sheet's, a symbol's, an I/O marker's, a net name's and a wire's properties, several objects'
  commands, a net connected or renamed by name) moves from mountSchEditor to mountProps(ctx), called at the same point
  of the mount; no change in behaviour. Tests: `test/ui/sch-props.test.js`, the panel mounted alone.
- **mountSchEditor split, third part: the drawing of the document in web/js/sch-render.js (#405):** the schematic
  editor's drawing of the sheet, wires, symbols, I/O markers, net names and unconnected pins, the overlay of the tool in
  use, the toolbar's state and the status line move from mountSchEditor to mountRender(ctx), called at the same point of
  the mount; no change in behaviour. Tests: `test/ui/sch-render.test.js`, the drawing mounted alone.
- **sch-editor.js split, second part: the schematic's drawing in web/js/sch-svg.js (#405):** the SVG of a symbol (its
  body, pins and texts, placed and turned, and its datasheet drawing), of an I/O marker, a wire's hops and its runs in
  line move from sch-editor.js to a module of their own; no change in behaviour. Tests: `test/web-sch-svg.test.js`, the
  drawing against the document's geometry.
- **mountSchEditor split, fifth part: the tools in web/js/sch-tools.js (#405):** the schematic editor's tools (the
  tool in use and its options, a symbol placed, a wire drawn, a net name attached, an I/O marker added, the points a
  wire connects to) move from mountSchEditor to mountTools(ctx), called at the same point of the mount; no change in
  behaviour. Tests: `test/ui/sch-tools.test.js`, the tools mounted alone on a real document.
- **core/schdoc.js split: the HDL generation in core/schdoc-hdl.js (#405):** the HDL generated from a schematic moves
  to a module of its own, generateHdl's per-symbol logic to schdoc-hdl-symbol.js, schdoc-hdl-cases.js and
  schdoc-hdl-more.js (generateHdl 759 → 216 lines; schdoc.js 3105 → 2286); schdoc.js still exports generateHdl and
  the rest. No change in behaviour: every schematic of the repository and one of every symbol kind generate the same
  HDL. Tests: `test/schdoc-hdl.test.js`.
- **core/synth-verilog.js split: toVerilog in parts (#405):** the translator of an elaborated design into Verilog for
  Yosys mounts its values, operators, tables (expressions as tables, ROMs, functions), statements and module from
  modules of their own (core/synth-values.js, synth-operators.js, synth-tables.js, synth-stmts.js, synth-module.js);
  toVerilog 1182 → 176 lines. No change in behaviour: every design of the repository translates to the same text.
  Tests: `test/synth-parts.test.js`.
- **core/vhdl/parser.js split: the expressions in core/vhdl/parse-expr.js (#405):** the VHDL parser's expression
  methods (an expression down to its primaries: names, calls, attributes, aggregates, literals) move to a module of
  their own, assigned to the parser's class, with the operator tables they alone use; the small helpers both use go to
  core/vhdl/nodes.js. No change in behaviour: every VHDL file of the repository, and 1488 damaged copies of them, parse
  to the same result as before. Tests: `test/vhdl-parse-expr.test.js`.
- **A fourth candidate of the balanced mappings: onto LUT4s alone (#370):** at High (and at Normal for a deep design),
  when the depth-oriented mapping is kept, the mapping balanced once more (`DEPTH_ABC2`) is also made onto LUT4s alone
  (`LUT4_ONLY`), beside the three on the wider functions, and kept by the same rule. A round-robin arbiter's ring-shaped
  priority chains take fewer LUTs and slices so: the EPFL arbiter (in the corpus's I/O wrapper, not in the corpus) 2196
  → 2019 LUTs, 1224 → 1010 slices, routed 1.5 % faster; a 24-request arbiter written as gates 99 → 81 slices, 12 %
  faster by the estimate. On the design corpus it is never kept (the same netlists); the 18 designs that make it
  synthesize 6 % longer (one Yosys at a time; beside the other three with the app's 4 workers).
- **The fourth balanced candidate: mfs2 on windows of 5000 nodes (#370):** the mapping balanced once more onto LUT4s alone
  (now `DEPTH_ABC2_LUT4`) ends with ABC's don't-care optimization on windows of up to 5000 nodes (`mfs2 -M 5000`, its
  own limit 300), which reach the terms a round-robin arbiter's balanced chains share: the EPFL arbiter in the corpus's
  I/O wrapper 2019 → 1537 LUTs and 1010 → 769 slices at High, as deep, routed 0.9 % faster by ISE's trce (seeds 1–3).
  The examples and the design corpus keep their netlists and warnings (the candidate is never kept there). The other
  candidates keep mfs2's own windows: on the wider functions with the LUT delays a wider window is slower, and the GIA's
  SOP balancing with it routed the arbiter 4 % slower at Normal.
- **The bit database: every input delay on every pad but the global clock pins (#97):** a pad's delay bits are its own,
  not its neighbours' (every pair of values on the pads of each I/O tile, measured with ISE: `gen-iobdly.mjs`,
  `ana-iobdly.mjs`); IFD_DELAY_VALUE 0-6 and IBUF_DELAY_VALUE 1-12 on every pad, solved with the IOB registers'
  designs; the pads with a dedicated path to a global buffer keep only the delay ISE's map chooses (their other delays
  set bits of the clock tiles, refused). The packer writes the delay ISE chooses, as before.
- **IDDR2 / ODDR2 (#96):** simulation models (core/unisim.js, the compiled engine's core/compiled-prims.js), the packer
  putting them in their pads' IOBs with the settings and pins of ISE's map (DDR_ALIGNMENT NONE; the clock's inverter
  becomes ICLK2INV / OTCLK2INV), the static timing on both clock edges (an IOB's register pins with their own clock and
  edge), the post-translate, post-map and post-place & route models and the test simulators. The placer refuses a DDR
  register and another register of that kind on a different clock in one differential pair. The DDR input registers
  measured with ISE on every pad (measure-iobddr.sh: an earlier design had ISE trim most of them), and the bits of a
  pad's IDDR2 that its neighbour's features held given to their pad (ana-padowner.mjs). Fixtures feat_iob_ddr (VHDL)
  and feat_iob_ddr_v (Verilog).
- **Bidirectional pads (#96):** the packer's IOBUF (output on O1, enable on T1, input to the fabric), the bit database's
  IO:<standard> on every pad of the four devices in LVCMOS33, LVCMOS25 and LVTTL (measured with ISE:
  measure-iobidir.sh), the models and the test simulators. Fixtures feat_iob_bidir and feat_iob_bidir_v.
- **The bit database: the IOB registers' kinds on every pad, the tristate enable from the fabric (#96, #97):** every
  register kind moved through every pad and every output pad a tristate output (research/s3e-bitstream
  `measure-iobrot.sh`: `gen-iobreg.mjs --rot`, `rt`), measured with ISE and solved together with #44's designs written
  again (334 designs per device, 24 random variants each, every bit explained; held-out variants byte-identical to
  ISE's bitgen). The plain input and output registers and `TMUX:T1` are now measured on every pad that has the
  register. New board test `feat_iob_plain`.
- **A 6-input function split on the right input (#54):** the remaps with the wider functions (`LUT4_COSTS`) split a
  6-input function on the input whose two cofactors each depend on 4 inputs at most, when there is one, into two
  LUT4s and a MUXF5 (`LUT6_MAP`, before Yosys's `lut_map.v`, which splits on the last two inputs whatever the
  function: four LUT4s, two MUXF5 and a MUXF6). On the design corpus at High: EPFL bar 1201 → 941 LUTs, 601 → 471
  slices, 10.6 → 9.4 ns; ITC'99 b13, b14, b20 and b21 5 to 7 % smaller; ITC'99 b11 and b15 7 % larger (10 % and 1 %
  faster); the 67 designs 0.5 % fewer LUTs, 0.7 % fewer slices, 0.9 % faster; the examples unchanged. Every netlist
  equal to the RTL. (Merged once as #634 and reverted, #648: it made femtorv32-quark 9 % larger.)
- **The choice of the mapping (#54):** a faster netlist's slices may grow no more in proportion than it is faster
  (femtorv32-quark keeps its netlist), and one faster with no more slices may have up to 20 % more LUTs (10 %
  before: verilog-uart keeps its faster ABC9 netlist).
- **The register file as distributed RAM, measured after #370 (#54):** research/synth-quality/README.md has IWLS'05
  simple_spi's trce (at Normal 3.3 % faster, at High 1.8 % slower in the mean, within the seeds' spread, 11 % fewer
  slices at both) and the T80 at High with #370's `DEPTH_ABC2_LUT4`: 992 slices (XST 1000), trce 21.34 ns (main's
  21.67). Normal's RAM remap stays on `DEPTH_ABC2` (the T80 1009 slices, 20.36 ns; with `DEPTH_ABC2_LUT4` 992 slices,
  4.8 % slower).
- **The memories as distributed RAM at effort Normal (#54):** a design that gets none of High's mappings and whose usual
  run left memories written to in logic makes two more Yosys runs: the memories as RAM16X1D with the usual mapping, and
  that netlist balanced onto LUT4s alone (High's smallest balancing); the same rule as at High chooses (the fewest
  slices, kept by `DEPTH_RULE` and no slower by the estimate). On the design corpus at Normal: the T80 1146 → 1009
  slices, trce 21.67 → 20.36 ns (the netlist High keeps); IWLS'05 simple_spi 89 → 79 slices, 6.16 → 5.94 ns routed; every
  other netlist the same. `lutram: false` leaves it out.
- **The memories as distributed RAM (#54):** Yosys's memory step prices a memory left to logic at a flip-flop per bit
  and leaves out its read multiplexers, so the T80's register file (two arrays of 8 × 8 bits, three read ports) was
  128 flip-flops. With High's mappings, the usual run now counts the memories written to that it left to logic
  (without changing the netlist), and a design with some is synthesized once more with them priced at `LUTRAM_COST`
  (RAM16X1D), High's mappings made from that netlist; of those, the one with the fewest slices that is kept by
  `DEPTH_RULE` and no slower than the netlist chosen by the estimate is kept. On the examples and the design corpus at
  High every netlist is the same but two: the T80 1146 → 1009 slices, 2153 → 1816 LUTs (and 32 RAM16X1D), trce
  21.67 → 20.36 ns (seeds 1 to 3); IWLS'05 simple_spi 89 → 79 slices, 6.16 → 6.07 ns routed. The usual mapping with
  the RAM alone is slower (the read address deeper: the T80 7 % slower by trce), so it is never taken on its own; the
  T80's synthesis at High takes 42 → 80 s. `synthesizeOpen`'s `depth.lutram` says what happened.
- **The wider mapping at effort Normal (#54):** a design that gets none of High's mappings is also mapped with the
  wider functions (`LUT4_COSTS`, the 6-input functions split by `LUT6_MAP`), from the netlist before the LUT mapping,
  and that netlist is kept when better by `DEPTH_RULE` than the one chosen of the others (the critical path's remaps
  included: measured before them, it kept out ITC'99 b08's faster netlist, 11 % slower). On the design corpus at
  Normal 8 designs of 64 change, routed (seeds 1 to 3): EPFL bar 1199 → 941 LUTs, 600 → 471 slices, 10.3 → 8.8 ns;
  ITC'99 b01 20 % faster; IWLS'05 simple_spi 9 % faster for 7 % more slices; verilog-uart 9 % more slices, as fast;
  the 7 timed ones 0.92 times the LUTs, 0.95 times the slices and 0.92 times the period; none slower. The examples
  unchanged. One more Yosys run per design (the corpus's synthesis at Normal 17 % longer, one Yosys at a time);
  `wide: false` leaves it out.
- **Silinx toolchain, XC3S1200E: the long-line splitters (#23):** the router may join a vertical long line's two
  halves across the centre row (CLKH_LL) where that is faster, and bitgen writes the splitter's bit of the right
  direction: a routed design names it `a =- b`, and `pipFeatures` now takes the half of the line the net drives (a
  PIP in any tile, or the net's output pin) from the device description as its input. The placer's delay table
  leaves the splitters out (`knownRouting` `delayPip`): counted there, they made the placements slower. The other
  devices are unchanged. The XC3S1200E's other splitters are left for #709.
- **Device measurements: join tests from IOB inputs and block-RAM outputs (#3):** the joins no slice can drive (the I/O
  and block-RAM tiles' OMUX, the hexes that begin in an I/O tile) are tested from an IOB's input (an IBUF site for an
  input-only pad) or a block RAM's output; round 4 on the XC3S250E: 717 tests, 423 joins and 294 islands, every verdict
  agreeing with the shipped graph (research/s3e-device/README.md).
- **Bit database: the DCMs' output multiplexer measured (#2):** the switches `DCM_<output> -> OMUXk` of the 8 DCM tile
  types, 194 of which were unknown, measured with ISE on designs that route every output of every DCM through each
  line of its multiplexer (`research/s3e-bitstream/gen-dcmomux.mjs`, `measure-dcmomux.sh`: 35 designs, 700 xdl + bitgen
  runs), with the clock tiles' switches those designs route (`measured/learn-16dcm-omux-pips.json`, 250 features). The
  35 designs are byte-identical to ISE's bitgen. Every DCM output of the four devices reaches its four global buffers
  on known switches; the Clocking Wizard's board tests on the XC3S100E now use its top DCM.
- **The multiplier cascade in the Silinx toolchain (#2):** the packer connects BCIN / BCOUT as ISE's map does (a
  cascading multiplier's B left open: ISE's DRC warns otherwise) and refuses BCOUT into anything but the same bit of a
  cascading multiplier's BCIN; the placer puts a chain on consecutive sites of a column (the site above in the routing
  graph on every device) and keeps it there; the router takes the column's dedicated switches. The test simulators
  model B_INPUT and BCOUT. A new open-flow fixture, feat_mult_chain.
- **SRLC16E chains through Q15 in the Silinx toolchain (#2):** the cascade between the two SLICEMs of a CLB (DIG_MUX =
  SHIFTIN, SHIFTOUTUSED, the switch SHIFTOUT2 -> SHIFTIN0) measured with ISE on the four devices (no bits: every bit of
  ISE's bitstreams explained, the switch removed by codewords changes none; the multiplier cascade's bits were known
  already); the packer packs a chain of up to four as ISE's map does (a macro of the two slices, the SHIFTOUT -> SHIFTIN
  net) and refuses a longer chain or Q15 into anything else; a new open-flow fixture, feat_srl_chain.
- **The release zip's budget 40 MB (#884):** the Spartan-6 device descriptions shipped by #723 (4.2 MB zipped)
  took the zip from 31.6 MB to 36.6 MB, over the 32 MB of `test/release/release.test.js`; they stay in the zip,
  and the budget is 40 MB.

## 15.11.3

The simulation models run faster and all of them now run on the Board Emulator's compiled engine. The Silinx
toolchain handles the clocks from DCMs (their timing, their dedicated clock paths, more global clocks), tries
one-hot state machines at Optimization Effort High and balances deep logic once more; Normal is no larger on
mid-depth designs. Toolchain Settings opens at once, and a click on the Start page is no longer lost.

In short:

- **Simulation models faster in the Board Emulator:** the Post-Synthesis model of pong runs about 6 times faster on
  the compiled engine (0.57 to 3.5 million cycles a second), stopwatch's 30 % faster, vga's and blinky's up to 10 %.
  A gate-level model stays below the board's 50 MHz; the status line says what share of real time it runs at.
- **The post-translate, post-map and post-place & route models on the Board Emulator:** they ran on the event-driven
  engine, far too slow for the design's own timing, and blinky stood still; they now run on the compiled engine, as
  the post-synthesis model does.
- **Optimization Effort Normal no larger on mid-depth designs:** a design limited by its logic depth keeps the
  mappings for speed at Normal only when they make it a quarter faster at least, and a design of more than 1500 LUTs
  no longer tries them. ITC'99 b14, b20 and b21 get back their 8 to 11 % fewer slices; the EPFL adder, max and
  priority keep their 3 to 6 times the speed; the synthesis of the large deep designs is 2 to 4 times shorter (EPFL
  voter 68 s to 22).
- **Timing of the clocks from a DCM:** the Silinx toolchain's timing report gives each clock from a DCM the PERIOD
  constraint ISE's trce derives from its input's (CLK2X half of it, CLKDV and CLKFX by their settings, phases), where
  it said that no clock of the design came from the constrained pad; and a path from one clock's flip-flops into
  another's of the same pad is timed against the time between the two clocks' edges, a warning when it is not met.
- **A faster Verilog Post-Synthesis Model:** the Verilog Post-Synthesis Simulation Model is written a wire a bit and
  simulates about four times faster (as fast as the VHDL one).
- **Optimization Effort High, state machines:** with the Silinx toolchain, a state machine of 8 states or more is
  also tried one-hot, as XST does, and kept when the circuit is better (ITC'99 b10 19 % fewer slices and 9 %
  faster). The examples are unchanged.
- **Toolchain Settings** opens at once and says it is detecting the toolchain, instead of appearing seconds later
  over whatever was done meanwhile.
- **The Start page:** a click on a recent project is no longer lost when the page is drawn again at that moment
  (just after a project was closed).
- **More global clocks in the Silinx toolchain:** more than eight global clocks (the left and right sides'
  global buffers too; each line of the clock network then serves one clock per half of the chip).
- **Silinx toolchain: every DCM's clock input from its clock pins:** a DCM's CLKIN now takes the dedicated path
  from any of the clock pins that reach it (the Nexys2's clock socket to a bottom DCM, for instance), as ISE does,
  instead of the general routing with a warning; a clock with no LOC goes on the pin ISE would choose.
- **Faster deep logic:** the Silinx toolchain's synthesis balances the logic of a design limited by its depth
  once more, and keeps that circuit when it is better (the EPFL priority benchmark 19 % faster).

In detail:

- **The quality comparison against ISE: each critical path's logic and routing (#646):** for ISE's flow and for
  Silinx's routing at both Optimization Efforts, `test/designs-corpus/compare-ise.mjs` records, from trce's report
  (the same analyser on both sides), the critical path's levels of logic, its LUT, carry, flip-flop and other
  logic delays and its routing delay (`path` in `ise-comparison.json`); docs/QUALITY.md shows them in a table of
  their own, with what the designs slower than ISE lose in logic and in routing, to tell a synthesis's loss from
  a place and route's. Tests: `test/quality-page.test.js`, on extracts of ISE 14.7's trce reports
  (`test/fixtures/trce`).
- **Pull requests run the test files of the modules they change (#637):** CI runs at a release only (#607), and
  a change merged after one test of its module, run by name, broke the module's other tests (#635). Each pull
  request now runs, on GitHub (`.github/workflows/pr-tests.yml`, three parts of about the same time), the whole
  test file of every module it changes: `scripts/related-tests.mjs` finds the unit test files that import a
  changed file, directly or through a test helper, a changed test file, and the UI test of a changed page
  script, and a test that names a changed file it reads. main requires its check, `related-tests`. Test:
  `test/related-tests.test.js`.
- **The compiled engine on gate-level models (#629):** measured on the examples' Post-Synthesis models (Node, Apple
  silicon, millions of cycles a second, Verilog / VHDL): pong 0.57 / 0.56 to 3.48 / 3.53, stopwatch 39.1 / 38.0 to
  50.4 / 47.5, vga 12.4 / 11.5 to 13.6 / 13.0, blinky 26.9 / 31.1 to 28.9 / 30.8; the behavioural designs unchanged,
  every output the same after a million cycles. Three changes in `core/compiled-sim.js`:
  - a run() above V8's limit of the bytecode it optimizes (60 KB, about 0.66 byte a character of code: pong's model
    106 000 characters, 71 KB) stayed in the interpreter. The code of more than SPLIT (80 000) characters is now
    generated again split: the values are the code's own, not copied into run() and back, and the combinational cells
    are functions of CHUNK (40 000) characters at most inside run() (`chunks`). Below it, as before: split, the smaller
    models ran at half their speed;
  - a constant shifted by an unsigned amount of 5 bits at most (a LUT's INIT read at its inputs) is a shift, without
    the helper `H.shN`: pong 1.6 to 3.1 split, stopwatch 39 to 53, vga 12.3 to 10.3;
  - a gate-level model (`gateLevel`: LUTs or SIMPRIM's X_LUTs) has its constants folded after the flatten (`opt_expr
    -full` in `prepCommands`): vga 10.3 to 13.6, blinky 26 to 29; a behavioural design is slower with it (blinky 118 to
    94), so it is left as it was.
  Tests: `test/compiled-sim.test.js` (`chunks`; split and in one piece the same values, every net, cycle by cycle, on
  pong and the synthesized netlist's primitives; the LUTs without the helper; pong's model split by itself and its
  outputs as in one piece; it fails on the old engine).
- **SIMPRIM primitives on the compiled engine (#627):** the compiled engine had no model of the primitives the
  post-implementation models are made of ("the primitives of a post-implementation netlist cannot be synthesized"),
  so the emulator fell back to the event-driven engine. `core/compiled-prims.js` now has X_LUT1-6, X_FF, X_SFF,
  X_LATCH, X_LATCHE, the buffers and gates, as `core/unisim.js` computes them, and `simprimCell` writes those with
  a UNISIM twin as it (X_RAMB16_S*, X_MULT18X18SIO, X_SRL16E, X_SRLC16E, X_RAMSn / X_RAMDn as RAMnX1S / RAMnX1D,
  X_DCM_SP, X_DCM: their models, a block RAM's contents, a DCM's schedule), the generics that place or time a
  primitive left out (`toVerilog`'s option `simprim`). Not X_OBUFT, X_TRI and the pulls. Tests:
  `test/compiled-sim.test.js` (every logic cell, the SRL16s and distributed RAMs, VHDL and Verilog, against the
  event-driven simulator; X_OBUFT not compiled, with the reason), `test/sim-model-lib.mjs` and `test/timesim-lib.mjs`
  (every example's post-translate, post-map and post-place & route model, cycle by cycle),
  `test/ui/open-toolchain.test.js` (blinky's post-translate model compiled, its LEDs moving).
- **DEEP_RULE: 1500 LUTs at most, a quarter faster (#611):** the weekly comparison found ITC'99 b14 / b20 / b21 9 to
  12 % larger at Normal since 15.11.1 and the corpus's synthesis 44 % longer: at 23 levels they took High's mappings
  (#468) for 0 to 15 % of the estimated critical path. Depth does not tell them from the designs the rule was made for
  (a priority encoder of 20 levels is 2.7 times faster with the mappings); size does (the deep designs that gain
  nothing are of 2000 to 3300 LUTs, those that gain several times of 1100 at most). DEEP_RULE is now `{ levels: 16,
  maxLuts: 1500, gain: 0.25 }`: a smaller deep design's mappings are kept when a quarter faster than Normal's own
  netlist, synthesized too (`r.depth.normal`, `r.depth.high`); the console says when they are not ("not a quarter
  faster … the one mapping kept"). Measured at Normal: b14 707 to 648 slices (13.6 s instead of 10.3), b20 1452 to
  1338 (22.1 to 5.2 s), b21 1529 to 1366 (19.0 to 5.2 s), b22 17.3 to 8.0 s, voter 67.8 to 22.0 s; EPFL max, priority
  and adder as before (research/synth-quality/README.md, "Deep designs of 1500 LUTs at most"). `synthesizeOpen`'s
  `deepRule` and the flow's `spec.deepRule` (for tests). Tests: `test/synth-open.test.js` (deepDesign at 1500 LUTs;
  the mappings kept a quarter faster, dropped when not, Normal's own netlist then; not tried above maxLuts),
  `test/open-flow-core.test.js` (the console's line when they are dropped).
- **A DCM's clocks and the paths between two clocks (#601, a first part):** `clockSources` follows each clock net
  through the global buffers and DCMs (CLKIN, cascades too) to its pad, with its period and first rising edge in the
  pad's periods (CLK0 / 90 / 180 / 270, CLK2X / 2X180, CLKDV, CLKFX / FX180, CLKIN_DIVIDE_BY_2, a FIXED phase
  shift). `checkPeriods` gives a DCM's clock the constraint derived from its pad's PERIOD ("constraint PERIOD 20 ns
  on clk, CLKFX of u_dcm: 13.333 ns"). The analysis keeps the slowest path from each clock's flip-flops, by edge,
  into each other clock's (`cross`); `checkCross` times those of two clocks of one constrained pad against
  `clockRequirement`, from each launching edge to the first capturing edge after it over the clocks' common period
  (CLK0 into CLKFX x 3 / 2: 6.667 ns), and reports the others as unrelated, not timed, as trce does. The flow's
  warnings: a derived constraint not met, and "the paths from clock … to clock … not met". Not done yet, waiting
  for ISE's trce to fit them: a DCM clock's insertion delay (deskewed, close to 0 instead of a pad clock's Tgclk;
  the pads' OFFSET paths of such a clock are still left out) and the clock skew between a DCM's outputs. Tests:
  `test/fpga-timing.test.js` (the sources through two DCMs, the requirements, the derived constraints, the
  report's lines, the analysis's crossing paths), `test/open-flow-core.test.js` (a DCM's CLK0 into CLKFX, met at
  x 3 / 2 and not at x 17 / 16, the warnings).
- **The Post-Synthesis Simulation Model's Verilog a wire a bit (#575):** Yosys's Verilog netlist kept its buses,
  each primitive driving one bit of one, so that a change of one bit woke every primitive reading another bit of
  the bus: the vga example's Verilog model simulated about 4 times slower than its VHDL one. The postsynth step
  now writes the netlist split (`splitnets`, the top's ports still buses, the same cells), and the unit test of
  the vga example on that model is in a file of its own, `test/sim-model-synth-vga.test.js`, which runs alongside
  the other examples'.
- **State machines one-hot at Optimization Effort High (#539):** Yosys's `fsm` refuses every register with an
  initial value, which Silinx's front end gives each one. At High a quiet first run finds the machines of 8 states or
  more kept out for that alone; a design with some is synthesized once more with them extracted and re-encoded
  one-hot, the power-up state kept (the init value written back in the new code), and that netlist is kept when
  better by the same rule as the other mappings (`core/synth-fsm.js`, from #438's research). Smaller machines,
  Normal, and machines whose power-up state cannot be kept are left as they are; a failed run is said and the usual
  netlist kept. On the design corpus one-hot is kept on 4 of the 8 designs concerned (b10 −19 % slices / −9 % period,
  b17 −8 % / −4 %, b11 −3 % / −1 %, b15 +3 % / −4 %), 0.96 of their slices and 0.98 of their period; the examples
  have no such machine (research/synth-quality/README.md, "One-hot at Optimization Effort High"). Tests:
  `test/synth-fsm.test.js`.
- **Tools ▸ Toolchain Settings opens at once (#495):** the dialog waited for the server's detection (which runs
  the device programmers for their versions: seconds on a slow machine) and then came over whatever was done
  meanwhile; on CI it covered the menu bar while the next menu was being opened ("every menu opens…", in Firefox
  and Chrome). It now opens at once with "Detecting the toolchain…", Save disabled, and is filled in when the
  answer comes; closed before it, nothing comes after. The UI test harness names the element over a menu title
  it cannot reach.
- **The Start page kept when it has not changed (#494):** the Start page, drawn again when it is shown (each Close
  Project), was rebuilt by every drawing, and a drawing finishing between the press on a recent project and its
  release lost the click (the UI test of #375 failed so on CI); a drawing now keeps the page when nothing changed,
  and the last drawing started is the one shown (an earlier one finishing later no longer shows the list as it
  was). The UI test presses a recent project, draws the page again, then releases.
- **mountISim split, third part: the simulation control in web/js/isim-run.js (#405):** the queue of commands
  (#215), the run for a time in chunks, Run All, Break, Step and following the end of a run move from mountISim to
  mountRun(ctx), called at the same point of the mount; no change in behaviour. The Break button and closing the
  window go through it (breakCommands, destroy). Tests: `test/web-isim-run.test.js`, on the simulator itself.
- **Silinx toolchain: the side global buffers (#95):** the placer uses the 16 global buffers of the left and
  right sides (their bits measured in #45): a side buffer `BUFGMUX_X0Y(2+k)` / `X3Y(2+k)` sits on line k of
  its half of the chip, its loads in that half; the top / bottom buffer of line k is then kept out of that
  half (its slices, block RAMs and multipliers in the other one), since the centre tile drives line k of a
  quadrant from one of them only. Past eight clocks the side buffers take the others (a board test with
  twelve clocks, feat_clocks12, on the four devices, byte-identical to ISE's bitgen). A clock LOC'd on a
  side GCLK pin still takes a top / bottom buffer through general routing, with a warning: its pad's path
  into the side buffer has database bits ISE does not set (#641). The
  global lines' reach (`clockReach`) no longer passes into general routing through the side clock tiles
  (the even lines' side buffers seemed to reach the other half).
- **Silinx toolchain: a clock pad's global buffer into a DCM's CLKIN (#94):** the placer chooses the DCM's
  site and that buffer together, matched with the DCM's outputs: the clock on the GCLK pin whose buffer's
  line reaches the DCM's CLKIN (B8 -> BUFGMUX_X2Y11 -> the top-left DCM; C8 -> BUFGMUX_X2Y10 on the
  XC3S100E), the outputs on the other buffers. Before, the outputs took the buffers first, and the pad's
  buffer, not reaching the CLKIN, was said in a warning and reached through general routing. A board test
  (feat_dcm_bufgin) on the four devices, checked against ISE.
- **Silinx toolchain: a global buffer's net into a DCM's CLKIN / CLKFB on the global lines (#93):** the
  router's search of a clock net, kept on the global clock network, now takes the last switch off it into
  the DCM's pin (`GCLKn -> DCM_CLKIN -> DCM_CLKIN_PINWIRE`): a cascaded DCM's CLKIN, a DCM's feedback and a
  CLKIN from a pad's buffer no longer go through general routing (`CLKT_TO_OMUX`, hexes and doubles), which
  added clock skew. Checked on the four devices (feat_dcm2, feat_dcm_bufgin); the routing of designs
  without a DCM is unchanged.
- **The bit database: the pads' dedicated paths to every DCM's CLKIN (#92):** the clock tiles' and DCM tiles'
  switches from every clock pad to every DCM of the four devices, measured with ISE (research/s3e-bitstream:
  `dcm-pads.mjs`, `gen-dcmpad.mjs`, `measure-92.sh`; `measured/learn-15dcm-pad-pips.json`), with a few other DCM
  tile switches those designs use. The placer gives a DCM's clock with no LOC the pad ISE's placer gives it; the
  warning "its CLKIN comes from the pad … through general routing" no longer appears on the Spartan-3E boards.
  New board test `feat_dcm_pads` (Nexys2-1200: B8 and the clock socket U9, two DCMs).
- **Logic depth: a third candidate, balanced twice more (#52):** a design whose depth-oriented mapping is kept
  is also mapped with ABC's SOP balancing four times (with the LUT delays), kept as the two balanced once more
  are; routed, EPFL priority 11.20 -> 9.08 ns, EPFL max 29.0 -> 28.1 ns (fewer LUTs and slices), the pedestrian
  crossing at High 8.61 -> 8.16 ns; the other designs as before.

## 15.11.2

The Silinx toolchain now gives the simulation models of every step of the implementation: Post-Translate,
Post-Map and Post-Place & Route with its timing (an SDF of the routed design), and in an ISE mode ISE's
own timing simulation. Its synthesis is two to three times faster, and its circuits smaller and faster
(registers in the IOBs, register replication, timing-aware packing, faster comparators and counters).
The emulated models run on the compiled engine at the board's speed. The timing report adds the pads'
paths and the block RAMs and multipliers. The site and the single file are safer, each release lists
its files' checksums, and an AI assistant can use Silinx over MCP.

In short:

- **A simulation model stays generated:** in the browser edition, a model generated (Emulate or Simulate a
  Post-Synthesis Model, Generate and Emulate) was "not generated yet" again after another run of the flow, such as
  Generate Programming File; it is now kept while its files are in the build. In both editions the board keeps
  running the model with the design's own generics after a later run.
- **The emulated simulation models run at the board's speed:** Emulate Post-Synthesis Model (and the post-translate,
  post-map and post-place & route ones) ran the model made with the test bench's generics, blinky's divider of 2
  instead of 625 000, so at Real time its LEDs changed millions of times a second and nothing could be seen. The
  board now runs the design with its own generics.
- **Stimuli saved reliably:** the stimuli drawn in ISim, clicked quickly on a slow machine, are no longer
  sometimes saved as an older version of themselves.
- **Silinx toolchain, faster comparators and counters:** a carry chain's result read by logic now leaves the
  slice as ISE's map does, through the carry multiplexer's own output, and the chain's stages that only pass
  the carry on are left out (blinky 7.24-7.61 -> 6.43-7.02 ns on the four devices, 3 slices fewer; ISE's own
  flow: 6.7 ns).
- **The Post-Synthesis Model on the Board Emulator's compiled engine:** Emulate Post-Synthesis Model ran the
  netlist on the slow event-driven engine only, so the VGA monitor of the vga example stayed dark ("needs the
  compiled engine"); the compiled engine now runs the model's LUTs, flip-flops and carry chain, and the monitor
  draws its picture.
- **ISE's timing simulation:** in an ISE mode, Simulate Post-Place & Route Model simulates ISE's model with
  its timing, the SDF netgen writes beside it (the wire and gate delays, the clock network, the setup checks).
- **Safari, the single file opened from the disk:** Generate Programming File runs, and the Board Emulator
  runs designs on its compiled engine (at the board's speed) instead of falling back to the event-driven one.
- **Silinx toolchain, a wrong circuit fixed:** the open synthesis's wide-multiplexer mapping could build a circuit
  that does not do what the HDL says (secworks' SHA-256 core); it now maps only complete multiplexer trees.
- **Edit ▸ Undo after a command:** text typed right after a Rename (or another project command), while the
  application still reloads the project behind it, is undone by Edit ▸ Undo before the command.
- **Silinx toolchain, fewer slices and shorter critical paths:** a design with an active-low reset or clock
  enable no longer spends a LUT per flip-flop on its inverter (iwls05-i2c 195 → 136 slices, t80 1296 → 1146),
  and the LUTs of a critical path are packed together (t80 about 4 % faster).
- **Faster writes of one bit chosen by an index:** `x[i] <= c ? v : x[i]` (in VHDL `x(i) <= v when c else x(i)`,
  or an `if` whose `else` writes `x(i) <= x(i)`) is now synthesized as the write `if (c) x[i] <= v`, without reading
  the whole vector to write the same bit back. The design corpus's iwls05-spi is 23 % faster (17.6 ns to 13.6, ISE
  13.0) and 11 % smaller in slices.
- **Faster circuits from register replication:** when a reset or clock enable computed by logic drives many
  flip-flops on the critical path, its LUT is now copied too, as register replication already copied
  flip-flops; the design corpus's vtr-ch-intrinsics is 7 % faster (6.43 ns to 5.99 by ISE's trce). The
  replication's second placement starts from the first one, so it takes a fraction of the time (0.4 s instead
  of 8 s on the T80).
- **Reload FPGA from PROM after Program PROM on a board switched on with an empty PROM:** it failed with the
  jumper hint though the PROM was right; the FPGA is now reset to load from the PROM when the PROM's CONFIG does
  not start it, and a Reload on an erased PROM says so.
- **A security policy and the platform's checks:** `SECURITY.md` says how to report a vulnerability privately,
  what is supported and in scope; CodeQL, a dependency review and a scan of the whole history for private data
  run on GitHub, next to secret scanning and push protection.
- **The timing report names the clock again:** a design whose synthesis keeps ABC9's mapping (effort High; the
  blinky example) had its clock called `$abc$24199$aiger$o11` in the timing report; it is the clock's net again
  (`$iopadmap$clk`), as with the other mappings.
- **Check for updates at start-up, a setting:** Help ▸ Check for Updates at Start-up (on by default) turns the
  start-up check off; nothing is then asked of GitHub until Help ▸ Check for Updates… is used. About says what
  the check reaches.
- **The site and the single file, safer:** they carry a Content-Security-Policy, as the local server's pages
  do; a downloaded Silinx-ISE.html fetches the files of its own version from the site.
- **Checking a download:** each release lists its files' SHA-256 checksums (in its notes and in the file
  `SHA256SUMS`) and GitHub's build provenance attestation of each file, so that a zip or `Silinx-ISE.html`
  got from elsewhere (a course page) can be checked against the release; the README and Getting Started say how.
- **Importing a project in the browser edition:** a zip or bundle whose files or silinx.json point outside the
  project imports what is sound and says, in the console, what was left out.
- **Silinx for an AI assistant (MCP):** the assistant can now make an empty project for a board, choose its
  top module and test bench (with the constraints from the board's pins), and read the synthesis, map and
  place & route reports of a Silinx toolchain run.
- **Static timing of block RAMs and multipliers:** the Silinx toolchain's timing report now gives a design with
  block RAMs or multipliers the period ISE's timing analyzer gives the same routing (hard_prim 7.11 ns by Silinx,
  7.15 by ISE; 8.39 before).
- **Silinx toolchain, Post-Place & Route Simulation Model with timing:** *Generate Post-Place & Route Simulation
  Model* no longer needs Xilinx ISE: the routed design as a model (VHDL and Verilog) and its timing as an SDF
  file; *Simulate Post-Place & Route Model* runs it with the delays, the glitches a gate filters and the setup
  checks (a too fast clock is reported as timing violations). No process needs ISE in the Silinx toolchain now.
- **Silinx toolchain, Post-Translate and Post-Map Simulation Models:** *Generate Post-Translate / Post-Map
  Simulation Model* no longer need Xilinx ISE; *Simulate* and *Emulate Post-Translate / Post-Map Model* run
  the Silinx toolchain's own netlists, in VHDL or Verilog, as ISE's netgen writes them.
- **Silinx toolchain: registers in the IOBs and tristate outputs:** a flip-flop goes into the I/O block of its
  pad when the UCF asks for it (`IOB = TRUE`), and an output that can be high-impedance (`'Z'`) with its
  enable from a register in the IOB builds to a bitstream.
- **Synthesis two to three times faster:** the open synthesis no longer writes Yosys's whole Xilinx cell library
  into every netlist it tries, which took most of its time; the netlists it makes are the same. The examples
  synthesize in 2 to 4 s instead of 7 to 12 at Optimization Effort High, and the netlist file is 15 to 100 times
  smaller.
- **Place & Route on the Nexys2-1200:** a design no longer fails at some placements with a net between
  neighbouring slices left unrouted.
- **Silinx toolchain's timing report: the pads' paths fitted to ISE's timing analyzer:** pad to setup, clock to
  pad and pad to pad now come within about 0.15 ns of trce's, and each input's hold time is given.
- **Silinx toolchain's timing report: the pads' paths and OFFSET constraints:** the report now lists each input's
  pad to setup, each output's clock to pad, the paths from pad to pad and a hold check, as trce's data sheet report
  does, and checks the UCF's `OFFSET = IN … BEFORE` / `OFFSET = OUT … AFTER` constraints (estimates until fitted
  to ISE's timing analyzer).

In detail:

- **The simulation models' example tests and the board's model (#632):** since #622 the flow writes the board's model
  beside a model made with a test bench's generics; `test/sim-model-lib.mjs` expected only the model's two files and
  `test/sim-model.test.js` ran the test bench on the board's model too, whose entity has no generics (the release CI
  failed 15 tests). The tests now list the board's files and run the test bench on the simulation's model only.
- **The netlist's top selected by its attribute (#631):** since #86 each Yosys run writes its top module alone
  (`select -module <top>; write_json -selected`), which left two kinds of top out of the netlist ("netlist: no
  module …" in the Nightly's Yosys test designs): a top with no logic left, which read_verilog marks a black box
  and write_json -selected skips (ifdef_1, specify.v, f6_adder…), and an escaped identifier such as `\1dff`, which
  select -module does not take. The runs now clear the top's black-box mark and select it by its `top` attribute
  (`TOP_ONLY` in core/synth-open.js, in every run's outputs and the coarse run of the carry chains); the netlists
  of the examples and the EPFL adder are the same as before. Test: `test/synth-open.test.js` (an empty top and
  `\1dff`, at Normal and High).
- **CodeQL nightly on main and at a release (#607):** `codeql.yml` runs every night on main when its
  JavaScript changed since the last successful run (`scheduled-changes.yml`; Security ▸ Code scanning tracks the
  default branch's alerts), when a version tag `v*` is pushed and on demand, which always run; not on pull
  requests. Test: `test/ci-workflow.test.js`.
- **The earlier runs' models kept (#625):** each run of the browser flow replaced the project's report with its own,
  which lists only the models that run made, though the earlier ones' files were still in the build; the browser
  edition now keeps the earlier runs' models whose files are there (all of them in a workspace folder). The server
  lists the models by their files in build/, but without what an earlier run said of them: it now lists an earlier
  run's board model (#622) when its file was written with the model, not before it, and the console's message says
  "the test bench's" when the run's name of it is not known. Tests: `test/ui/standalone.test.js` (a model, then
  Generate Programming File, then the model again: no dialog, the board's model), `test/ui/open-toolchain.test.js`
  (the same with another model in between, in the full application).
- **The board's model, with the design's own generics (#622):** a simulation model is synthesized with the generics
  the test bench gives the top (#120), so that the test bench tests what it simulates; the Board Emulator ran that
  same file. When a model has a test bench's generics, the flow now also writes the design's own model beside it,
  `<top>_<suffix>_board.vhd` / `.v`, made of this run's implementation or the last run's (its synthesis in
  build/open, netlist, packing and routing; the model's step alone and no synthesis yet: the design synthesized
  with its own generics too), listed in the report as `simModels.<step>.board`; the emulator runs it and says so in
  the console, the simulation keeps the test bench's. Tests: `test/sim-model.test.js` and
  `test/sim-model-impl.test.js` (the files, the report, the exact log; the board's models simulated with the test
  bench without its generics), `test/timesim-lib.mjs` (every example's post-place & route board model),
  `test/ui/open-toolchain.test.js` (blinky's emulated LEDs on or off, not half lit).
- **CI at a release only (#607):** `.github/workflows/ci.yml` runs when a version tag `v*` is pushed and by
  hand, no longer on pull requests nor on pushes to main; everything runs (the change detection,
  `scripts/ci-changes.mjs`, and the pull requests' dependency review are gone). The Release workflow checks
  that the tagged commit is on main and waits for that CI run (`scripts/wait-for-ci.mjs`: a run of the tag,
  or one of main started by hand). The development build (`dev-release.yml`) and the site's `dev/`
  (`pages.yml`) are published after every push to main; CodeQL runs at a release too (a tag `v*`, no pull
  requests, no pushes to main, no weekly run). The ruleset of main no longer requires `ci-ok`; a change is merged when its
  related tests pass locally (CLAUDE.md, ONBOARDING.md, CONTRIBUTING.md, README.md, SECURITY.md). Tests:
  `test/ci-workflow.test.js`, `test/wait-for-ci.test.js`.
- **The project's saves one at a time, in order (#593):** the project file (`silinx.json`) is saved one save
  after the other, as asked: the stimuli save at each click could reach the server in another order, an older
  project written last (the flaky UI test of ISim's stimuli in the classic interface); and the answer of an
  earlier save no longer replaces changes made while it was on its way. The UI test holds the saves before
  Fill Expected Outputs on their way and checks that Fill's is the one written.
- **Pack: a carry chain's result through XB / YB, the open flows' default (#591):** every XB / YB -> OMUX
  switch is now in the bit database of the four devices (XBUSED / YBUSED set no bits), so the open flows (the
  app's, `open-flow.mjs`, the design corpus's, the synthesis's slice count) pack with `carryOut: 'pin'`, as ISE
  does, instead of one more chain stage whose XOR brings the carry out through X / Y: CIN -> XB is 0.13 ns where
  that stage's CIN -> Y took 0.88. `carryOut: 'xor'` stays as an option.
- **Pack: a carry stage whose select is the constant 1 is left out (#591):** it passes its carry in (O = CI); its
  loads read the carry in instead, unless a sum (XORCY) reads that carry in. blinky's 10-stage comparator against
  a constant ended in six such stages. `stats.carryPass` counts them.
- **Static timing: XB as the F stage's carry (#591):** CIN -> XB and the F side's inputs -> XB are half of CIN -> COUT
  (Tbyp / 2) short of COUT, as the post-place & route model (its SDF) splits the carry chain: the two agree.
- **blinky's test bench: the invert check a clock period after the switch (#591):** the path sw(3) -> logic -> LED pads
  is combinational, about 8-10 ns on the post-place & route model (pads and routing), and half a clock period was not
  always enough: another placement failed it.
- **The design corpus's expectations with this packing (#591):** recorded from a Nightly on the branch (run
  39245068757): itc99-b15 now meets its 20 ns PERIOD (its warning gone), itc99-b04 127 -> 105 slices; over the 62
  designs with a period the geometric mean is -0.5 % (seed 1, within the placement's noise), no design larger.
- **The test of each test file's time passes on Windows (#587):** it gave node --test the reporter by an
  absolute path, which Node's module loader on Windows takes for a URL (the scheme `d:`); it now gives it as
  CI does, relative to the repository.
- **CodeQL's alerts reviewed (#585):** boardConstraints (server/projects.js) joins the project's own paths with
  safeJoin, like the rest of the API (test/server-units.test.js: a constraints path out of the project refused, a
  source out of it skipped); the corpus's cache-path regex can no longer match a text two ways
  (test/designs-corpus.test.js); test/power.test.js compares its sentence as text (a template literal's '\.' was a
  plain '.'). The other alerts are false positives, dismissed with their reason.
- **CI: the unit tests in three parts of about the same time (#573):**
  `node --test --test-shard` split the files by their order, so one part took twice the others (24 min on
  Linux against 12 and 10). `scripts/test-shard.mjs` balances the files by their time measured in CI
  (`test/timings.json`; a file not measured weighs the median), the heaviest first into the lightest part,
  three parts on Linux, macOS and Windows (four were no faster); each Linux part uploads its files' times
  (`scripts/test-times-reporter.mjs`), which `scripts/update-test-timings.mjs <run id>` merges into the
  timings. A CI run's unit tests take about 17 minutes instead of 24. A part takes at least as long as its longest file (sim-model.test.js, about 16 minutes: the vga
  example's post-synthesis simulation alone takes 11). Tests: `test/test-shard.test.js`, `test/ci-workflow.test.js`.
- **Contributing rules (#571):** CLAUDE.md and ONBOARDING.md say how a pull request of another session is
  reviewed (its intent and evidence; line by line only where the risk is), that nothing merges during a release
  until the tag is pushed, and that a scheduled session watches main's CI (a flaky job rerun once, an issue,
  the core session told of real breaks). Sparse checkouts in CI were measured and not taken up: a checkout takes
  about 2 s against 10 to 25 minutes of tests.
- **The Windows unit tests within their 45 minutes again (#566):** the simulation models' tests ran in one
  file, one after another: every example's test bench on both models, in VHDL and in Verilog, about 25
  minutes on Linux and over 45 on Windows, which cancelled the shard. The examples' tests are now in two
  files of their own (test/sim-model-examples.test.js, test/sim-model-vga.test.js) that run alongside the
  others, and each example's synthesis and Translate run once for both models. CI's unit tests print each
  test file's time at the end, the slowest first, and a file over 15 minutes is a warning
  (scripts/test-file-times.mjs).
- **The vga example's model tests lighter (#566):** the post-synthesis models' test benches run with no
  waveforms (vga's took gigabytes, about 13 minutes of a Linux unit shard), and vga's post-place & route test
  runs its VHDL and Verilog models in two files that run alongside each other (19 minutes in one file).
- **The compiled engine's models of a synthesized netlist's primitives (#561):** `core/compiled-prims.js` had
  Verilog models of the buffers, block RAMs, multipliers, SRL16s, distributed RAMs and DCMs, not of the logic a
  Post-Synthesis Simulation Model is made of, so `netlistOf` refused it ("no model of LUT2, LUT4, LUT3, MUXCY,
  XORCY, FDRE") and the emulator fell back to the event-driven engine. Now LUT1-6 (_L, _D) with their INIT, the
  flip-flops FD* and latches LD* (and _1) with their INIT, MUXCY, MUXF5-8, XORCY (_L, _D) and MULT_AND, as
  `core/unisim.js` computes them (FDCP / FDCPE as one asynchronous load, which Yosys makes without a warning);
  the Yosys warnings of the models themselves (their latches) are not the design's and are left out. The model
  runs well below the RTL's speed (vga 8 million cycles a second against 50, pong 1.1 against 24). Tests:
  `test/compiled-sim.test.js` (every primitive, every INIT, in VHDL and in Verilog, against the event-driven
  simulator; a primitive with no model is now PULLUP), `test/sim-model.test.js` (every example's model, VHDL
  and Verilog, on the compiled engine against the event-driven one), `test/vga-example.test.js` (the vga
  model's frames and buttons), `test/ui/open-toolchain.test.js` (Generate and Emulate on the compiled engine;
  the vga example's model draws its picture).
- **ISE's Post-Place & Route Simulation Model with its SDF (#558):** the reports name netgen's
  `<top>_timesim.sdf` beside the model, and Simulate builds its delays and setup checks into the model as it
  does the Silinx toolchain's; `parseSdf` takes the max of each min:typ:max triple (the value ISE's trce
  times), a flip-flop's asynchronous set / reset path is no longer counted with its clock to out twice, and
  ISE's setup checks of both edges of a pin are one.
- **WebKit, a file:// page's workers read Blobs (#556):** in WebKit (Safari), the workers of
  `Silinx-ISE.html` opened from the disk started, but could read no Blob (`NotReadableError`, "Cannot load
  blob:null/…": the page an opaque origin), YoWASP's read of Yosys's resources among them, so that Yosys
  could not start: Generate Programming File failed and the Board Emulator fell back to the event-driven
  engine. In a worker of an opaque origin, `readableBlobs` (core/synth-open.js) replaces Blob by one that
  keeps its bytes and reads them in JavaScript; the Yosys workers and the flow worker install it. WebKit's
  workers start no worker of their own from such a page: the flow worker runs Yosys in its own thread there.
  The compiled engine then runs blinky at the speed it has on the site (about 250 M cycles/s at Max speed).
  The standalone test of the single file in a user's browser runs in Firefox and WebKit too.
- **The private-data history scan reads main's history, not every branch (#555):**
  `scripts/check-private-data.mjs --history` scans the history of HEAD instead of `git log --all`, so an
  open pull request's branch can no longer fail main's CI; the `private-data-history` job now runs on
  pull requests too, on the merge commit's history, so a line added and removed again on a branch is
  found before it reaches main.
- **#545's made-up path in the allow-list (#555):** a made-up home folder in `test/static-editions.test.js`, added and
  removed again on #545's branch, reaches main's history when it merges; the `ALLOW` list names it.
- **Open synthesis: only full multiplexer trees onto MUXF5 / MUXF6 / MUXF7 (#554):** Yosys's muxcover with partial
  trees (some leaves missing) made a wrong netlist of secworks-sha256's core (the design corpus's netlist against
  the RTL: a mismatch of the digest at cycle 99), with the F-multiplexers or 2:1 multiplexers in their place alike;
  `muxcover -nopartial` keeps it right. It showed once the packer's slice count (#528) made the synthesis keep
  that mapping for the design. iwls05-spi keeps its gain (#511): 13.76 ns, 357 slices.
- **Silinx toolchain: a 9-bit word on 2048 x 9 block-RAM ports with no free data bit, written on one port and read on
  the other, goes on 1024 x 18 ports (#550):** the design corpus's verilog-axis-fifo wrote its 9th bit on DIPA and
  left DOPA unread, and ISE's DRC warned (PhysDesignRules:1063, "a dangling output parity pin"; ISE's own map of the
  same memory warns too). When the memory uses half the port's words at most (its address MSB tied to 0 on every
  port), the packer makes each port twice as wide (2048 x 9 -> 1024 x 18, 1024 x 18 -> 512 x 36): the word on data
  bits only (contents, initial and reset values moved with it), the parity inputs tied to 0, the parity outputs
  unused. ISE (check-open-flow.mjs, XC3S250E-CP132): verilog-axis-fifo, feat_bram, feat_const_bram, hard_prim,
  feat_mult, feat_const_mult, feat_constmult and the stopwatch example: DRC 0 errors, 0 warnings, .bit
  byte-identical to ISE's bitgen (CRC on and off).
- **Design corpus: the expectations as main makes them (#537):** the Nightly's designs job failed on itc99-b20 and
  itc99-b21, 8.6 % and 12.3 % more slices. That was not a merge of that night: since #502 (the shift-register map's
  text, which changes the netlist ABC gets even without shift registers), the synthesis keeps the faster mapping
  with the wider functions for them (-9 % critical path), and the expectations had not been recorded for every
  design since. Recorded from a Nightly on main with #554 (run 39199525373): 58 designs' size and speed (most
  smaller or faster: the packer's #527 / #528, the synthesis's #511 / #514 / #523), secworks-aes on the XC3S500E
  instead of the XC3S1200E; no stage, no warning changed otherwise.
- **Nightly: Yosys's test designs in three jobs, a file of many modules in parts (#536):** the second of the two
  jobs ran past its hour on 18 October, `hana/test_intermout.v` (33 top modules, two netlists each) alone on one
  worker at the end and over its 1500 s (985 s the night before; the open synthesis tries more mappings since,
  about 25 % more time on it, and the runner was slower). `test/corpus/run-corpus.mjs` now runs a file of more than
  8 top modules in parts the workers share (every n-th module each; the limit is each part's), a file expected to
  fail as a whole (`hana/hana_vlib.v`) still whole; the nightly and the Yosys update's comparison run it in three
  jobs (`--shard k/3`).
- **Edit ▸ Undo: an edit typed while a project command still runs is the user's (#534):** the text editor tells
  the application whether a change was the user's own (CodeMirror's user-event annotation: typed, pasted,
  undone or redone there, a fix or a snippet) or written by it (a command, an Undo); the application no longer
  guesses from the timing, which left out an edit made while a command's tail still ran and showed the command's
  Undo first (the flaky UI test). The test waits for the edit before reading the menu; a new test types during
  a slow command.
- **Pack: an inverter on a flip-flop's set / reset or clock enable is the slice's SRINV / CEINV (#527):**
  Yosys's extractinv writes one INV per flip-flop, which made a LUT of each; those pins take the inverter's
  input with IS_<pin>_INVERTED toggled, as the clock pins already did (#80), and an inverter that also drives
  logic keeps only those loads.
- **Pack: slices filled by timing (#528):** every connection's criticality is estimated before placement (the
  model of synth-open's criticalDelay); critical units seed first, the units of a critical connection share a
  slice, and a LUT on a critical path no longer fills a slice of unrelated logic. Kept when it costs at most
  2 % more slices (and one) than the packing by nets. ISE's trce on Silinx's routing: verilog-uart 11.70 →
  10.61 ns, t80 22.30 → 21.93 ns.
- **An element written back with its own value as a conditional write (#523):** the synthesis front end
  (`core/synth-verilog.js`) wrote `x[i] <= c ? v : x[i]` as it is, and the read of `x[i]` is a multiplexer of the
  whole vector, only to write the same bit back (iwls05-spi's `data[rx_bit_pos] <= rx_clk ? s_in : data[rx_bit_pos]`,
  a 128:1 multiplexer on its critical path). Now such an assignment (either side the element itself, `sameExpr`:
  the same signals, operators and constants, no calls) is written `if (c) x[i] <= v` (`if (!(c))` for the other
  side), and `x[i] <= x[i]` not at all; VHDL's `when … else` and `if … else` give the same. A nonblocking
  assignment only when no other assignment to the same signal can precede it in its process (`markFirstWrites`;
  there `x[i]` keeps that earlier value): otherwise as before. Measured with ISE's trce on the routed design
  (Normal, XC3S1200E): 17.57 ns to 13.57 (ISE 13.04), 745 LUTs to 672 (ISE 717), 397 slices to 355 (ISE 430).
  Tests: `test/synth-open.test.js` (in Verilog and in VHDL: the conditional writes written, the ones after a
  write to the vector and through a function as before, 82 and 80 LUTs to 71, no warnings, the netlists against
  the RTL).
- **Register replication: the second placement from the first one (#87):** the replicated design is placed
  from the first placement (place.js option `start`, replicate.js `warmStart`: each slice on the slice of its
  cells, a copy on the free slice nearest the centre of its loads, pads, block RAMs and multipliers on their
  sites), then only the placer's greedy pass runs (a window of 3 slices, `WARM`). Placed from scratch, the noise
  of a new placement (±0.5 ns on the T80) hid what the copies gained. epfl-bar keeps its replication (10.98 to
  10.73 ns) with a 0.1 s placement instead of 3 s.
- **Register replication of LUTs (#522):** replicationPlan also takes the LUT1-4 at F / G whose X / Y output
  drives many critical loads (a reset or clock enable computed by logic, on SR / CE pins; REPLICATION.luts),
  its loads in its own slice left on it; replicateFlipFlops is now replicateCells. vtr-ch-intrinsics (Normal,
  XC3S1200E): its reset LUT on 32 FDRE.R copied, 6.43 to 5.99 ns by ISE's trce (ISE 5.06); t80 and
  iwls05-usb-phy unchanged. Not closed: the logic before that LUT is a chain of three LUT2s of fanout ~33 each,
  and a sync reset moved into the D LUTs was 2 % faster on ch-intrinsics but 4 % slower on usb-phy, so it is not
  done (research/s3e-route/README.md).
- **Reload FPGA from PROM on an unconfigured FPGA (#521):** on a Basys2 powered up with an erased Platform Flash,
  Program PROM then Reload failed in the browser edition and the full application alike. With the FPGA
  unconfigured (DONE low), a read of the PROM (the verify) leaves its address counter past the image; CONFIG then
  loads nothing, while the FPGA's JPROGRAM (INIT_B resets the counter) loads it in 1.4 s. `core/xcf.js` and
  `scripts/xcf_prog.py` poll DONE 2.4 s after CONFIG, then say `the FPGA did not start after CONFIG: JPROGRAM (the
  FPGA reset, it loads from the PROM)`, reset the FPGA and poll 5 s more; with still no DONE and the PROM erased
  (its first block all 1s): `the PROM is erased: nothing to load (Program PROM first)` instead of the jumper hint
  (`server/programmer.js` passes it on). The simulated PROM models the address counter (a read moves it unless
  the FPGA's DONE holds it, CONFIG loads from it, JPROGRAM resets it); tests (`test/xcf.test.js`,
  `test/ui/standalone.test.js`) cover the recovery, CONFIG alone on a configured FPGA, and the erased PROM.
  Verified on the board with the full application.
- **Changelog fragments (#519):** a change no longer edits CHANGELOG.md, whose unreleased section made every
  pull request conflict with the others merged before it: it adds its own file, `changes/<issue>-<slug>.md`,
  with its "In short:" item (optional) and its "In detail:" items (changes/README.md); a unit test checks the
  fragments' names and format. A release assembles them into its section, newest issue first, and deletes them
  (`scripts/changelog-release.mjs <version>`, the first of the release steps; `scripts/sync-version.mjs` refuses a
  version while fragments are left). The development build's notes list the fragments not released yet; the
  release notes and Check for Updates' "What's new" read the tagged CHANGELOG.md, as before.
- **The memory test's board emulator measured after its warm-up (#517):** `test/ui/memory.test.js` measured the
  emulator's run and close after 3 warm-up runs, while its page code is still being optimised: measured run by run
  (after the ISim scenario, as in the test), the heap grows 1000, 160 and 76 KB over the first three runs, 17 to 88
  KB a run up to the 11th, then 0 to 5 KB from the 12th on, over 25 runs, in both interfaces: no per-run retention.
  Runs 4 to 8 averaged 42 KB, the 40.5 KB of the CI failure against the 40 KB limit. The scenario now warms up 12
  runs, as ISim's does; the limit is unchanged.
- **The security checks (#498):** `SECURITY.md` (private reporting through GitHub's advisories, answered within
  two weeks and fixed in the next release; the latest release and main supported; the server, browser editions,
  toolchain, workflows, scripts and launchers in scope, Xilinx ISE and an exposed server out; what the project
  does), pointed to from README.md and CONTRIBUTING.md. `.github/workflows/codeql.yml`: CodeQL for JavaScript
  (`build-mode: none`, node_modules and research/ left out) on pull requests, pushes to main and weekly, a
  workflow of its own with a read-only token, `security-events: write` on its job only. In `ci.yml`, two jobs
  that `ci-ok` needs: `private-data-history` (a push to main: `scripts/check-private-data.mjs --history`, whose
  `ALLOW` list now clears XPower's section numbers 3.3.1.x read as addresses in an old `scripts/measure-power.mjs`
  and two commit messages) and `dependency-review` (a pull request: `actions/dependency-review-action`, red from
  moderate severity, no licence list, no comment). The repository's settings, secret scanning, push protection,
  Dependabot alerts and security updates, private vulnerability reporting, were turned on by hand. CLAUDE.md and
  ONBOARDING.md say so. Tests: `test/ci-changes.test.js` (the job list, the two jobs' events and `ci-ok`'s needs;
  `codeql.yml`'s triggers, permissions, pinned actions and exclusions; `test/workflows.test.js` admits GitHub's
  own `github/codeql-action`), `test/private-data.test.js` (the allow-list clears the history's matches and the
  same text elsewhere is still reported), `test/docs.test.js` (the links).
- **ABC9 keeps the clock nets' names (#496):** ABC9 reintegrates every net a clock pin reads as an alias of its
  own, whose name synth_xilinx's clean kept instead of the net's. `abc9RemapCommands` now marks the nets on the
  cells' clock pins (C, CLK, CLKA, CLKB, WCLK, CLKIN) keep before the mapping and unmarks them after it
  (`ABC9_KEEP_CLOCKS`, `ABC9_UNKEEP_CLOCKS`). The seven examples keep the same netlists (blinky's differs only in
  the clock's name); ABC9's candidate netlist of a design may differ by a few LUTs (traffic 115 to 112, pong 299
  to 301), none of the examples' choices changed. The nine corpus designs that keep ABC9's netlist pass as
  before; nandland-spi-vhdl is smaller and faster (33 to 31 slices, 63 to 59 LUTs, 5.64 to 5.36 ns,
  `test/designs-corpus/expected.json`). Test: `test/open-flow-core.test.js` (blinky's clock line and
  the report's clock, which failed on the old code).
- **Web client, one element builder (#489):** the six `h()` builders (`ui.js`'s with `html` and style objects;
  the ASM chart, schematic editor and symbol information's with `text`, `value` and `checked` as properties;
  the Board Emulator's; ISim's positional `h(tag, class, html)`) are replaced by one, `h` of `web/js/dom.js`,
  which `ui.js` re-exports. It takes every key the copies took: `value` and `checked` set both the attribute and
  the property, an event key is a listener only for a function, and children nested in arrays are flattened
  with null / undefined / false left out. ISim's calls are written with the attributes object.
  `test/ui/dom.test.js` checks it in the browser, `test/web-dom.test.js` that no module defines one of its own.
- **Web client, one HTML escape (#489):** the nine local copies of `esc` (three character sets: `&<>` only in
  the HDL editor's hover and the state diagram's highlighter, no `'` in the print page) are replaced by one,
  `esc` of the new side-effect-free `web/js/dom.js`, which escapes `& < > " '` and turns null / undefined into
  nothing; the schematic demo page imports it too. `test/web-dom.test.js` checks it and that no module or
  page of web/ defines an escape of its own.
- **Web client, one HDL highlighter (#489):** the three highlighters of the drawing editors' code panels (the
  ASM chart's and the state diagram's, with one mixed VHDL / Verilog keyword set; the schematic editor's for
  Symbol Information, with its own sets and classes) are replaced by `highlightHdl(code, lang)` of the new
  `web/js/highlight.js`: each language's keywords (the union of the three sets), comments of that language,
  literals, Verilog attributes and state constants, as `tk-*` spans. Symbol Information's HDL now uses the same
  classes (its keywords and comments look as before) and colours a keyword only in its own language.
  `test/web-highlight.test.js` checks it, `test/ui/symbolinfo.test.js` the keywords shown in both languages.
- **Web client, the rename fallback for older servers removed (#489):** `api.renameFile` calls the server's
  rename operation only; the copy, delete and project-list fix-up it did for a server without that operation
  (dead code: client and server ship together) and the error's `unsupported` flag are gone.
  `test/server-api.test.js` checks the client.
- **A setting to turn off the update check at start-up (#488):** Help ▸ Check for Updates at Start-up, a checked
  menu item kept in the browser's storage (`silinx.updateCheckOnStart`): off, `checkUpdatesOnStart` asks
  nothing of api.github.com or raw.githubusercontent.com and writes one line in the console; Help ▸ Check for
  Updates… stays manual. The About dialog's "Update check:" row says what the start-up check contacts (the
  version only, the published site asks only itself) and where it is turned off. Portuguese labels; a UI test in
  both interfaces (off: no request leaves at start-up, the manual check works; on again: the start-up dialog).
- **Static editions: a Content-Security-Policy and versioned remote assets (#487):** `scripts/build-standalone.mjs`
  writes a `<meta>` policy into the single file and the site's pages (`server/csp.js`, shared with the server's
  header: the inline scripts by their hashes, scripts and fetches from the page's origin and the assets' site,
  workers from Blobs; no `frame-ancestors`, which a `<meta>` cannot carry); `scripts/site-analytics.mjs` adds the
  usage counter to it. The assets are versioned: `assets/<version>/` (a development build `dev-<commit>/`) for the
  device descriptions and the bit database, `assets/vendor/yowasp-yosys/<Yosys's version>/` shared; the page
  knows its folder and the single file the site it fetches them from (`--assets-url`). The Pages build keeps the
  last five releases' assets (`--assets-only` from each tag) and the unversioned folders of the files
  downloaded before. The print page no longer has an inline script (the opener prints it): a page written into
  a new window keeps the opener's policy, which runs no inline script.
  A Content-Security-Policy violation now fails any UI test; the standalone tests run in Firefox and WebKit too.
- **Quality workflow, the writing token kept off the self-hosted runner (#486):** `quality.yml` has a read-only
  token at the top and on the self-hosted comparison job; its one writing job (`contents: write`) runs on
  GitHub's runner and pushes the results to the branch `quality-results` only. It now checks the artifact it
  receives from the maintainer's machine before committing it: the two expected files, regular files (no
  symbolic links) under 2 MB, the comparison valid JSON. `test/workflows-permissions.test.js` lists
  `quality.yml` among the read-only workflows and asserts which of its jobs write (the push, and the failure
  report's issue) and the check before the commit.
- **Release checksums and build provenance (#485):** `scripts/package-release.mjs` writes `SHA256SUMS`
  (`scripts/checksums.mjs`, the format of `sha256sum`) next to the files it packages; the Release workflow
  attests the files it lists with `actions/attest-build-provenance` (pinned by commit; the job gains
  `attestations: write` and `id-token: write`), publishes it among the release's files and puts the sums and
  how to check them at the end of the notes (`scripts/release-notes.mjs --sums`). The development build's
  files get their `SHA256SUMS` too. Tests: the checksums against the standard's test vectors and the system's
  `sha256sum` / `shasum`, the release zip's sum, the notes, and the workflow's steps and permissions.
- **The developer demo pages escape what they put into HTML (#484):** `web/schematic-demo.html` escapes the
  instance paths, names and module names of its tree (`esc`, quotes too), and `web/sch-editor-demo.html` builds its
  list of top modules with `new Option(…)`: a Verilog escaped identifier (`\x"><img…>`) was markup in both. A UI
  test loads each page with such names (shown as text; injected an `<img>` before), and a unit test refuses a bare
  `${value}` in the HTML sinks of every page of `web/`.
- **Browser edition: every project path normalised, the imported silinx.json too (#483):** `safePath` /
  `cleanPath` (`web/js/project-store.js`) refuse a path that would leave the project (`..`, absolute, `\\host`,
  `C:\`, a control character) and normalise backslashes and `.` segments; every operation of both stores
  (browser storage, workspace folder) and of the project operations (`put`, `readFile`, `writeFile`,
  `renameFile`, `deleteFile`) goes through it, and silinx.json is never written, renamed or deleted as a project
  file. `normalizeProjectJson` puts an imported description in shape (as `normalizeDoc` does for the drawings):
  `files` an array of `{ path, lang, role }` with clean paths, strings for `top` / `simTop` / `constraints`, the
  known `device` fields, objects for `stimuli` / `impl`. `projectFromZip` and the bundle import skip an entry
  that leaves the project; each dropped item is a warning in the console. Unit tests with hostile inputs; a UI
  test importing such a zip in the browser edition.
- **The ISE runner reached only by the ISE and Quality workflows (#482):** the repository is public, so a
  pull request from a fork could bring a workflow of its own with `runs-on: self-hosted`, one approving
  click away from the maintainer's machine. `scripts/ise-runner/job-started.sh`, the runner's job-started
  hook, fails every job before its first step unless it is `ise.yml` or `quality.yml` of main, on schedule
  or by hand (`GITHUB_WORKFLOW_REF`, `GITHUB_EVENT_NAME`, `GITHUB_REF`, set by the runner). A launchd agent
  (`window.mjs`, every 15 minutes) keeps the runner on line only in the two workflows' window: from 21:15
  every evening until the runner is idle, nothing of theirs is queued and the evening's runs have finished
  (Quality's too on Saturdays), at most 18 hours; `window.sh open` puts it on line for a run by hand. The
  window alone would not protect, as GitHub keeps a job queued for a runner that is off: the hook does.
  `install.sh` sets both up on the machine, out of the repository's checkout. Tests:
  `test/ise-runner.test.js` (the hook's allowed and refused jobs, the window's decisions and its reads of
  GitHub's API, and that no workflow but those two reaches the runner, `runs-on` checked in every job).
- **The self-hosted ISE runner, out of reach of a pull request's code (#482):** the jobs on the runner
  (`ise.yml`, `quality.yml`) check their event as well as their repository and ref: scheduled or by hand,
  on `main` only. `test/workflows.test.js` fails when any workflow could send a pull request's code there:
  a job on `[self-hosted, ise]` in a workflow with another event (`pull_request`, `pull_request_target`,
  `push`, `workflow_call`, `workflow_run`…), without that guard or with a pull request's ref; the runner's
  labels in another form, in a matrix or from an expression; a reusable workflow from another repository.
  The test proves its checker on workflows built to break each rule. `SECURITY.md` says so; the repository
  settings only its administrator can change are a checklist on the issue.
- **The MCP server on real use (#460):** tried with Claude Code on a scratch workspace (registered with
  `claude mcp add`, connected; a full flow on pong for the Nexys2-500 and a new counter project). Fixed:
  `get_report` looked for ISE's files after a Silinx toolchain run and answered "run_process first" for the
  synthesis, map and par reports; it now follows the last run's toolchain (Yosys's statistics,
  `build/open/<top>_stat.txt`; the pack and route summaries from the Design Summary) and says which process
  makes a missing report. New tools: `new_project` (an empty project, for a board and its variant) and
  `set_top` (the top module and / or the test bench, each elaborated first; `update_constraints` writes the
  constraints from the board's pins, as Update Constraints), without which a project the assistant writes
  could not be synthesized. The README says how to give the assistant a workspace of its own.
- **Static timing: the block RAMs' and multipliers' arcs as trce times them (#457):** measured with trce -a -v 1000
  on nine routed designs (hard_prim, feat_bram, feat_const_bram, feat_mult, feat_const_mult, feat_constmult,
  stopwatch and two of multipliers with input registers), they replace the estimates: a block RAM's clock to out
  2.812 ns (was 2.39), its setups the same at every width and write mode; a multiplier's A / B -> P grows with the
  product bit (3.657 ns up to P5, 4.873 from P17; was 4.9 for all), clock to P from its input registers likewise,
  an unregistered input into the product register 3.980 (was 5.2). The block-RAM interconnect wires into and out of
  a block RAM or multiplier get classes of their own (0.24 and 0 ns, were 0.3 both). Against trce on the nine
  designs the analysis is within -5.9 .. +4.2 % (mean |error| 2.6 %; it was -4.6 .. +22.1 %).
  `research/s3e-route/timing-fit.mjs --arcs` lists the block RAMs' and multipliers' arcs too.
- **The design corpus: verilog-axis-fifo's expected period 5.269 -> 6.195 ns (#457):** its critical path ends at its
  block RAM's write enable (Tbwck 1.253 ns by trce, 0.74 estimated); trce gives 5.869 ns on the same routing. The
  other designs with block RAMs or multipliers (fpu-multiplier, neorv32, picorv32, femtorv32-quark, light8080, t80,
  vtr-mkPktMerge) stay within their tolerance.
- **State machines extracted and re-encoded: measured, not changed (#438):** Yosys's `fsm` pass never extracts a
  machine from Silinx's netlists, as `fsm_detect` refuses registers with an initial value. `research/synth-quality/fsm.mjs`
  extracts them anyway with their power-up state kept (the init value written back in the new encoding) and measures
  binary and one-hot against today's synthesis on the examples and the design corpus, and `fsm-ise.mjs` adds XST's
  encodings (README, "State machines"). 44 registers in 24 designs are kept out by their init value alone (traffic
  and pong among the examples). One-hot is no better on average (16 % more flip-flops, as many slices, 1.5 % slower),
  Yosys's binary is worse, and keeping the better of one-hot and today's is worth about 3 % of the slices beyond the
  placement's noise. The open synthesis is unchanged. Tests: `test/synth-fsm.test.js`.
- **app.js split by concern, first part: the console (#405):** the Console / Errors / Warnings tabs (the log, the
  warnings and errors collected from it, the quick fixes of a message, the Clear button) move from `web/js/app.js`
  to `web/js/console.js`, with no change in behaviour; `app.js` imports them and still exports `log` and
  `setDiagnostics`. A unit test (`test/app-modules.test.js`) checks that each part moved out lives in its module
  only and that what `app.js` imports from it is exported there; the next parts of the split add to it.
- **app.js split by concern, sixth part: the Design pane (#405):** the hierarchy of the sources, its selection and keys,
  the context menus of the project, its modules and files, Set as Top Module, removing a source and the project's
  settings saved one at a time move from `web/js/app.js` to `web/js/design.js` (about 330 lines), with no change in
  behaviour; `app.js` drops the imports only the moved code used (and an unused one, `buildSchematic`).
  `test/app-modules.test.js` checks the new module.
- **app.js split by concern, fourth part: the drawings and their HDL (#405):** opening ASM charts, truth tables, state
  diagrams, Petri nets and schematics in their editors, each one's synchronization with the HDL module it is the base
  of, the views of an HDL file, the conversions between them and a drawing whose HDL file name is taken move from
  `web/js/app.js` to `web/js/drawings.js` (about 1050 lines), with no change in behaviour; `project.js` and
  `implement.js` take the names they used from it. `app.js` is down to about 2300 lines.
  `test/app-modules.test.js` checks the new module.
- **app.js split by concern, third part: the implementation processes (#405):** ISE's flow run step by step with
  its live status, Check Constraints and the UCF made from the board, the open synthesis (Yosys in the browser),
  the optional processes (simulation models, post-place & route timing, power, pin back-annotation) and Stop move
  from `web/js/app.js` to `web/js/implement.js` (about 400 lines), with no change in behaviour.
  `test/app-modules.test.js` checks the new module and, for every module split out, that its top level reads
  nothing from `app.js` (they import each other).
- **mountISim split, first part: the Console and command line (#405):** ISim's Console (the simulator's messages,
  the commands' output) and its command line with the commands (run, restart, isim force, wave add, show, zoom,
  marker, help) move from `mountISim` in `web/js/isim.js` to `mountConsole(ctx)` of `web/js/isim-console.js`, called
  where the code was, with no change in behaviour. `test/ui/isim-console.test.js` checks each command, its output and
  errors, the simulator's messages and the history keys, on the console mounted alone.
- **mountISim split, second part: the paths and the forces (#405):** finding a signal or an instance by its path and
  the forces (isim force add / remove, the drawn stimuli's) as pseudo-processes of the simulator move from `mountISim`
  to `mountForces(ctx)` of `web/js/isim-forces.js`, called where the code was, with no change in behaviour.
  `test/web-isim-forces.test.js` checks the paths and the forces on the simulator itself.
- **app.js split by concern, seventh part: the menus and the toolbar (#405):** the menu bar's menus and their commands,
  the toolbar, the command palette, printing the document in front and exporting or importing a project as a zip
  file move from `web/js/app.js` to `web/js/menus.js` (about 220 lines), with no change in behaviour; `app.js` drops
  the imports only they used. `test/app-modules.test.js` checks the new module.
- **app.js split by concern, fifth part: the Processes panel (#405):** the processes of the selected source and what
  runs them, Check Syntax with the elaboration's diagnostics, and the processes' status kept in the build folder move
  from `web/js/app.js` to `web/js/processes.js` (about 360 lines), with no change in behaviour; `project.js`,
  `implement.js` and `drawings.js` import from it what they took from `app.js`. `test/app-modules.test.js` checks the
  new module and that every name imported among `app.js` and its modules is exported where it is taken from.
- **app.js split by concern, second part: the project lifecycle (#405):** opening, closing and reloading a project
  (in call order, the queues of #375 unchanged), the recent projects, the Start page and where the browser edition
  keeps the projects (a workspace folder or the browser's storage) move from `web/js/app.js` to `web/js/project.js`,
  with no change in behaviour. The documents of the project left are closed through a new `closeAllDocs()` of
  `app.js`, which keeps its view state as it was (the flag it sets stays inside `app.js`). `test/app-modules.test.js`
  checks the new module, the names it imports from `app.js`, and that the queues are kept as they were.
- **app.js split by concern, ninth part: renaming (#405):** Rename Symbol (F2) in an HDL editor and renaming a source
  (its file and / or the module it defines, with the instances, the drawings' links and the constraints updated)
  move from `web/js/app.js` to `web/js/rename.js` (about 150 lines), with no change in behaviour.
  `test/app-modules.test.js` checks the new module.
- **app.js split by concern, eighth part: the viewers (#405):** the RTL and technology schematics, the simulation in
  ISim (the behavioural or a netlist model, its test bench and data files) and the Board Emulator move from
  `web/js/app.js` to `web/js/viewers.js` (about 375 lines), with no change in behaviour; `app.js` drops the imports
  only they used. `test/app-modules.test.js` checks the new module and, for `app.js` and every module split out of
  it, that each name of theirs a module uses is imported or defined there.
- **Yosys 0.70's speed, measured again (#377):** with the synthesis and back end of 2026-10-19, the 19 timed designs
  of the Yosys 0.70 update's comparison are as fast with 0.70 as with 0.68 (critical path 0.995, slices 0.974, at
  effort High; 0.926 at Normal), the 3 % of #368 won back by the changes since (the ABC9 candidate, the slices in
  the choice of the mapping, the carry chains and the deep designs at Normal). Pong stays 10 % slower at High
  (11.26 → 12.37 ns): ABC 0.70's own mapping, which none of the open synthesis's mappings brings back
  (research/synth-quality/README.md, "Yosys 0.70 against 0.68, with today's synthesis"). No code changed.
- **Post-Place & Route Simulation Model of the Silinx toolchain, its SDF (#122):** `build/netgen/par/<top>_timesim.vhd`
  (and `.v`) of SIMPRIM primitives with their LOC, and `build/netgen/par/<top>_timesim.sdf`: every connection's
  delay (the static timing's, PORT) and every element's paths (each path through a slice split over its elements,
  their sum the timing's) and setup checks. The model's design is synthesized with the test bench's generics, then
  placed and routed as Place & Route does. Its longest path is the static timing's minimum period; against ISE's
  netgen SDF of the same routed design (blinky), the connections differ by 16 ps on average (rms 69 ps) and the
  minimum period by 1.2 % (`research/s3e-route/sdf-compare.mjs`).
- **SDF annotation in Silinx's simulator (#122):** `core/sdf.js` reads an SDF and builds it into a netlist (VHDL or
  Verilog): transport wire delays, inertial gate delays, clock to out, setup checks (from 100 ns on, as ISE's GSR),
  as two elements of Silinx's SIMPRIM library evaluated natively (X_SDFDLY, X_SDFCHECK), the same results in both
  languages; *Simulate Post-Place & Route Model* applies the model's SDF (the emulator runs
  it without).
- **The examples' test benches for a timing simulation (#122):** blinky checks the inverted LEDs half a clock period
  after the switch (was 1 ns, less than the pads' delays), traffic checks its lamps and display just before each
  rising edge (was the falling edge, before the routed design's outputs settle), vga allows a quarter of a pixel
  between its two sync outputs where it times one from the other (their pads' and routes' delays differ); the same
  results in the RTL.
- **Post-Translate and Post-Map Simulation Models of the Silinx toolchain (#121):** `build/netgen/translate/<top>_translate.vhd`
  and `build/netgen/map/<top>_map.vhd` (and `.v`), of SIMPRIM primitives with the top's ports: the netlist of
  the synthesis as ngdbuild translates it (a MUXCY an X_MUX2, an FDRE an X_SFF…), and the packed design with
  each slice as the elements its configuration uses (LUTs, F5 / FX multiplexers, the carry chain, flip-flops or
  latches with their clock, enable and set / reset inverters), the pads, the global clock buffers, block RAMs,
  multipliers, shift registers, distributed RAMs and DCMs. Synthesized with the generics the test bench gives
  the design, as the post-synthesis model (once for the three models). A LUT's input its equation does not read
  is tied to 0 (the packer wires the carry's data input to such a pin; connected, an unknown value there kept
  vga's model unknown). Every example's test bench passes on both models in both languages, and both models of
  the packer's fixtures and of small designs with shift registers, RAMs, block RAMs, multipliers and latches
  match the netlist's cycle simulator. A Verilog netlist of SIMPRIM primitives now gets Silinx's SIMPRIM models.
- **Placer: the delay table tells a flip-flop's output from a LUT's (#104):** `timing.js delayTable` has a table for
  the connections from a flip-flop (XQ, YQ) and one for the others (`DELAY_KIND`). A flip-flop's output reaches
  every input, its own CLB's too, only through an output multiplexer (OMUX), while X / Y have the CLB's fast
  connects and drive doubles straight from the pin: the one table, the fastest of the four outputs, gave
  0.16 ns for a flip-flop feeding its own CLB, where the route takes 0.45 ns at best, and up to 0.35 ns too
  little near it; the first connection of nearly every critical path was underestimated. On 20 designs of the
  corpus the critical path is 1.1 % shorter (geometric mean, 3 placer seeds each; vtr-ch-intrinsics 6.33 ->
  6.15 ns over 8 seeds), the examples unchanged on the four devices.
- **The packer's IOB registers (#96):** the input, output and output-enable registers go into the IOB of
  their pad on request (the UCF's IOB = TRUE / FALSE on a net or an instance, with wildcards; the HDL's IOB
  attribute; the pack option iobRegs as map's -pr), none by default as ISE's flow runs map -pr off; their
  settings as ISE's map writes them (the bit database's features of #44), the input delay ISE's map chooses
  by itself. OBUFT: the enable on T1 or from its register. The static timing's arcs of the IOB registers
  (estimates until trce's are measured) and the simulation models' flip-flops and X_OBUFT.
- **The placer: an I/O with registers on a pad where they are measured (#96):** the bit database measured each
  register kind on part of the pads (an output-enable register with a reset on about half); a port with IOB
  registers and no LOC is kept on the pads where its settings are measured (`knownRouting(db).allowPad`).
  A LOC'd one is not moved: the bitstream writer refuses the settings its pad lacks and names them, as it
  does a tristate enable from the fabric (TMUX T1, not measured yet). The open-flow board test
  `test/fixtures/open-flow/feat_iobreg` (Basys2-250) and the same design without LOCs on the four devices.
- **The netlist's JSON has the top module alone (#86):** synth_xilinx reads Yosys's Xilinx cell library (about 430
  black boxes of every family), and `write_json` wrote them all into each Yosys run's netlist: 9 to 14 MB whatever
  the design (blinky 13.4 MB, its own module 0.27 MB), about 0.9 s of every run, whose LUT mapping takes 0.15 s.
  Each run now writes the top module alone (`select -module <top>; write_json -selected`); every reader of the
  netlist takes its top module. The depth-oriented mapping, found 2.5 to 3.7 times as long as the first run, now
  costs less than it: most of what every run spent was this writing. Measured on the examples, 18 designs of the
  corpus and the deep EPFL / ITC'99 ones: the same netlists, choices, statistics and warnings; the synthesis 0.32
  times as long on the examples at High, 0.42 on the corpus designs, 0.46 at Normal, 0.52 with the application's 4
  Yosys workers (research/synth-quality/README.md, "Synthesis time: the netlist's JSON"). Test:
  `test/synth-open.test.js` (the JSON's one module at both efforts, which failed on the old code).
- **The router keeps a pin's only entry wire for the pin's net (#82):** a slice's BX / BY input is
  reached through its BX / BY wire only, which also feeds the LUT inputs of the CLB. Another net passing
  through it (`BY1 -> F1_B3`) left the pin's net with no way in; on the XC3S1200E its search then gave up
  (feat_constmult with the clock on N9, seed 3: `…Y<1> -> …BY` not routed). The wire now belongs to the
  pin's net from the first pass, so the routing has no such conflict to negotiate.
- **Static timing: the pads' paths and the hold check fitted to trce (#26):** a global clock reaches every
  flip-flop at once, `SPEED_4.clock.Tgclk` (3.045 ns) after its pad (trce's clock skew is 0.000 ns there; the
  routed clock nets spread 0.4 ns). Setup takes the clock at its earliest; trce's shortest paths are `minScale`
  (0.751) of the model's. `Tiopi` / `Tioop` are 1.253 / 3.257 ns, and the data hold time is -1.018 ns. Each input
  now has its hold, and an asynchronous set / reset is left out of the pads' paths, as trce does. Against trce's
  data sheet of lab11 routed by Silinx and by ISE: rms 0.08-0.19 ns (the estimates were 1.9 ns low on setup and
  1.2 ns high on clock to pad); research/s3e-route/README.md.
- **Static timing: the pads' paths, the hold check and the OFFSET constraints (#26):** `timingGraph().pads()` and
  `analyzeTiming().pads`: an input pad to the setups of each clock's flip-flops less the clock's arrival there (pad to
  setup, what OFFSET IN bounds), the clock's pad through a flip-flop to an output pad (clock to pad, OFFSET OUT), input
  pad to output pad through logic only, and the shortest flip-flop to flip-flop path of each clock (hold, no clock skew
  counted). `clockArrivals`: the clock's pad, the routed nets on the way and the global buffer to each clock pin.
  `parseOffsets` / `checkOffsets`: `OFFSET = IN | OUT n ns BEFORE | AFTER "clk"` on all pads or on a NET (a TIMEGRP's
  is said not analyzed); in timing.txt, the flow's warnings and its report's constraints. The period, the placer and
  the router are unchanged. Estimates (`SPEED_4.clock`): the global buffer's delay, the hold times (0), and the clock
  nets' wires, which the wire fit left out; trce's values of these are still to be measured. An output pad's path ends
  on its O1 pin (was O); an output through its IOB register (#96) has no clock to pad yet, and the IOB registers'
  clocks (ICLK1, OTCLK1) get their arrivals too.
- **Router: the carry's data input on either of a LUT's first two inputs (#25):** a carry stage whose data input
  (CY0F / CY0G) is the LUT's pin 1 or 2 (the packer puts it on pin 1) may now have its net on either of them, as
  the LUT inputs are swapped (ISE's router does the same): the router takes the one its fastest or least
  congested path reaches and the setting follows (`CY0F::F2`). When the other of the two pins is held by a net
  the router does not route, it stays.

## 15.11.1

In short:

- **Wide multiplexers on the FPGA's F-multiplexers:** a multiplexer of 8 inputs or more (a bit chosen from a
  register by an index) is built from LUTs into MUXF5, MUXF6 and MUXF7, as ISE's synthesis does, when that is better,
  at both Optimization Efforts. The design corpus's iwls05-spi is 8 % faster (19.2 ns to 17.6) and 15 % smaller
  in slices.
- **Smaller, faster VHDL indexes by integers:** a vector indexed by an integer of a range (`natural range 0 to 7`,
  a signal or a variable) is now indexed by that integer's own bits, as ISE's synthesis does, instead of a 32-bit
  number whose range Yosys checked with a 32-bit carry chain. The design corpus's itc99-b12 has 24 % fewer slices
  and a shorter critical path.
- **Faster shift registers:** a chain of flip-flops kept in SRL16 shift registers now ends in a flip-flop, as ISE's
  synthesis does: what reads it no longer waits for the SRL16's slow output (3.8 ns). The design corpus's
  iwls05-usb-phy is a third faster (8.2 ns to 5.5, ISE 5.0).
- **Faster circuits at Optimization Effort Normal:** a design limited by its logic depth (a long comparator or
  priority chain, an adder written as gates) now gets the mappings for speed at Normal too, as at High: the EPFL
  adder about 6 times faster, max and priority about 3 times. The other designs keep Normal's single, fast run.
- **The power estimate fitted to the seven examples:** XPower's numbers for the vga example join the six others'
  that the estimated power report is fitted to; the estimate stays within 10 % of XPower's total on all of them.
- **A faster or smaller synthesis at Optimization Effort High:** Silinx also tries Yosys's ABC9 mapper and keeps
  its result when it is better (35 % fewer slices on one of the corpus's I2C cores, up to 15 % faster on others),
  for about a second more of synthesis. The default effort, Normal, is unchanged.
- **DCMs with a reset on the compiled engine:** a design whose DCM is reset by a button or by the design (a
  Clocking Wizard wrapper's RST_IN) runs in the Board Emulator at the board's speed instead of falling back to the
  event-driven engine: while RST is high its clocks stop and LOCKED is low, and they lock again after its release.
- **pong and clock in real time in the Board Emulator:** the compiled engine computes only the logic whose inputs
  changed in a clock cycle, so at Max speed pong runs at about 66 million cycles per second and clock at 88 million
  (were 28 and 23), above the boards' 50 MHz; blinky at 128 million (was 73).
- **Generate and Simulate:** Simulate (or Emulate) a Post-Synthesis Model that is not generated yet offers to
  generate it and goes on with the simulation (or the emulator) once it is; a model that needs Xilinx ISE says so.
- **Adders written as gates on the carry chain at the default effort:** at Optimization Effort Normal, an adder
  written gate by gate that is not deep enough for the mappings for speed (a schematic of 8 to 32 full adders) is
  also mapped onto the FPGA's carry chain when that is faster. Other designs synthesize as before.
- **The single-file edition works again from the disk:** Silinx-ISE.html opened from a folder (file://) in Chrome
  ran neither Generate Programming File ("the Silinx toolchain could not start in this browser: the worker failed")
  nor the Board Emulator's compiled engine: the workers it embeds now start the way such a page allows.
- **Smaller circuits at Optimization Effort High:** the choice between the synthesis's mappings weighs the slices,
  the FPGA's own measure, and not only the LUTs (SHA-1 core 42 % fewer slices, SipHash 23 %, a USB PHY 18 %).
- **Program FPGA from the browser in fewer USB round trips:** Configure Target Device ▸ Program FPGA over
  WebUSB sends its JTAG steps as a few streams (the PROM's way) instead of a command a step; the console says how
  long the bitstream took, how many times INIT and DONE were polled and where the USB time went.
- **Hardening after a security audit:** the audit found no serious flaw; the quick fixes it recommended are in
  (no install scripts on the ISE machine, the launchers' installation, a server token kept out of addresses, the
  `.xise` export of a top module with an odd name).
- **An unreachable ssh host fails at once:** an ISE build on an ssh host that refuses the connection ends with
  ssh's error instead of running forever.
- **The Post-Synthesis Simulation Model without a false warning:** generating it no longer warns of "cells with no
  simulation model" (`$SPECIFY2`) on designs such as blinky.

In detail:

- **Wide multiplexers onto MUXF5 / MUXF6 / MUXF7 (#511):** the usual run of the open synthesis (4-input-LUT
  families) counts, on a copy of the netlist before the LUT mapping, the trees of 8 and 16 inputs among its 2:1
  multiplexers (Yosys's `muxcover -mux8 -mux16 -nodecode`); with some, the design is mapped again from that
  netlist with each tree as 2:1 multiplexers on its first select (left to ABC, with the logic before them) into
  MUXF5, MUXF6 and MUXF7 (`MUXF_MAP`, `muxfRemapCommands`), the rest onto LUT4s alone, and that netlist is kept
  when better by DEPTH_RULE (r.depth.muxf), at Normal and High. Onto LUT4s alone a 128:1 multiplexer was 6 or 7
  LUTs deep; the mapping with the wider functions did no better (ABC sees a 4:1 multiplexer as one 6-input LUT).
  Not for every design: a tree whose first select comes late is slower (the T80, 15 % by the estimate), and the
  F-multiplexers' slices hold no other flip-flop (registers straight from the inputs: more slices); 4:1 trees
  too made serv 29 % slower by the estimate. Found comparing the critical paths with ISE's on the design corpus:
  iwls05-spi's went through 8 LUTs after the bit index, where XST has a LUT, MUXF5 … MUXF8. Measured with ISE's
  trce on the routed design (Normal, XC3S1200E): 19.18 ns to 17.57 (ISE 13.04), 886 LUTs to 745 (ISE 717), 465
  slices to 397 (ISE 430); the rest of its path is two carry chains and a net of fanout 120. Of the examples,
  traffic and pong have trees, not kept (one Yosys run more at Normal). Tests: `test/synth-open.test.js` (the
  script and the count; register files of 32 and 128 bits in Verilog and VHDL: kept at both efforts, faster and
  smaller, equal to the RTL; registers straight from the inputs: not kept; a counter: one run).
- **An index of a narrow integer in its own bits (#514):** the synthesis front end (`core/synth-verilog.js`) wrote
  every integer signal or variable narrower than 32 bits back as 32 signed bits where it is read, and so as a bit
  index (`nl[$signed(32'(data_out))]`, `data_out` a `natural range 3 downto 0`); for a signed index of a write
  Yosys builds 32-bit range logic, an `$alu` whose sign decides the write: itc99-b12's critical path, a 32-bit
  carry chain and 5 LUTs (22 levels; ISE: 3 LUTs and a MUXF5). Now (`posExpr`, `narrowInt`) such an integer
  whose every value is an index of the vector gives the position in its own bits and the vector's, with sized
  literals (`ra[(3'd7 - k)]`, `so[(j - 3'd2)]`, `ss[(e + 4'd2)]` for a range below 0; Yosys negates a size
  cast there at 33 bits), exact as the position is in 0 … w-1; one from 0 up indexing a vector from 0 is the
  index itself (a value above the vector: a write does nothing, as before); any other index as before. A
  register of 4 bits written at a `natural range 3 downto 0`: 23 LUTs and 65 carry cells before, 4 and 5 now.
  Tests: `test/synth-open.test.js` (a signal, a variable, an ascending vector, vectors from 2 and from -2, an
  integer below 0: the Verilog written, the cells (the same as the Verilog design's), no warnings, the netlists
  against the RTL).
- **A fixed-length shift register's last stage in a flip-flop (#502):** the open synthesis's SRL map
  (`core/synth-open.js` SRL_MAP) makes a chain of n stages (xilinx_srl -fixed) SRL16Es of n - 1 stages and a
  flip-flop (FDRE, FDRE_1 on the falling edge; its INIT the last stage's), as XST does: an SRL16E's clock-to-out
  (Treg) is 3.76 ns on the -4, a flip-flop's 0.59. One flip-flop more per chain; the variable-tap ones (#5) are
  as they were. Found comparing the critical paths with ISE's on the design corpus (trce of both routings):
  iwls05-usb-phy's started at an SRL16 driving a clock enable of fanout 29. Measured with ISE's trce on the
  routed designs: usb-phy 8.17 ns to 5.47 (ISE 4.99); serv 13.39 to 13.38; iwls05-ss-pcm 4.87 to 5.26, its
  critical path not through a shift register (a placement that differs: a clock enable's net 1.4 ns long).
  Tests: `test/synth-open.test.js` (3, 16, 17 and 33 stages, initial values, an enable, the falling edge, two
  taps: the cells, no warnings, the netlists against the RTL), the cell counts of `test/synth-quality.test.js`,
  `test/synth-abc9.test.js` and the falling-edge shift register's BUFG (#219).
- **Program FPGA from the browser in JTAG streams (#508):** `programAdept` (`core/adept.js`) shifted every IR
  device by device and polled the FPGA's status with four commands each: 88 Adept commands, 240 USB transfers for
  an XC3S250E bitstream on the simulated board, each transfer ~1 ms or more over WebUSB. Its steps are now
  composed into `JtagSeq` streams, as the Platform Flash's (#274, #289): JPROGRAM, CFG_IN and the first INIT read
  one PUT_TMS_TDI_BITS; the bitstream one PUT_TDI_BITS with the TAP moves before it and JSTART, its 12 clocks in
  Run-Test/Idle and the first DONE read after it; each further poll one stream: 26 commands, 77 transfers (the
  chain's scan most of them). The console adds `  bitstream: N bits in T s (M MHz TCK over USB); INIT after N
  polls, DONE after N` and the PROM's `  USB:` line (`usbLine` and `secs` moved to `core/adept.js`), and
  `DONE: the FPGA is configured in T s`. The tests assert the commands of a program in their order and the
  transfers; the standalone UI test the console lines. Not measured on a board yet: the bitstream's own clocks
  (~1.4 Mbit at the port's ~2 MHz, about 0.7 s on a Basys2) are unchanged, the new line shows that rate.
- **CI: the Windows unit tests (#505):** since #413 their step passes the shard as `$SHARD`, which Windows'
  default shell (PowerShell) does not expand (`--test-shard=/3`): the step runs in bash; a test checks every
  `run:` script that reads an environment variable says `shell: bash` in a job that runs on Windows.
- **Optimization Effort Normal maps a deep design for speed (#468):** `synthesizeOpen` at Normal makes the usual
  mapping first, then measures its logic levels (`logicLevels`: the LUTs and MUXF5s of the deepest path); a design
  of more than 16 levels and 5000 LUTs at most (`DEEP_RULE`, `deepDesign`) also gets High's mappings (the wider and
  the depth-oriented ones, the carry chains of logic written as gates), each kept by DEPTH_RULE as at High, the first
  run's netlist reused. Chosen on the design corpus at both efforts (`research/synth-quality/effort-normal.mjs`,
  README "Effort Normal"): the EPFL adder (85 levels) 98 ns estimated to 17, max 66 to 23, priority 51 to 17; ten
  designs take the mappings, for 6 to 56 s more; the larger deep ones (log2, multiplier), which High makes no
  faster, and the 55 of 16 levels or fewer keep one run; the seven examples are 1 to 8 levels deep. By the quality
  page's High column, Normal's critical path against ISE's goes from +20 % to about +9 %. The console says so
  ("Optimization Effort Normal: 17 levels of logic: the mappings for speed tried too"), and Process Properties'
  note on the efforts (in Portuguese too). Tests: `test/synth-open.test.js` (logicLevels and deepDesign on netlists
  by hand; a comparator chain of 48 bits at Normal mapped for speed, faster, the same function; the 24-bit one
  still one run), `test/open-flow-core.test.js` (the console's lines), the UI test of the efforts.
- **Hardening after a security audit (#479):** the self-hosted runner's jobs (`ise.yml`, `quality.yml`) install
  without the dependencies' install scripts (`NPM_CONFIG_IGNORE_SCRIPTS` in the job's environment: no script of npm
  runs on that machine); `yosys-update-report.mjs versions` refuses a value from the pull request's files that is not
  a version (the shell would otherwise be given it); the launchers install with `npm ci --omit=dev --ignore-scripts`
  (the lock file kept); the web client's unused `exportXiseUrl`, which put the server token in a query string, is
  gone (the token travels in `X-Silinx-Token` only); `server/xise.js` escapes the top module's name in its regular
  expressions (a name such as `a(b` made the `.xise` export fail with 500). Tests: `test/workflows-permissions.test.js`
  (every workflow's permissions, the runner's install), `test/launchers.test.js`, `test/yosys-update.test.js` (the
  refused versions), `test/server-api.test.js` (no token in an address), `test/server-units.test.js` (the export
  with `a(b`, `m.v`).
- **XPower's numbers for the vga example (#463):** `scripts/measure-power.mjs --only <examples>` measures just those
  examples with ISE and XPower and merges their runs into `test/fixtures/power/xpower-examples.json` (the others
  kept, in the examples' and the devices' order). vga on the four devices (XPower: 36.18, 55.14, 83.62 and 161.42 mW)
  makes the fixture's 28 runs, and `core/power.js`'s coefficients are their fit again (the nets' power now mostly by
  their loads: 7.400e-6 mW per Mtr/s and 1.037e-4 per load, from 1.545e-4 and 4.348e-5); the estimates move by at
  most 0.1 point (`--compare`: totals within −9.9 % to +8.9 % of XPower's, vga's within −2.8 % to −0.8 %). Tests:
  `test/power.test.js` (the 28 runs of the seven examples, the merge of `--only`'s runs, vga in the estimate's
  comparison with XPower).
- **ABC9 as a candidate of the open synthesis (#377):** at Optimization Effort High, the design is also mapped onto
  LUT4s alone with ABC9 (`synth_xilinx -abc9 -nowidelut`, from the same netlist as the other mappings), and that
  netlist is kept when better by the depth rule. It is kept on 4 of the 21 designs of the measurement and on 9 of
  the 67 corpus designs: iwls05-i2c 35 % fewer slices and 2 % faster, verilog-uart 4.6 % faster by ISE's trce,
  epfl-voter and itc99-b09 4 and 15 % faster. On average the period is 0.4 % shorter and the slices 2.6 % fewer,
  for about 1 s more synthesis per design with 4 Yosys at a time
  (the Node app; 3 s with one at a time). Effort Normal, the default, is unchanged.
  research/synth-quality/README.md, "ABC9 as a candidate".
- **CI: one required check, `ci-ok`, and documentation changes tested (#409):** CI runs on every push and pull
  request (no `paths-ignore`): a change of documentation only (`scripts/ci-changes.mjs`, a `changes` job) runs the
  unit tests alone, the documentation's tests among them (`.github/workflows/docs.yml` folded in), the long jobs only
  for code; CHANGELOG.md, THIRD-PARTY-NOTICES.md and `.github/release-notes.md`, which a build reads, count as code.
  A final `ci-ok` job needs every job and is red when one failed or was cancelled: main's ruleset requires it alone,
  instead of five check names typed by hand. A docs-only pull request can now be merged, and a docs-only push to main
  refreshes the development build and `dev/`. Tests: `test/ci-changes.test.js`.
- **main: a linear history, rebase merging only (#410):** main's ruleset requires a linear history and the
  repository allows only rebase merging (no merge commits, no squash), as CLAUDE.md asked; the required check is
  not strict (a pull request need not be up to date with main to merge, which several sessions merging each hour
  would make a queue of rebases).
- **Compiled simulator: a DCM whose RST the design drives (#465):** it was a CompileError ("has its RST driven by
  the design: not compiled yet"). Each DCM clocked by the main clock now has a schedule of its own and its own count
  of cycles (with the DCMs it clocks), as core/unisim.js's model: RST high clears the count and LOCKED and sets the
  outputs to 0 at once, dropping their edges still to come; from the first rising edge with RST low the lock
  sequence starts again (LOCKED and CLK0 at the 3rd edge, CLK2X / CLKDV / CLKFX from the 4th). A reset is seen at
  the end of its time, after the DCM's edges at that time, as the event-driven simulator orders them. Still not
  compiled: a cascaded DCM with its RST driven, a DCM clocked by one whose RST is driven, and the CLK90 / CLK270 of a
  DCM whose RST is driven. Checked cycle by cycle against the event-driven simulator, internal nets included, in
  VHDL (two DCMs, reset from an input and from a register, at six sets of frequencies) and Verilog (a reset from a
  register of another DCM's clock), with resets at random cycles.
- **The compiled simulator evaluates what changed (#464):** pong and clock ran at 28 and 23 million cycles per
  second in the Board Emulator's worker, below the boards' 50 MHz, most of their logic computed again every cycle
  though it depends on registers that change once a second or less. `core/compiled-sim.js` now writes the
  combinational cells in segments, each evaluated only when a value it reads changed since its last evaluation (a
  flip-flop or memory of the main clock, or a *cut*: a 1-bit comparison of several bits, a counter's end, which
  changes much less often than the counter). The changes are bits of dirty words, set when the main clock's edge
  commits and by the cuts; a flip-flop whose next value comes only from guarded segments is not even compared until
  one of them ran. Which segments to guard is chosen at compile time from a 20 000-cycle profile of the code (the
  rate of each value's changes) by a dynamic programme that minimises the cells evaluated per cycle, guards
  counted; a design where guards would save less than half the cells (vga_bars: its pixel counters change every
  other cycle) keeps the unguarded code. The board watch's counts (LED levels, digit segments) are added up in
  runs, when a watched value changes, instead of in every cycle; a bit repeated by a sign extension is one
  expression. Every result is the same: Max speed in the worker, 4 s each, headless Chrome, before → after: blinky
  73 → 128, pong 28 → 66, clock 23.5 → 88, vga_bars 114 → 114 million cycles per second. Tests:
  `test/compiled-sim.test.js` (the seven examples and thirteen test designs with and without the activity, with its
  most and its fewest guards: every value, memory, count and edge equal after runs of up to 4000 cycles; the
  segments' choice).
- **A simulation model not generated yet: "Generate and Simulate" (#490):** Simulate / Emulate Post-Synthesis,
  Post-Translate, Post-Map or Post-Place & Route Model, and View Technology Schematic (ISE), with no such model of the
  top yet showed only a message; their dialog now has "Generate and Simulate" ("Generate and Emulate", "Generate and
  Show"), which runs "Generate … Simulation Model" as the Processes pane does (the steps before it included, the
  browser edition's flow in the browser), then the simulation, the emulator or the schematic when it ends without
  errors; Cancel / Escape run nothing. The button is offered only when the process can run here (the Post-Synthesis
  model: the Silinx toolchain or an available ISE; the later ones: ISE), otherwise the dialog says why. The emulator's
  model menu lists a model generated this way, and a dialog's button pressed twice closes it once (`web/js/ui.js`).
  Tests: `test/ui/open-toolchain.test.js` and `test/ui/standalone.test.js` (both interfaces, Portuguese).
- **The self-hosted runner without a writing token (#412):** the weekly comparison with ISE (`quality.yml`) runs on
  the ISE machine with a read-only token and `persist-credentials: false` (it runs third-party code: the corpus's
  fetch, `npm ci`), as the ISE tests (`ise.yml`) now do too; its results go out as the artifact `quality-results`,
  and a `publish` job on GitHub's runner, the only one with `contents: write`, commits them to the branch
  `quality-results` when the comparison passed. Tests: `test/workflows.test.js`.
- **Workflows: explicit permissions, values through `env:` (#413):** `ci.yml` and `nightly.yml` say
  `permissions: contents: read` (every workflow now states its token's permissions instead of relying on the
  repository's default), and no `run:` script has a `${{ }}` expression in it any more: the Yosys versions read
  from a pull request's `package.json` (`yosys-update.yml`), the nightly's module count typed by hand, the
  release tag and the shard numbers go in through `env:`. Tests: `test/workflows.test.js`, `test/yosys-update.test.js`,
  `test/corpus-runner.test.js`.
- **CI: the Playwright browsers cached, a time limit for every job (#415):** the `browsers` and `webkit-standalone`
  jobs restore `~/.cache/ms-playwright` for the version of Playwright installed (`playwright-core`'s package.json),
  so only the system's libraries are installed each run; every job of every workflow has its `timeout-minutes`
  (a hang no longer lasts GitHub's 360 minutes; unit 45, ui 20, browsers and webkit-standalone 25, os 30, the
  change checks and failure reports 10). Tests: `test/workflows.test.js`.
- **Releases without running the tests again (#416):** the Release workflow no longer runs `npm test` (12-29
  minutes) on a commit main's CI tests anyway: it waits for the CI run of the tagged commit on main
  (`scripts/wait-for-ci.mjs`) and fails when that run did not pass, or when the commit has no CI run on main; the
  single-file edition, the packages and the release zip's test are kept. Tests: `test/wait-for-ci.test.js`.
- **Workflows: one setup action, the scheduled workflows' common jobs reused (#417):** the 16 jobs that set up
  Node.js 22 and run `npm ci` use the repository's composite action `.github/actions/setup` (without npm's cache on
  the self-hosted runner); the nightly, ISE and Quality workflows call `scheduled-changes.yml` (whether main changed
  since their last successful run) and `failure-report.yml` (a failed job as an issue) instead of a copy each.
  ONBOARDING.md: the building blocks, and scheduled runs starting hours late. Tests: `test/workflows.test.js`,
  `test/changed-since-last-run.test.js`, `test/report-failure.test.js`.
- **Workflows: the actions pinned by commit (#414):** every action (`actions/checkout`, `setup-node`, `cache`,
  `upload-artifact`, `download-artifact`, `upload-pages-artifact`, `deploy-pages`) is used at its release's full
  commit SHA with the version in a comment, the same everywhere; Dependabot's weekly GitHub Actions pull request
  moves them, the setup action's included (`directories`). Tests: `test/workflows.test.js`, `test/yosys-update.test.js`.
- **The standalone edition's workers from file:// (#512):** the single file starts its embedded workers (the
  Silinx toolchain's, `web/js/open-flow-browser.js` getWorker; the compiled engine's, `web/js/emulator.js`) from
  a Blob as classic workers, no longer module ones: a page opened from file:// is an opaque origin, from which
  Chrome refuses a module Blob worker (`onerror` with no message) but starts a classic one; the bundles have no
  imports. The Yosys workers started from a Blob (`core/synth-open.js` yosysWorkerSource: the flow worker's
  pool, the emulator's Yosys from the site) load Yosys's bundle by a dynamic import and are classic workers
  too (the flow worker fell back to its own thread; the emulator's had no fallback). The served editions
  (`/js/open-flow-worker.js`, `/js/emulator-worker.js`, `/js/yosys-worker.js`) stay module workers. The UI
  tests had not seen it: the harness runs Chrome with `--allow-file-access-from-files`, under which both
  kinds start; `setupUi({ fileAccess: false })` now launches a Chrome without it. Tests:
  `test/ui/standalone.test.js` (a second Chrome without the flag: the single file from file:// runs Generate
  Programming File to the bitstream and the Board Emulator's compiled engine in their workers; fails on the
  old code with the error above), `test/yosys-client.test.js` (the Blob worker's code: a dynamic import, no
  static one).
- **Adders' carry chains at effort Normal (#477, #377):** a design written as gates (#77's GATE_MIN) that is not deep
  (#468 gives a deep one, the EPFL adder, High's mappings) gets its first Yosys run up to `synth_xilinx`'s fine step
  beside the usual run, at once; only adders' chains (half of their bits with a sum at least:
  `rewriteCarryChains(…, { adders: true })`, which now also returns each chain's sums) of `ADDER_MIN` (8) bits at
  least are rewritten, and the netlist with them is mapped and kept when the depth rule prefers it (a 16-bit ripple
  adder written as gates: 16 MUXCY). Measured on the EPFL designs with every chain tried: the adder's 98.2 → 17.4 ns,
  sin's, multiplier's and log2's chains slower, refused by the rule; the voter's (4–8 bits) not tried. A design without
  such chains keeps the usual run's netlist. Tests: `test/carry-chain.test.js` (a 16-bit ripple adder on the chain at
  Normal in three runs, the 32-bit AND-inverter graph by #468's mappings; a comparator, an adder shorter than ADDER_MIN
  and a counter as before; each chain's sums).
- **Slices in the choice between mappings (#478, #377):** every candidate of effort High (the wider functions, the
  depth-oriented mappings, the LUT delays, ABC9, the carry chains) is packed as the open flow packs it
  (`sliceCount`, core/fpga/pack.js), and `keepDepth` / `keepSecond` bound the slices as the LUTs; 5 % fewer slices
  (at most 1 % slower, at most 10 % more LUTs) is smaller as 5 % fewer LUTs is, and fewer LUTs only with no more
  slices. On 22 corpus designs: slices −5.3 % and period −0.4 % (geometric means): secworks-sha1 1879 → 1091 slices
  (17.5 → 16.7 ns), secworks-siphash 913 → 707 (14.1 → 15.0 ns), iwls05-usb-phy 82 → 67, vtr-stereovision3 112 → 99,
  verilog-i2c-master 126 → 115; epfl-cavlc 139 → 143 (`test/designs-corpus/expected.json` updated). The #14 test
  compares its VHDL and Verilog netlists without ABC9 (kept on both, 2 LUTs apart); blinky keeps ABC9's netlist
  (its instances 67 / 203 / 51 cells, `test/techview.test.js`), whose clock net loses its name (#496: the open-flow
  tests read the clock line whatever its name). Tests: `test/synth-open.test.js` (the rule with slices, `sliceCount`).
- **ISE over ssh: the upload no longer hangs when ssh exits (#499):** `runPipe` (`server/ise.js`) piped `tar` into
  `ssh` in Node; when ssh exited without reading (connection refused, a key BatchMode rejects), the pipe stopped
  reading tar's output, and tar, its output larger than the pipe buffers, blocked forever, so the job never ended.
  Whether tar had finished first was a race, which made the ssh-mode test of `test/ise-flow.test.js` fail now and
  then on CI. When the reading side exits, the writer's remaining output is now drained and dropped, so it ends with
  its own exit code and the job fails with ssh's (255). Test: `test/ise-flow.test.js` (an unreachable host with a
  4 MB build directory: the job fails within 5 s, with no warnings).
- **Post-synthesis model: the top module's cells (#493):** `postSynthesisModels` (core/sim-model.js) looked for cells
  with no simulation model in the netlist's first module, which is one of the library cells Yosys reads with their
  timing arcs (Yosys's models of the Xilinx primitives, their `$specify2` cells), so Generate Post-Synthesis
  Simulation Model warned of `$SPECIFY2` on blinky and others. It reads the top module now. Tests:
  `test/sim-model.test.js` (a netlist whose first module is a library cell: no cell without a model; a cell of the
  top's still said; the flow's postsynth step with no warning), the UI tests of #120 and #490
  (`test/ui/open-toolchain.test.js`, `test/ui/standalone.test.js`): no warning, "completed successfully".
- **`dist/` no longer ignored by git (#524):** the single-file edition (`Silinx-ISE.html`) is built by the Release,
  dev-release and Pages workflows; a copy under `dist/` in a checkout is only a local build, and now shows in
  `git status` instead of lingering beside the sources. The build still writes to `dist/`.

## 15.11.0

A new minor version: the Board Emulator at the board's real speed, with a VGA monitor and a seventh example;
an estimated power report and an MCP server; truth tables with `/` and XOR forms; the editor on CodeMirror 6; a
safer local server; and every dependency at its latest version.

In short:

- **The Board Emulator at the board's speed:** a design that can be compiled runs on a new engine, its netlist as
  JavaScript, tens of millions of clock cycles per second: counters, dividers and debouncers at their real values,
  the clock in real time. The event-driven simulation stays, for debugging (X values, the design's messages) and for
  the designs that cannot be compiled (an Engine selector in the emulator's toolbar).
- **Xilinx primitives on the compiled engine:** designs with block RAMs, multipliers, shift registers, distributed
  RAMs, clock multiplexers and DCMs (a 25 MHz clock for VGA from the board's 50 MHz) run in the Board Emulator at the
  board's speed instead of falling back to the event-driven engine.
- **The Board Emulator in a thread of its own:** the compiled engine runs in a Web Worker, so the emulator no longer
  slows the page: buttons, menus and editors answer at once while a design runs at full speed (a little faster too).
- **A VGA monitor in the Board Emulator:** a design on the board's VGA connector shows its 640×480 picture, as a
  monitor finds it in the sync pulses, with the measured timing and what is not 640×480 at 60 Hz (e.g. a pixel
  clock of 50 MHz, a sync pulse of the wrong polarity).
- **A seventh example, vga:** a picture on a VGA monitor, in VHDL: colour bars in a white frame and a square the
  four buttons move (SW0: faster), 640×480 at 60 Hz from the 50 MHz clock; the Board Emulator's VGA monitor draws
  it.
- **A manual clock in the emulator:** a design clocked by a push button (its clock port on a button in the UCF)
  works in the board emulator: the flip-flops change only when the button is pressed.
- **Truth tables: / as NOT, and XOR forms:** the expressions are written with `/` as NOT by default (`/a·b + c`,
  `/(a + b)`), the other notations still selectable; beside the minimal SOP and POS, the *XOR form* when it is
  simpler (`a ⊕ b ⊕ c`, `a·b + c·(a ⊕ b)`, `/(a1 ⊕ b1)·/(a0 ⊕ b0)`), which the table's HDL module can use.
- **The HDL editor on CodeMirror 6:** the same editor (highlighting, completion and templates, the live errors with
  their quick fixes, Rename Symbol, folding), on the maintained version of CodeMirror; its Find and Go to Line in
  Portuguese too.
- **The power of a design without ISE:** *Generate Text Power Report* works with the Silinx toolchain: an estimate
  of the design's power (static and dynamic, by clocks, logic, signals and I/Os), said to be one, within 10 % of
  Xilinx XPower's total on the examples.
- **Silinx for an AI assistant:** `silinx-ise mcp` is an MCP server: Claude Desktop, Claude Code or another MCP client
  opens the workspace's projects, edits them, checks their syntax, simulates them, runs the processes and reads the
  reports, with the same results as the interface.
- **Against the best-known results:** the quality page compares Silinx's synthesis on the EPFL benchmarks with the
  records of the EPFL logic synthesis competition (LUT-6 count and depth).
- **A larger design corpus:** 29 more designs through the whole toolchain every night: the rest of the EPFL
  benchmarks that fit (sin, voter, multiplier, log2), the ITC'99 benchmarks in VHDL (b01–b15, b17, b20–b22) and
  six IWLS'05 OpenCores cores.
- **A safer local server:** reached from other computers (`serve --host 0.0.0.0`) it asks for a token it prints at
  start-up; its pages run only their own scripts; a project zip that grows too large is refused; the adepttool
  installer installs one checked version.
- **Stop works in the browser edition:** Stop during Generate Programming File stops the Silinx toolchain at once,
  and nothing of the stopped run is kept.
- **Up to date:** Yosys 0.70, CodeMirror 6, Express 5 and elkjs 0.12; Dependabot proposes new versions every
  week, and a Yosys update comes with a table comparing the circuits it makes.
- **Measured against ISE at both efforts:** at *Optimization Effort High* the Silinx toolchain's circuits are 20 %
  smaller than ISE's in LUTs and 5 % slower (critical path, 40 designs timed by ISE's own analyser); at the default,
  *Normal*, 16 % smaller and 20 % slower ([docs/QUALITY.md](docs/QUALITY.md)).

In detail:

- **Static timing: the SLICEM's shift registers and RAMs as trce times them (#443):** their delays were
  estimates. Now they are trce's (`research/s3e-route/timing-fit.mjs --arcs`, a new mode that reads the logic
  delays of trce's paths): a shift register's clock to X / Y is 3.762 ns (was 2.0), the data, address and
  enable setups per pin are trce's, and a RAM's output now changes after a write (1.956 ns, 2.349 through F5;
  no path started there before). On the same routed designs, Silinx's period is now within 2 % of trce's:
  the dram fixture 3.636 ns (trce 3.614; no timed path before), feat_srl 5.246 (5.344; was 4.214), and the
  corpus's iwls05-usb-phy 8.212 (8.118; was 6.450). The design corpus's five designs with distributed RAMs or
  shift registers have new expected periods.
- **Static timing: half-cycle paths (#442):** a path between a clock's two edges (a rising-edge flip-flop into a
  falling-edge SRL16E_1, RAM or `*_1` flip-flop, or back) has half a period. Silinx's timing analysis now limits
  the clock's period to twice its delay, as ISE's trce does, where it gave the delay itself (too short a period).
  The srl fixture's rise→fall path: 3.124 ns (trce 3.042). No example, open-flow fixture or corpus design has its
  critical path between the two edges, so their periods are unchanged.
- **VGA monitor: "No signal" over the picture (#453):** the label stayed visible, faintly, over a picture: its
  `display: flex` overrode the `hidden` attribute; hidden now means not shown, and the UI test checks what is laid
  out, not only the attribute.
- **Design corpus: a design's own clock period (#440):** iwls05-spi's critical path (19.9 ns on macOS, 20.08 on
  GitHub's Linux runner) sat on the corpus's fixed PERIOD of 20 ns, so its "PERIOD not met" warning came and went
  from one machine to the other and failed the Nightly; a design may now give its own `periodNs` in the manifest
  (iwls05-spi: 25 ns).
- **An MCP server (#134):** `silinx-ise mcp` (server/mcp.js) speaks the Model Context Protocol (JSON-RPC 2.0 over
  stdin / stdout, versions 2025-06-18, 2025-03-26 and 2024-11-05, no new dependency) with ten tools: list_examples,
  new_project_from_example (another board's pins too), list_projects, project_info, read_file, write_file (a new
  HDL file added to the project), check_syntax (the application's: the design checks of core/lint.js and the
  drawings' HDL included), simulate (the test bench's messages, its signals' last changes, by path through the
  instances), run_process (synthesize, implement, bitstream, timing, power, pins; the Silinx toolchain or ISE) and
  get_report (the Design Summary, the reports of build/). Each answers in text and as structured JSON. It calls the
  server's own functions: the implementation's start and the reports are now startImplementation and
  projectReports of server/impl-routes.js, which the HTTP routes call too. Every path stays inside its project
  (symbolic links followed), Silinx's own files (silinx.json, build/) are not written, programming a board is not a
  tool, and the ISE machine's address is replaced in every result. test/mcp.test.js speaks to it over stdio.
- **Shift registers of 17 to 32 stages in one SLICEM (#24):** the two SRL16Es of such a chain are cascaded in one
  SLICEM: G holds the first 16 stages, and F takes G's last stage through SHIFTIN (`DIF_MUX = SHIFTIN`), instead
  of a net through general routing and BX. The srl fixture's 20-stage chain converts with ISE to the same .bit.
  Chains longer than 32 still connect their SLICEMs through general routing (the bits between slices are #2).
- **Clock inverters in the slices' CLKINV (#80):** the synthesis writes an inverted clock or latch gate
  (IS_C_INVERTED / IS_G_INVERTED) as one INV per cell, which the packer made a LUT on the clock: ISE's DRC
  reported a "Gated clock" for each (21 on vtr-ch-intrinsics, whose latches have inverted gates). An inverter that
  drives only clock pins of flip-flops and latches is now their slices' CLKINV, as XST maps it.
  vtr-ch-intrinsics has the one gated clock that ISE's own implementation also reports (a latch's gate from logic),
  157 LUTs instead of 178 and 6.3 ns instead of 7.6. The examples and the open flow's fixtures are byte-identical
  with ISE's bitgen as before.
- **Check for Updates opens its dialog at once (#441):** it opened only once the site's version.json had answered
  (in the application, the Silinx server's answer, slow on a busy machine), so it came over whatever was done
  meanwhile: the menus UI test failed at the next item (Help ▸ Tell Us Who You Are…). The dialog now opens with
  "Checking for a newer version…" and is filled in when the answer comes (Reload added when the site serves another
  page); a regression test holds version.json back.
- **An estimated power report in the Silinx toolchain (#123):** the `xpwr` step of the flow (core/open-flow-core.js,
  after Place & Route and its timing) writes `build/<top>.pwr` from core/power.js: the device's static power (the
  supplies' quiescent currents XPower 14.7 gives each device, Vccint's with the junction temperature) and the routed
  design's dynamic power, its clocks (the global buffers and nets, by the slices they reach), LUTs, flip-flops,
  nets (by fanout) and I/Os (by Vcco) at the switching rates of XPower's vectorless estimate: the flip-flops at
  12.5 % of their clock, then as their inputs and enables make them change (an enable folded into a LUT too), the
  LUTs by their function (transition density), the inputs at 12.5 % of the fastest clock, the clocks from the
  UCF's PERIOD (50 MHz, with a warning, without one). The report is laid out as XPower's and says it is an
  estimate; its summary reads as XPower's (server/ise.js parsePwr). The coefficients are fitted to XPower's reports of the six
  examples on the four devices (`scripts/measure-power.mjs`, which runs ISE and keeps only the numbers:
  test/fixtures/power/xpower-examples.json); there the estimate's total is within 10 % of XPower's (its static
  power within 0.1 %, its dynamic power 0.35 to 2.2 times XPower's: the netlists of Yosys and XST differ),
  `scripts/measure-power.mjs --compare` and test/power.test.js. The process is no longer disabled in the Silinx
  toolchain.
- **The / notation in the Truth Table editor (#434):** `formatExpr` (core/logic.js) writes NOT as a prefix `/`
  (`slash`: `/a·b + c`, `/(a + b)`; `slash-compact`: `/ab + c`, where `/ab` is `/a·b` as the input reads it), the
  editor's default for the minimal SOP / POS, the XOR form, the essential prime implicants and the K-map's groups
  (which now follow the notation chosen, the compact ones too). Every expression shown reads back as the same
  expression. The input reads Verilog's XNOR `~^` / `^~`; VHDL / Verilog write the XNOR of two operands as
  `xnor` / `~^`. The generated SOP / POS modules are unchanged.
- **XOR / XNOR forms (#435):** `minimizeXor` finds the cheapest sum of products of literals and XOR / XNOR factors
  (`a·b + c·(a ⊕ b)`), or a variable XOR one (`a ⊕ b·c`), of a column of 2–6 inputs: every such term enumerated
  (7107 for 6 inputs), the ones within the 1s and don't cares kept, the cheapest cover by branch and bound
  (a node budget: a few ms, at most about 40 ms for random 6-input functions). Cost: literals, then two-input
  operators (NOT free). It is shown as *XOR form* only when cheaper than both the minimal SOP and POS, and it is
  checked on the whole table. *HDL logic ▸ XOR form (when simpler)* (`form: 'xor'`, default off) writes it into
  the table's module (`xor` / `xnor`, `^` / `~^`), the minimal SOP for the other outputs.
- **ABC9 on the Spartan-3E, measured (#369):** `research/synth-quality/abc9.mjs` maps the examples and the design
  corpus's representative subset with Yosys's `synth_xilinx -abc9` (and `-nowidelut`) after the open synthesis's own
  steps, simulates each netlist against the RTL and takes it through the open back end. With LUTs up to 8 inputs
  ABC9 is 28 % larger in slices and slower than the open synthesis; onto LUT4s alone it has 6 % more LUTs, 2.6 %
  fewer slices and a 2.7 % shorter period than the usual mapping (geometric means): a candidate for the mappings
  the open synthesis tries (#377), not wired in; ISE's trce on four designs agrees with Silinx's STA within 3 %.
  research/synth-quality/README.md, "ABC9".
- **The comparison with ISE at both Optimization Efforts (#377):** the weekly comparison
  (test/designs-corpus/compare-ise.mjs, docs/QUALITY.md) builds Silinx at Normal, the app's default, and at High
  (the mappings for speed too), ISE at its default, and the page shows both. Since #282 made Normal the default,
  the comparison had measured Normal only while the corpus's nightly run measures High: most of the speed loss it
  showed (+14 % → +22 % against ISE: epfl-priority 43.0 ns, epfl-max 61.7 ns) is Normal's, High giving 11.1 and
  28.5 ns (ISE: 20.8 and 25.7, trce).
- **The Board Emulator's compiled engine in a Web Worker (#427):** `core/emulate-remote.js` runs the CompiledBoard
  and what the board shows (its outputs, the LCD's controller) at one end of a message port (`hostBoard`:
  `web/js/emulator-worker.js`, started from its file on the local server and from its embedded text, a Blob, in
  the single-file edition and the browser edition), the page's `RemoteBoard` at the other: the same interface, the
  last state cached (time, outputs, LCD, Watch values, log, the VGA picture copied and transferred 30 times a second
  at most), the runs asynchronous (n cycles, or as many as fit in a 14 ms budget at Max speed), one at a time, the
  next asked for before the page draws the last. Input bits go as masks, the rotary knob's detents as data scheduled
  from the worker's own time (the page's may be a run behind), Power cycle and the power switch forget the run in
  flight. The page still compiles the design (what cannot be compiled falls back to the event-driven engine at
  once); with no worker the same host runs on the page's thread. The worker ends with the emulator's document
  (`test/ui/memory.test.js`). At Max speed: blinky 70 → 76 million cycles a second, pong 27 → 27–29, clock 23 → 24,
  the VGA colour bars 106 → 111; the page's 10 ms timer from 20 ms late to under 1 ms.
- **A seventh example, vga (#450):** `examples/vga`, in VHDL for the Basys2 / Nexys2: the timing of 640×480 at 60 Hz
  in its own entity (`vga_sync.vhd`: a 25 MHz pixel enable from the 50 MHz clock, the pixel counters, the sync
  pulses), and in `vga.vhd` what each pixel shows (eight colour bars inside a white frame, a 32×32 square in the bars'
  opposite colours, moved once a frame by the buttons held, 1 or 4 pixels with SW0), registered with the pulses. Its
  test bench looks at the signals as a monitor would: the line of 800 pixels and its 96-pixel HSYNC, the frame of 525
  lines and its 2-line VSYNC, both active low and where the mode has them around the picture, the colours of the
  bars, the frame, the square and the blanking, the next frame 525 lines after, the square moved with SW0 on (two
  frames, about 26 ms simulated: the example tests give its test bench 30 ms). The examples' list (CLAUDE.md,
  `core/examples.js`, the docs, the Start page) and every test that lists the examples have it. Tests: `test/vga-example.test.js` (on the Board Emulator of the
  Basys2-250 and the Nexys2-1200: whole frames against the picture computed from the example's description, 640×480
  at 60 Hz with no warnings, the square moved by the buttons and stopped at the corner), the examples' tests (no
  warnings, the test bench, the UCF, the Silinx toolchain on the four devices), its synthesis' size budget, the
  quick fixes' list of where none puts a removed `end process;` back; `test/compiled-emulate.test.js` and
  `test/emulate-remote.test.js` compare its VGA pins (it lights no LED).
- **The vga example with no ISE warning (#461):** ISE's map warned `Pack:266` (the function generator
  `timing/active_and…` failed to merge with an F5 multiplexer) on every device: `vga_sync`'s `active` was a
  comparison of both counters (`hc < 640 and vc < 480`), and the AND of two flags in its place still warned
  (`timing/active1`). It is now a flip-flop of its own, set from the flags' next values (each set when its counter
  starts again, cleared after its last visible value): the same timing, simulation and picture. The open synthesis:
  166 LUTs, 0 MUXF, 154 slices (163, 0, 157).
- **The Board Emulator's VGA monitor (#420, part 3 of #102):** when the UCF wires the board's VGA connector (its
  colour widths from the board: 3-3-2 bits on the Basys2 and the Nexys2, 1-1-1 on the Starter Kit), the compiled
  code keeps a monitor (`core/compiled-sim.js` VGA_CODE): a line from each leading edge of HSYNC (its active level
  the shorter one), the pixel clock from the line's period (800 pixels), the column from the time since the edge,
  the row from the time since VSYNC's, into a 640×480 picture the emulator draws (30 pictures a second at most) with
  the palette of the board's resistor ladders (`core/vga.js`). It reports the line period, the frame rate, the
  lines a frame, the sync pulses' widths and polarities, a warning for each outside the mode, and "No signal"
  without sync pulses. About 66 million cycles a second with the monitor on a colour-bar design. With the
  event-driven engine, the monitor says it needs the compiled one. Tests: `test/vga.test.js` (whole frames against
  the picture the test design defines; the exact warnings of active-high pulses, a 50 MHz pixel clock, 515 lines,
  a short HSYNC; no signal; the boards' widths and palettes) and a UI test.
- **The Board Emulator on the compiled simulator (#418, part 2 of #102):** `core/emulate-compiled.js` runs the
  design compiled (#384) behind the part of the event-driven simulator the emulator uses (the board's time, Step,
  Power cycle, the forced inputs, the rotary knob's scheduled steps, the Watch box's values by their names in the
  netlist). The LEDs, the 7-segment digits and the LCD come from counters the compiled code keeps cycle by cycle
  (half a cycle on each side of the clock's edge, as the event-driven simulator's time), decided by the same code
  as with the waveforms (`core/emulate.js` boardOutputs split into measuring and deciding; boardOutputsFromCounts,
  lcdFeedEdges): window by window the same as the event-driven engine on the examples, the Starter Kit's LCD and
  knob, a manual clock (#347). The emulator's document opens at once and compiles the design (Yosys in the page, or
  from the site's assets in the browser edition), then runs it on the compiled engine at Real time (a new clock rate) with the timing
  generics' real values, else on the event-driven one with the reason (a combinational loop, an inout port, a
  primitive with no model, more than one board clock); the Engine selector switches between them.
- **The Xilinx primitives in the compiled simulator (#429):** `core/compiled-prims.js` has synthesizable Verilog models,
  flattened into the design by Yosys, that compute what Silinx's UNISIM models compute: RAMB16_Sw and RAMB16_Sm_Sn at
  every width (512 words of 32 data and 4 parity bits that every port reads and writes its part of; INIT, SRVAL,
  WRITE_MODE; on one edge both ports' reads, then the writes, port B's last; the INIT_xx / INITP_xx contents written
  into the netlist's memories after Yosys, ten times faster than through Yosys), MULT18X18 / MULT18X18S /
  MULT18X18SIO (AREG, BREG, PREG, the B cascade), SRL16 / SRL16E / SRLC16 / SRLC16E and their `_1`, RAM16/32/64X1S
  and X1D (and `_1`), BUFGMUX, BUFGCE (and `_1`), GND / VCC. A DCM_SP or DCM is a schedule of its outputs' edges in
  the main clock's cycles (`dcmSchedule`): CLK0 / 90 / 180 / 270, CLK2X / 2X180, CLKDV, CLKFX / FX180, LOCKED,
  CLKIN_DIVIDE_BY_2, as `core/unisim.js` (LOCKED and CLK0 at the 3rd input edge, the synthesized clocks from the
  4th), a cycle's edges steps of the compiled loop in time order, cascaded DCMs; the falling edges of a clock only
  rising-edge flip-flops use are not steps (about 26 million cycles a second for a VGA design on CLKFX = 25 MHz). The
  main clock is the DCM's input; a DCM with its RST driven by the design is not compiled yet. Checked cycle by cycle
  against the event-driven simulator: the open synthesis's test designs bram_prim, bufgmux and dcm (compiled now),
  the 14 open-flow board tests with primitives, test designs in VHDL and Verilog (every block RAM write mode at mixed
  widths, the multipliers, every SRL16 and distributed RAM, a DCM's every output on both edges at six frequencies,
  two cascaded DCMs with a BUFGMUX); a DCM's edges against their arithmetic; what the emulator counts with a DCM
  (once a main clock cycle); a UI test. `toVerilog` also returns its primitive instances (`instances`); the
  comparison applies the inputs and compares the outputs 40 ps before the clock's rising edge (after a DCM's edges
  within the cycle, which the event-driven model rounds down to the ps).
- **A DCM's CLK180 at the lock (#429):** `core/unisim.js` gave CLK180 a pulse of no width when the DCM locked (it
  followed CLK0 one delta late): a flip-flop on CLK180 counted one edge too many. It now comes from CLK0's own
  sources, in the same delta.
- **An input forced between runs (#431):** after a clock edge with nothing else changing, a signal forced from
  outside the run (the Board Emulator's switches, the live schematic) changed in the delta of the clock's edge, so a
  native SRL16 / distributed RAM on a falling edge (SRLC16E_1, RAM16X1S_1…) woken by its address took it for a new
  edge: it shifted, or wrote, again. The first force after the simulator settles now starts a new delta
  (`core/simulator.js`).
- **ONBOARDING.md:** a guide for a new developer or Claude Code session: the setup, how several
  sessions work on the repository together, a map of the code, the product's rules and the lessons
  learnt; CLAUDE.md points to it, and the documentation test checks its paths and links (and CLAUDE.md's).
- **CodeMirror 5 to 6 (#349):** web/js/editor.js on CodeMirror 6 (@codemirror/state, view, language, commands,
  search, autocomplete, lint, and the legacy VHDL / Verilog modes); the editor's own API (`getCursor`, `setCursor`,
  `replaceRanges`, `diagnostics`, `lintNow`… in positions { line, ch }) for app.js, refactor.js and the UI tests, which
  no longer reach into CodeMirror. Its modules come from node_modules through an import map in web/index.html: the
  server serves those packages only (server/import-map.js), the standalone edition bundles them and the
  third-party notices mark them as embedded there. The lint tooltip, its quick fixes and the hover info are the
  editor's own as before; diagnostics given by the app are shown at once, also without an edit of the text
  (CodeMirror 6 lints on edits only), and the lint parses the text it marks (a lint right after a quick fix
  marked the error just fixed). Find, Replace, Go to Line and folding have their Portuguese texts
  (web/js/i18n-editor.js) and follow a change of language. Dependabot no longer ignores CodeMirror's major
  versions; `@codemirror/*` and `@lezer/*` are in the group of minor / patch updates.
- **A compiled cycle simulator (#384, part 1 of #102):** `core/compiled-sim.js` reads the design at word level with
  Yosys (`prep -flatten; memory -nomap`, from the Verilog of the synthesis: a few tens of milliseconds for the
  examples) and compiles its netlist into one JavaScript function that runs n clock cycles: the combinational cells
  as integer operations (BigInt above 32 bits), the flip-flops as variables, the memories as typed arrays; two-state
  values, registers at their initial value or 0. The main clock's edges are the loop's steps; the other clocks (a
  counter bit, a button, a gated or inverted clock), the asynchronous resets / loads / sets and the latches are
  settled after each evaluation. 36 to 83 million cycles per second on the examples, 300 to 900 times the
  event-driven simulator. Checked against it cycle by cycle, ports and internal signals (`test/compiled-diff.js`):
  the six examples, the open synthesis's test designs, test designs in Verilog and VHDL exercising every cell at
  1 to 64 bits; the cells Silinx's Verilog does not make against a reference. What it cannot compile (a
  combinational loop, an inout port, a tristate buffer, RAMB16 / DCM_SP / BUFGMUX…) is an error with the reason. The
  Board Emulator does not use it yet (part 2).
- **i18n: a duplicate key (#362):** `'Test bench name:'` was written twice in web/js/i18n.js (the same translation),
  which esbuild warned of when building the standalone edition; `test/web-i18n.test.js` now rejects a key written
  twice in any of the web/js/i18n*.js dictionaries.
- **The release zip's size budget (#380):** 30 → 32 MB, by Yosys 0.70 (#368): its WebAssembly (69 MB)
  and resources (11 MB), all needed, make the zip 30.4 MB.
- **EPFL benchmarks against the best-known LUT-6 results (#367):** `research/epfl-records/measure.mjs` maps each EPFL
  combinational benchmark with Silinx's front end and Yosys / ABC to 6-input LUTs (ABC's default mapping for area,
  Silinx's depth-oriented one for depth) and compares the count and the levels with the competition's 2026 records
  (`records.json`, from lsils/benchmarks at the corpus's pinned commit); docs/QUALITY.md has the table (LUTs 1.82×
  the size records, levels 1.95× the depth records, geometric means; div, hyp, mem_ctrl not mapped: Yosys in
  WebAssembly runs out of memory). The arbiter's area mapping, 10× its record and larger than its depth mapping, is
  #370.
- **Design corpus: 29 more designs (#366, #372):** EPFL sin, voter (XC3S250E), multiplier (XC3S500E), log2
  (XC3S1200E); ITC'99 b01–b15, b20–b22 (XC3S250E), b17 (XC3S500E), behavioural VHDL with integer ranges (b04 and b11
  driven within their ranges in the netlist-vs-RTL test); the IWLS'05 OpenCores sasc, simple_spi, spi, i2c, ss_pcm,
  usb_phy (ISPRAS HDL benchmarks, licences checked file by file). Left out, with the reason in the corpus's README: EPFL
  div, hyp, mem_ctrl, arbiter, sqrt, square and ITC'99 b18, b19 (memory), the stepper motor drive (licence),
  ISCAS, Coloquinte's and TrustworthyComputing's sets. The quality page lists the designs added after the last
  comparison with ISE as such, not as not built.
- **Verilog: a delay by a name before a parenthesized expression (#373):** `x <= #Tp (a && b) ? c : d;`, as the
  OpenCores cores write their delays (the IWLS'05 SPI core), was read as a call of `Tp` and failed ("unexpected '?' in
  expression"); a name after `#` is the delay (a number, a name or `#( … )`, IEEE 1364 §9.7), the parenthesis the
  start of the expression.
- **Pinned sources at their latest versions (#358):** what `scripts/check-pins.mjs` (#352) found behind, but
  Yosys's test designs (they move with the Yosys update). The design corpus: neorv32 af90564 → b262045
  (11 commits: v1.13.6.6, the I2C device's ACK/NACK as the I2C-bus specification has it, a store-conditional's bus
  request kept stable until its response); it passes every stage as before, with the same warnings, and is
  slightly smaller and faster (2151 → 2137 slices, 4293 → 4265 LUTs, 17.442 → 16.850 ns; one more flip-flop, a
  register replicated on the critical path): `expected.json`; the old pin gives the old figures exactly.
  vtr a33307d → 8d2f389 (74 commits, none in the benchmarks used): the same results. The Model Checking
  Contest's models 2024 → 2026: the twelve nets are byte for byte the same (only their archives repacked, new
  SHA-256), the 2026 consensus results (`raw-result-analysis.csv.tar.gz`) the same values, and the call for models
  the same terms ("expected to become part of the public domain").
- **Emulator: a manual clock on a button (#347):** with no port on a board clock pin, the emulator took a port named
  clk… for the 50 MHz clock and drove it, even when the UCF puts it on a button (a manual clock, e.g. BTN0 with
  CLOCK_DEDICATED_ROUTE = FALSE): a flip-flop's Q followed D at once and the button did nothing, in the behavioural
  and the implemented model alike. The guess is now made only for a clock port the UCF does not wire to the board;
  on a button or a switch it is the board's (the note: *Manual clock clk (BTN): one edge per press*). The
  implementation was right (the button's pad through the general routing into a BUFGMUX, as ISE routes it; the
  bitstream byte-identical to ISE's bitgen, ISE's DRC clean); the design is now a test fixture
  (`test/fixtures/open-flow/feat_manual_clock`): the open flow in CI, its ISE check every night, the emulator's UI test.
- **Nightly: Yosys's test designs in two jobs, a timed-out job reported (#343):** the corpus job hit its
  60-minute limit on 15 and 16 October (46 minutes on 12 and 13 October, 52 on 14 October): no design hung,
  every file took 20–25 % longer, Silinx's synthesis of a module being up to 7 Yosys runs since its
  mappings for depth, with the wider functions and the LUT delays and the carry chains (#52, #54, #77, #78).
  The corpus now runs in two jobs at once (`run-corpus.mjs --shard 1/2`, `2/2`: every other file); a file
  that takes over 15 minutes (`--timeout`) fails the run even when none of its modules was expected to pass
  (not one expected to fail as a whole, `hana/hana_vlib.v`); 36 and 22 minutes on 17 October;
  the run prints its ten slowest files. The report job (#251) ran only after a `failure`, and a job at its
  time limit ends `cancelled`: the nightly's, ISE's and the quality comparison's report job now also runs
  after a cancelled job, and `scripts/report-failure.mjs` reports a cancelled job whose annotation says it
  exceeded its maximum execution time (not one cancelled by hand or by a newer run), its issue saying it
  timed out.
- **CI-only UI failures found (#346):** a project opened restored its processes' status (and whether its
  synthesis is up to date, #280) after it said it was open: a process double-clicked at once could be lost
  (the Processes panel drawn again between the press and the release) or synthesize again; it is restored
  before now. The RTL / Technology Schematic changed its crumbs to the instance pushed into before that
  instance's drawing was laid out: a click meanwhile selected a cell of the drawing left, whose properties then
  went away; the crumbs now change with the drawing. Of the other failures named, Open Example (traffic) was
  #215 (fixed), #253's test read the project before it was saved (fixed in its test), and yosysWorkers on
  Windows imported the module by its path, not a file URL (fixed in its test).
- **New versions of the open-source software Silinx uses (#352):** Dependabot (`.github/dependabot.yml`)
  proposes weekly, in few pull requests: the minor and patch updates of CodeMirror, Express, elkjs, esbuild
  and Playwright in one, the GitHub Actions in another, Yosys (`@yowasp/yosys`) in one of its own, labelled
  `yosys update`; CodeMirror 6 and Express 5 are ignored (#349, #350; elkjs above 0.9 was too, until #351). A pull request
  that changes Yosys runs `yosys-update.yml` on GitHub's runners: the open synthesis of the examples and of
  14 designs of the design corpus with the new Yosys and with the base's (slices, LUTs, flip-flops, critical
  path; `open-flow.mjs --quality`), and Yosys's test designs against their expectations
  (`run-corpus.mjs --json`), in one table (`scripts/yosys-update-report.mjs`): the job summary, an artifact,
  and a comment on the pull request when the token may write one. Such a pull request is never merged on
  green alone (CLAUDE.md). The sources pinned outside npm (Yosys's test designs, the design corpus's
  commits, the MCC models) are compared with their upstream monthly (`pins.yml`, `scripts/check-pins.mjs`):
  one issue, "Pinned sources: newer versions available", lists what is behind, and is closed when all are
  current.
- **esbuild 0.28 and Playwright 1.64 (#355); a UI test's race (#359):** Dependabot's first npm update
  (esbuild 0.24.2 → 0.28.2, Playwright 1.49.1 → 1.64.0). esbuild's breaking releases since 0.24 (0.25: its
  development server's access, 0.27 / 0.28: the Go compiler, the binary download's integrity check) do not
  touch the standalone build (`build({ bundle, format: 'esm', minify, write: false })`): the page is the
  same size (4.74 MB, 20 bytes more), the same warnings. Its `ui (classic)` failure was not the update's: the
  test of a drawing's HDL language read the Design pane's row as soon as the links and the file tree had
  changed, which a project read again sets before it draws the tree; it waits for the row now.
- **Express 5 (#350):** the local server runs on Express 5.3 (from 4.22). Its routes, parameters, body
  parsers, static files and error handling needed no change (no wildcard or regular-expression routes, no
  removed methods; every handler's error goes out as JSON through its own wrapper). Express 5 calls
  `app.listen`'s callback with a listen error too: on a port already in use the server printed *Silinx
  running at …* and carried on as if it listened (`serve` neither opened the running Silinx nor said the port
  was taken); `startServer` now rejects with the error (regression tests: the server's and the CLI's). A
  download's file name is no longer quoted when it needs no quotes (`attachment; filename=top.zip`).
  Dependabot proposes Express's major versions again; THIRD-PARTY-NOTICES lists Express 5's dependencies
  (the same licences: MIT, ISC, BSD-3-Clause).
- **elkjs 0.12 (#351):** the layout engine of Convert to Schematic and of the RTL / Technology Schematic goes
  from elkjs 0.9.3 to 0.12.0 (ELK 0.10–0.12: no layout option Silinx uses renamed or removed, the same API, the
  worker loaded the same way; the standalone page embeds it as before). Of the 35 schematics the examples'
  modules and the Convert to Schematic test cases become, 24 are drawn exactly as before; 11 are placed a
  little differently (traffic's `top` and `timer`, `digital_clock`, `speed_ctrl`, four test benches, three
  test cases), with no symbols overlapping, no wire through a symbol or along another net's wire, and the same
  generated HDL and simulations. In traffic's `top` and `timer` more nets are now drawn as wires where they
  were labelled stubs (27 labels to 15, 23 to 14). elkjs 0.12 is licensed EPL-2.0 or GPL-3.0-or-later
  (THIRD-PARTY-NOTICES, NOTICE, README, the About box); Dependabot no longer ignores it. New tests check, for a
  future update, that every ELK option Silinx sets is known to the installed elkjs and that those 35 schematics
  stay readable (no overlapping symbols, no two nets' wires along each other).
- **Close Project while a project is opening (#375):** opening a project reads it, restores the status of its
  last run and then the documents and the page it was left on; a Close Project chosen before that ended (as soon
  as its name was in the title) closed it, and the rest of the opening then showed its Design page over the
  Start page and reopened its documents with no project open (seen as a UI test's failure on CI: the Start page's
  recent project not visible to click). Opening and closing projects now run one after the other, in the order
  they are chosen (regression test: Close Project at once after Open, and as soon as the project is open).
- **Yosys 0.70 (#363, Dependabot's #356):** `@yowasp/yosys` 0.68.1207 → 0.70.1258. Yosys 0.70 colours its
  log (ANSI escapes) even when it is not a terminal, and YoWASP 0.70 flushes its output after each write, also
  in the middle of a line (`Warning: ` then the message): the synthesis's warnings were all lost (and Yosys's
  "Shift register inference not yet supported" no longer left out, the escapes in the console). The lines of
  Yosys's output (`lineStream`, `core/synth-open.js`) are now plain text and split at the newlines only, the
  end of a run said by `end()` (`--no-color` is unknown to Yosys 0.68, which the comparison runs with the same
  code). The yosys-update workflow's base side failed on `npm ls` (the base's version "invalid" against the
  pull request's `package.json`): the installed version is checked instead. Changed by the new Yosys: the
  source lines in its latch warnings (`proc_dlatch.cc:555…559`), the pins the placer chooses for blinky's
  back-annotation, the technology schematic's cells per block (blinky's `u_speed` 213, `u_pre` 68 at Normal
  effort; pong 1012 cells in 21 blocks instead of 1041 in 20, `pressL`'s flip-flop in its block). YoWASP 0.70's
  ABC still crashes on `read_lut` from a script file: the inline script (#78) stays; `-abc9` now runs on xc3se
  (to be measured, #369). Yosys's test designs pinned at v0.70 (`scripts/fetch-yosys-tests.mjs`): one file
  more (`various/json_netnames_signed.v`, passing), no result changed (454 / 457 passing). The comparison
  (`yosys-update.yml`, on #368): the examples as large or smaller (pong 264 → 247 slices, clock 233 → 205), pong
  14.5 % slower by the estimate (11.0 → 12.6 ns); of the design corpus's subset, femtorv32 17 % and the EPFL
  priority encoder 9 % smaller, serv 9 %, verilog-uart 9 % and stereovision3 6 % larger, ch_intrinsics 22 %
  slower (the speed after 0.70: #377). Raised by Yosys 0.70 (#368): the pedestrian crossing's size budget to
  110 LUTs (94 LUTs, 32 MUXF, 68 slices with 0.68; 108 LUTs, 13 MUXF, 67 slices with 0.70) and #54's rotator
  to 319 LUTs (313 with 0.68), still LUT4s alone; the design corpus's expected sizes and speeds as 0.70 makes
  them (`test/designs-corpus/expected.json`). Yosys's test design `hana/test_intermout.v` takes 841 to over 900 s
  with 0.70 on GitHub's runners (650 s with 0.68): the corpus's limit per file is 1500 s now (900 s, #343), the
  nightly's jobs 26 to 37 minutes of their 60 (#378).
- **Device descriptions measured black-box: the I/O and block-RAM switch boxes (#3, step 1):** the join tests
  of `research/s3e-device` drive a tile with no slice from a neighbouring CLB, across joins already observed or
  confirmed (`joinTestDesigns`' `joined` / `maxJoins`); `prototype.mjs score` compares ISE's verdicts with the
  shipped graph locally. On the XC3S250E, from scratch (4 HDL designs and 4 random designs routed by ISE, the tile
  probe: the 780 switch-box tiles, none wrong), three rounds tested 21 076 joins of the I/O and block-RAM switch
  boxes, all agreeing with the shipped graph; 3388 stay, driven only from a pad or a block RAM (the next step).
  The shipped graphs are unchanged.
- **Server hardening (#389, #390, #391, #392, #393, #394):**
  - on another address than loopback the API answers only this computer's own requests or those with the token
    printed at start-up (a new one at every start, with a warning);
  - the toolchain settings that run a program (`docker.command`, `docker.extraArgs`, `ssh.sshArgs`, `ssh.identity`,
    `paths`) are set in `~/.silinx/config.json` only, and the settings scripts must be `settings64.sh` / `settings32.sh`;
  - a Content-Security-Policy on the pages (scripts from the server and the pages' own inline ones by hash;
    `unsafe-eval` for the compiled simulator's code);
  - requests another site's page makes (`Sec-Fetch-Site: cross-site`) are refused, GETs too;
  - zip import: an entry or a whole zip above 64 / 256 MB uncompressed is refused before it is inflated, and an
    entry stops inflating at its declared size;
  - an imported `silinx.json`'s file and constraints paths that leave the project are dropped (with a warning),
    and the flows read only paths inside the project;
  - `xstOptions` cannot set the options that name files, folders, the device or the top;
  - a `.bit` outside the project is programmed only when it is a Xilinx bitstream (the same answer as a missing
    file otherwise);
  - symbolic links in a project are not project files (not listed, not exported);
  - `~/.silinx/config.json` is written for its owner only (0600), and the ssh host is not written in the job log;
  - `scripts/install-adepttool.sh` installs a pinned adepttool commit (the Silinx patch must apply) and libusb1 by
    version and hash (`scripts/adepttool-requirements.txt`).
- **Open synthesis: one Yosys runner, a failed optional mapping no longer fails the synthesis (#400, #401, #403):**
  - `runYosysOnce` (core/synth-open.js) runs Yosys for Node, its worker threads, the page's workers and the
    browser edition's flow worker and Blob workers (five copies before; the Node ones now report crashes too);
  - a depth-oriented mapping that fails (Yosys crashed: in the browser, out of memory once more) keeps the
    usual mapping's netlist, with the warning `the depth-oriented mapping failed (…): the usual mapping is kept`;
  - a page's Yosys worker that fails at run time is terminated and its run made again in a new one (as after a
    crash); the parallel workers stay (before, the flow ran one Yosys in its own thread from then on).
- **Number literals checked as XST does (#395, #396):** a Verilog based literal with a digit outside its base
  (`8'dA`, `4'b12`, `8'o9`), a decimal with `x` / `z` among other digits (`8'd1x`) or no digits (`4'b`) is an error
  at the literal: `8'dA` made `compile()` throw (the project then failed to open, at every start) and the others
  gave wrong values. A VHDL bit-string with a character that is neither a digit of its base nor a std_logic value
  (`x"G1"`), and a string with one where a vector is expected (`"1020X01Q"`), are errors too. A parser that throws
  becomes an error of its file, so a project always opens.
- **Browser edition: Stop, workers, WebUSB, errors (#397, #398, #399, #402, #408):**
  - Stop terminates the flow's worker: the job ends 'cancelled by user' (as the server's), its files and reports
    are not kept (before, `cancelJob` did nothing and the run went on to write its bitstream);
  - the flow's worker tags each run's messages (each run hears only its own); a failing worker is terminated
    and replaced at the next run;
  - `Adept.open()` releases the board when it fails after claiming it (before, the board stayed claimed until
    the page was reloaded);
  - the device description and bit database stay loaded in the worker for the next run of the same device;
    finished jobs beyond the last 20 are dropped with their download URLs; Stop asks the job once; the HDL
    files are compiled once for the drawings;
  - a promise nobody waits for that fails is shown in the Console and the Errors tab.
- **Unused exports removed (#406):** `moduleRoles` (core/compile.js), `symbolTitle` (core/schdoc.js), `DOC_LANGS`
  (core/symdocs.js), `hasX` (core/values.js), `MAJOR` (core/version.js), `paletteOpen` (web/js/palette.js): used
  nowhere. `clonePetri` stays, for the Petri net editor's paste.
- **A unit test on Windows (#447):** the #403 test of the minified Blob worker gave esbuild a URL's path as its
  folder (`/D:/…` on Windows): `fileURLToPath` now.
- **One order of the Silinx toolchain's steps (#404):** `core/open-steps.js` (`OPEN_STEPS`, `orderOpenSteps`) is the
  rule of the server's `openSteps` and the browser edition's `browserSteps` (each keeps its own step names and
  errors); a test checks that the two agree on all 2048 sets of steps. It fixes two orders both had: the
  post-synthesis model with a step that needs the placement (`postsynth` + `fpgaview`) ran no synthesis, and with
  the synthesis up to date `map` + `pin2ucf` ran Map twice.
- **The bit database loader in core/ (#407):** `core/fpga/bitdb-node.js` reads the bit database for the open flow
  (`server/open-flow.js`, `server/open-flow-run.js`) and the tests; `research/s3e-bitstream/db.mjs` re-exports it
  with the experiments' default part. The application imports nothing from `research/` (`test/layering.test.js`).

## 15.10.22

In short:

- **Groups of signals in ISim:** select signals, right-click ▸ *New Group*; a group opens and closes.
- **Stimuli drawn on the waveforms, as the HDL Bencher of the old ISE:** in ISim, *Edit Stimuli* makes the
  inputs of a module a grid of cycles; a click changes an input (0 → 1 → Z → X), the simulation runs again at once,
  expected outputs are checked, and *Save as Test Bench…* writes it all as a self-checking test bench.
- **One MUX, one DEMUX:** the palette's M4_1 … M16_1 and DEMUX1_2 … DEMUX1_16 are gone; their *Select bits*
  and *Select as a bus* make them.
- **The schematic palette's Project modules** no longer list the test benches.
- **Gates, one entry each:** the palette lists AND, OR, NAND, NOR, XOR and XNOR; a gate's *Inputs* (2, 3, 4)
  make AND3, AND4…; XOR and XNOR have 3 and 4 inputs too.
- **Gates, one entry each:** the palette's AND2B1 … NOR4B4 are gone; a gate's *Inverted inputs* make them, XOR2
  too (XOR2B1, XOR2B2).
- **BUFE and BUFT, one entry each:** the palette's BUFE4 … BUFT16 are gone; Width and Pins per bit make
  them.
- **DECODER and ENCODER, one entry each:** the palette's D2_4E … D4_16E and ENC / PENC entries are now
  DECODER and ENCODER, their options making the others.
- **SUB with borrows:** the subtractor has a borrow in BI, a borrow out BO and Pins per bit, as ADD.
- **COMP and CNT with a pin per bit,** as ADD; the palette's category I/O is now General.
- **Flip-flops, one entry each:** the palette lists FD, FT and FJK; their clock enable, clear, preset, reset
  and set are options in the symbol's properties (FD with CE and CLR is FDCE); REG is gone (a flip-flop's
  Width).
- **MUX / DEMUX, one entry each:** the palette lists M2_1 … M16_1 and DEMUX1_2 … DEMUX1_16 once, the enable E
  their parameter; the symbols show their type and the width of their bus pins.
- **The schematic editor's Names:** a checkbox shows the name of every instance and every net; View HDL is
  gone (the module's HDL file is in the Design pane); new instances are named inst_1, inst_2…
- **A signal with two drivers is an error, as in XST:** Check Syntax stops on it (Xst:528 Multi-source), and so
  do the simulation and the implementation.
- **No simulation of an HDL file its drawing can no longer generate:** a schematic (or a state diagram,
  a truth table, an ASM chart, a Petri net) with errors, for instance a net with two drivers, left its
  HDL file as it was, and Check Syntax, the simulation and the implementation ran on that old file with
  no warning; they now stop on it and say why.
- **Adders with a pin per bit:** the schematic editor's ADD has the option *Pins per bit*: with Width 1, 2 or 4
  and the carries it is a full adder, a 2-bit or a 4-bit adder as the Xilinx ADD4.
- **Clear clears everything:** the console's Clear also empties the Warnings and Errors tabs.
- **I/O markers rotated and mirrored:** in the schematic editor, Rotate (Ctrl+R) and Mirror (Ctrl+M)
  now turn the I/O markers too, so a marker can sit on a vertical wire or face the other way.
- **Getting started, as Silinx is now:** the documentation presents the site as the way to design,
  simulate, synthesize and program the board, and the Node.js application as an alternative way of
  running Silinx locally; Chrome on an Android tablet programs the board too.
- **Multiplexers and demultiplexers as in the Xilinx library:** the schematic editor's M4_1 has its
  select bits S1 and S0 as pins of their own (the DEMUX too); every multiplexer and demultiplexer comes
  with an enable E (M2_1E, M4_1E, DEMUX1_4E…); new M8_1, M16_1 and DEMUX1_16 (with and without E); the
  palette no longer lists DECODER and ENCODER, the same symbols as D2_4E… and PENC / ENC.
- **Clicks no longer lost in the schematic editor:** a click on the palette or the properties right after an
  edit (when the project compiles again) sometimes did nothing.
- **State diagrams and ASM charts opened on a slow machine:** a state or block dragged at once no longer
  jumps away when the editor fits the drawing in the window.

In detail:

- **Schematic editor, clicks lost (#339):** every compile of the project (after each saved edit) gave the open
  schematics their modules again, and the editor made its palette and properties anew even when nothing had
  changed: a click whose press and release fell on each side of it was lost (a Rotate, a flip-flop's CLR, a palette
  row). The same modules now change nothing.
- **FSM and ASM editors, the first fit (#339):** the view is fitted to the drawing once, when the canvas first has
  a size; on a slow machine that came after the user's first press, and the state being dragged jumped. As in the
  Petri net editor, the view is the user's from the first press or zoom.
- **Start-up warnings (#339):** the toolchain check's warnings (ISE not available, no programmer) stayed in the
  Warnings tab of the project reopened at start-up when their answer came after it opened, and not otherwise; with
  a project open they are now in the console only.
- **UI tests (#339, #293):** the touch test drags a state once the drawing stands still; the narrow-screen test
  lists the warnings it finds; the board emulator's power test reads the time just after the switch turns it on
  (0) instead of comparing the first time it sees with the time it was turned off at, which a fast-running board
  could pass.
- **ISim: groups of signals (#341):** in the wave window, *New Group* (right-click) puts the selected signals in a named
  group, a row that opens and closes (its triangle, a double-click) and shows how many signals it has; *Rename Group…*,
  *Ungroup*; a signal dragged between the signals of an open group joins it, dragged elsewhere leaves it; *Delete* on a
  group deletes it with its signals; the window's state keeps the groups.
- **Stimuli drawn in ISim (#336):** simulating a module without a test bench, *Edit Stimuli* (the toolbar) asks
  for the timing (a clock input and its period, or combinational with a time step, and the number of cycles) and
  lays the inputs out as a grid: a click on a cycle of an input changes it there and up to its next change
  (0 → 1 → Z → X), a bus gets a value typed in (bits, h… or d…), and the simulation restarts and runs the stimuli
  at once. On an output a click sets the expected value (- → 0 → 1, a bus typed in); *Fill Expected Outputs* takes
  them from the simulation; the mismatches are red on the waveform, counted in the bar and listed in the console.
  Simulating a test bench, *Edit Stimuli* draws the inputs of its unit under test, forced over what the bench drives
  them with. The stimuli are saved in the project (per module or test bench) and run when ISim opens; *Save as Test Bench…* writes the
  self-checking VHDL / Verilog test bench (`tb_<module>`, a simulation source), which the Test Bench Wizard's
  generator now writes with Z / X on std_logic inputs and, for the stimuli, its first vector at time 0
  (core/stimuli.js, the same timing as the bench: inputs at the falling edge, outputs checked before the next).
- **XNOR with inverted inputs (#337):** XNOR had no *Inverted inputs* in its properties, as the other gates have;
  XNOR2B1 … XNOR4B4 are Silinx symbols (the Xilinx library has none), exported to ISE as Silinx symbols.
- **MUX and DEMUX: the select bits as a parameter (#334):** the Mux palette listed M2_1, M4_1, M8_1, M16_1 and
  DEMUX1_2 … DEMUX1_16; it lists MUX (the M2_1) and DEMUX (the DEMUX1_2), and their properties *Select bits* (1 … 4)
  make M4_1 … M16_1 / DEMUX1_4 … DEMUX1_16 (the width, the enable and the select bus kept), *Select as a bus (S)*
  one select pin S. The symbols and their datasheets keep the Xilinx names (M8_1E, DEMUX1_8). Existing schematics
  unchanged.
- **Project modules without the test benches (#332):** the schematic editor's palette listed every module of
  the project under *Project modules*, the test benches too; it lists the design modules only (not a
  Simulation-only source, nor a module without ports, which a schematic cannot connect).
- **Gates: the number of inputs as a parameter (#330):** the Logic palette listed AND2, AND3, AND4, OR2 … NOR4;
  it lists AND, OR, NAND, NOR, XOR and XNOR (the 2-input gates), and a gate's property *Inputs* (2, 3 or 4) makes
  it AND3, AND4… (its inverted inputs kept while it has them). New XOR3, XOR4, XNOR3, XNOR4 (as the Xilinx
  library's, imported from ISE as them, no longer as HDL blocks) and XOR3B1 … XOR4B4 (Silinx symbols); the VHDL of
  an XNOR of 3 or more inputs is `not (a xor b xor c)`. The symbols keep their Xilinx names (AND3B2). Existing
  schematics unchanged.
- **Gates: inverted inputs as a parameter (#328):** the Logic palette listed every inverted-input variant
  (AND2B1, AND2B2, AND3B1 … NOR4B4); it lists AND2 … AND4, OR2 … OR4, NAND2 … NAND4, NOR2 … NOR4, XOR2 and
  XNOR2, and a gate's property *Inverted inputs* (0 … n: I0.. inverted, the bubbles) makes it the variant
  (AND3 + 2 = AND3B2). XOR2 has it too: XOR2B1 (O = I0' ⊕ I1) and XOR2B2, Silinx symbols (the Xilinx library
  has none), exported to ISE as Silinx symbols. Existing schematics unchanged.
- **BUFE and BUFT (#326):** the Tri-State palette listed BUFE, BUFE4, BUFE8, BUFE16, BUFT, BUFT4, BUFT8,
  BUFT16 and TBUF; it lists BUFE and BUFT, their Width and *Pins per bit (I0.., O0..)* (renamed from *One
  pin per bit*) making the others; the symbol and its datasheet keep the Xilinx name (BUFE4, BUFT8…), the
  ISE import of BUFE4 … BUFT16 is unchanged. Existing schematics unchanged.
- **DECODER and ENCODER (#324):** the palette listed the decoder's presets D2_4E, D3_8E, D4_16E and the
  encoder's PENC4_2, ENC4_2, PENC8_3, ENC8_3, PENC16_4, ENC16_4; it lists DECODER (as D2_4E: 2 address bits,
  the enable) and ENCODER (as ENC4_2: 2 output bits, one-hot, the type's default now) instead, their
  options (address / output bits, enable, type, bus pins) making the others; the symbols keep the
  Xilinx-style names drawn (D3_8E, PENC8_3…). Existing schematics unchanged (their parameters saved).
- **SUB: borrow in / out, pins per bit (#322):** the subtractor's options *Borrow in (BI)* (D = A − B −
  BI), *Borrow out (BO)* (1 when the unsigned difference is negative, A < B + BI: the BO of one stage into
  the BI of the next chains subtractors) and *Pins per bit (A0.., B0.., D0..)* (a box SUB<w>), as ADD's
  carries and pins (#304). Datasheet (EN / PT), HDL (one difference in w + 1 bits, its top bit the
  borrow), live simulation and ISE export / import (`xl_sub<w>[_bi][_bo][_bits]`) follow.
- **COMP and CNT: Pins per bit (#319):** the comparator's option *Pins per bit (A0.., B0..)* (a box named
  COMP<w> and its relation, COMP4 ≥) and the counter's *Pins per bit (Q0..)*, as ADD's (#304): the same
  function, their HDL made of the bits (VHDL `std_logic_vector'(A2 & A1 & A0)`, Verilog `{A2, A1, A0}`; the
  count in a signal of its own, Q0.. its bits); datasheets, ISE export / import (`…_bits`) follow.
- **The category General (#320):** the palette's category I/O (CONSTANT, VCC, GND) is named General (Geral).
- **Flip-flop inputs as options (#315):** the Flip-Flops palette listed every Xilinx variant (FDC, FDCE,
  FDCPE, FDR, FDRE, FTCPE, FJKSRE…) and REG. It now lists FD, FT and FJK; the properties of a flip-flop
  have *Clock enable (CE)*, *Asynchronous clear (CLR)*, *Asynchronous preset (PRE)*, *Synchronous reset
  (R)* and *Synchronous set (S)*: a choice makes the symbol the Xilinx variant with those inputs (its name
  drawn: FDCE, FTRSE…), an input the library does not have with the others chosen is unavailable (said).
  REG is not in the palette (a flip-flop with Width > 1 is a register); the schematics that have it, and
  the variants as symbol types, as before (ISE import / export, HDL, datasheets unchanged).
- **MUX / DEMUX symbols (#313):** the M2_1E … M16_1E and DEMUX1_2E … DEMUX1_16E palette entries are gone:
  the enable is the parameter *Enable input E* of M2_1 … M16_1 and DEMUX1_2 … DEMUX1_16 (a symbol with it
  is still named M4_1E…); the generic DEMUX entry is gone too (the same symbol as DEMUX1_n). M8_1 and
  M16_1 have *Select as a bus (S)* as M4_1. The multiplexers and demultiplexers show their type (M4_1,
  DEMUX1_8…) above them, the instance name above it, and the width by each bus pin (the output's too).
  ISE export / import: M8_1 / M16_1 with the bus S as `xl_mux8[e]_w`, with the select pins
  `xl_mux8[e]s_w`.
- **Names, no View HDL, inst_n (#311):** the schematic editor's toolbar has a checkbox *Names* (before
  Check, remembered) that draws the name of every instance, the automatic ones too, and of every net
  (`net_n` on its longest run, besides the net-name labels); unchecked, the names the user gave and the
  labels, as before. The View HDL button and its language select are gone (the schematic's language is
  in its properties; its HDL file opens from the Design pane). New instances, and those of Convert to
  Schematic, are named `inst_n` instead of Xilinx's `XLXI_n`; the names of existing and imported ones
  are kept.
- **Multi-source, an error (#309):** a signal driven from more than one place in the HDL (two processes or
  always blocks, a process and a concurrent assignment, two instance outputs; tri-state drivers and
  inout nets apart) was a warning of the design checks (HDLCompiler:1401); it is now an error with
  XST's message, `ERROR:Xst:528 - Multi-source in Unit <u> on signal <s>; this signal is connected to
  multiple drivers (lines a and b)`, checked with the other rules (also with Edit ▸ Design Checks off),
  so Check Syntax fails and the simulation and the implementation do not run. Its explanation and fix
  as before.
- **An HDL file its drawing cannot generate (#303):** a drawing with errors is not written into its HDL
  file (the console, the HDL editor's banner and the drawing's Check panel said so), but Check Syntax,
  Simulate Behavioral Model and Implement Design read that file as it was: a schematic whose output net
  had two constants on it simulated with one of them, no warning, no X. The application now keeps the
  HDL files their drawing could not generate again (in the editors as they sync, and for every linked
  drawing when the project is compiled, so also after opening it), and Check Syntax reports each as an
  error of the file (`… is not up to date: <drawing> cannot generate it, <its errors>. Fix <drawing>`),
  which stops the simulation and the implementation; once the drawing is fixed and its HDL generated
  again, they run. (Two drivers in hand-written HDL: Check Syntax's multiple-drivers warning, as
  before.)
- **Adders of 1-, 2- and 4-bit numbers (#304):** the adder ADD has the parameter *Pins per bit (A0..,
  B0.., S0..)*: with the carries, Width 1 is the full adder (A, B, CI -> S, CO), Width 2 and 4 an adder
  of a pin per bit (A3..A0, B3..B0, CI -> S3..S0, CO, a box as the Xilinx ADD4; no ADD1 / ADD2 / ADD4
  palette entries of their own, #317). Their datasheet (the full adder's
  truth table, the pins' weights), HDL (one sum of the bits, VHDL and Verilog), live simulation and
  ISE export / import (`xl_add<w>…_bits`) follow.
- **The console's Clear (#302):** it emptied the Console only; it now empties the Warnings and Errors
  tabs and their counts too (the editors' marks stay, checked again at the next edit).
- **Multiplexers, demultiplexers, decoders (#301):** M4_1's select was a 2-bit bus pin S, DEMUX1_4 /
  DEMUX1_8's too; they now have a pin per select bit, the most significant on the left (S1 S0, S2 S1
  S0), as the Xilinx M4_1E and the decoders' A1 A0. The multiplexers and demultiplexers have an enable
  input E (parameter *Enable input E*; the outputs 0 when E = 0), listed as presets of their own:
  M2_1E, M4_1E, M8_1E, M16_1E, DEMUX1_2E … DEMUX1_16E. New M8_1 and M16_1 (their body wider with the
  select bits) and DEMUX1_16. DECODER and ENCODER are no longer in the palette (their presets D2_4E /
  D3_8E / D4_16E and PENC / ENC are). A schematic saved before (document version 1), or an HDL file
  generated before, keeps its M4_1 / DEMUX with the bus pin S (parameter *Select as a bus (S)*), its
  HDL the same; the schematic documents are now version 2. Their datasheets (Symbol Info), truth
  tables, HDL, live simulation and the ISE import / export follow: M2_1E, M4_1E and M8_1E are written
  and read as the Xilinx library symbols, the others as Silinx symbols whose names say their enable and
  their select pins. The UI tests' clicks on a text now prefer the element with exactly that text.

- **The documentation's Getting started (#299):** README's Getting started and the step-by-step
  guides (`docs/GETTING-STARTED.md`, `docs/COMECAR.md`) said the site was for designing and
  simulating and the Node.js application for synthesizing and programming; since the Silinx toolchain
  and WebUSB programming (the FPGA and the Platform Flash) run in the browser, the site does it all for
  the Basys2 / Nexys2, and the application is the same Silinx run locally (projects as folders, offline,
  the installed programmers, Xilinx ISE for the other boards). The tablet notes: Chrome on Android has
  WebUSB and programs the board (checked on a Samsung tablet), only Safari on an iPad does not.
  The rest of the documentation checked against what Silinx does now: README's notice, its
  Implementation, View Implemented Design, ISE processes, synthesis (the Optimization Effort, the
  synthesis up to date), programming (WebUSB) and layout sections; the ISE Docker kit's README (ISE is
  needed for the other boards, not for the Basys2 / Nexys2); `docs/OPEN-TOOLCHAIN.md` (the four
  devices shipped); `docs/PROJECT.md` (the examples as templates, every family's parts, `synthTool`,
  `impl.optLevel`); `docs/QUALITY.md` and its generator (the results pushed to `quality-results`);
  the guides' example version and that programming needs the site's address, not the downloaded
  file; the release notes (the single-file edition synthesizes and programs; Node.js 18, the
  launchers); `package.json`'s description; NOTICE and README name Yosys and the adepttool port. The
  About dialog says the Silinx toolchain synthesizes and the browser programs (English, Portuguese).

- **I/O markers on any side (#296):** Rotate and Mirror acted on symbols only, and a marker's body was
  always to the left of its connection point (an input) or to the right (an output, a bidirectional
  port). A marker now has a side (`ports[].side` in the `.sch.json`: W, N, E or S, saved when it is
  not its direction's default); Rotate turns it a quarter turn clockwise around its connection point,
  Mirror puts it on the opposite side, from the toolbar, the keys or its properties (which now have
  Rotate / Mirror / Delete, as a symbol's), with symbols selected too; its name reads upwards on a
  vertical marker. The connection point, the netlist and the HDL are unchanged. The ISE schematic
  import reads an iomarker's orien (R0 E, R90 S, R180 W, R270 N, and the mirrored ones), the export
  writes it.

## 15.10.21

In short:

- **Platform Flash from the browser, faster still:** programming the PROM of the Basys2 / Nexys2 from
  the browser edition sends the blocks as the FPGA's bitstream is sent and waits for each block until
  the PROM says it is programmed, as the full application does; the console says how long the
  erase, the program and the verify took, and where the USB time went.

In detail:

- **PROM programming over WebUSB: the waits measured, without data (#287):** after #274 each block's
  program wait (20 ms, the 14 ms maximum with margin) went out as TMS / TDI pairs, about 20 KB a block
  at the Adept's 4 MHz, and every IR shift read its TDO back: 10.4 MB over full-speed USB (~1 MB/s)
  to program an XC3S250E design (331 blocks). `core/xcf.js` now measures the PROM's block program
  time on the first 2 blocks and every 64th (ISCTESTSTATUS polled within the stream, no USB round
  trip between the polls) and waits twice the longest measured (at least 1 ms, at most 20 ms); the
  status read at the end of each stream measures a PROM still busy again, and the verify catches a
  block cut short. `JtagSeq` (`core/adept.js`) sends a Run-Test/Idle wait of more than 8192 clocks as
  one DJTG CLOCK_TCK (no data) between the stream's pieces, and reads an IR's TDO only when asked.
  With the simulated PROM, programming those 331 blocks takes 0.7 MB and 143 transfers instead of
  10.4 MB and 382 (about 0.8 s at 1 MB/s instead of 10.5 s); a PROM that does need 12 ms a block
  gets 20 ms as CLOCK_TCK, 0.55 MB. The console gives each phase's time (e.g. `erased in 4.1 s`,
  `programmed 331 blocks in 2.0 s`, `verify OK in 1.3 s`, `program done in 7.6 s`) and the program
  time measured (`  block program time: 0.06 ms measured, 1.00 ms waited`). The simulated PROM takes
  a program time per block; the tests' clock is the simulated board's TCK count. The full
  application's `scripts/xcf_prog.py` is unchanged.
- **PROM programming over WebUSB: the fixed wait again, the blocks as PUT_TDI_BITS (#289):** on the
  board #287's measured waits failed (`verify FAILED at byte 4 (block 0): read ff expected 55`, the
  program time measured 0.00 ms): the measurement shifted ISCTESTSTATUS right after ISC_PROGRAM,
  and an ISC operation starts only in Run-Test/Idle (IEEE 1532), so block 0 never programmed and the
  PROM said ready. Every block now waits the fixed 20 ms again (a CLOCK_TCK, no data); the measured
  waits are an option, off (`measure`), their polls those of `scripts/xcf_prog.py` (Run-Test/Idle
  first). The board also showed the TMS / TDI pairs slow (331 blocks in 10.9 s with 1 ms waits):
  `JtagSeq` now sends a long DR shift (a block's 4096 bits, written or read) as one PUT_TDI_BITS /
  GET_TDO_BITS, as the FPGA's bitstream goes, the pairs only for the TAP moves (9 KB for 331 blocks
  instead of 0.7 MB), and a wait over 1024 clocks as a CLOCK_TCK. The console gives, for the last
  block only, what ISCTESTSTATUS says of its program time (its wait still the full 20 ms) and, after
  the program and the verify, the USB commands of each kind (count, bytes, time, KB/s). The simulated
  PROM starts an erase / a program only in Run-Test/Idle (the board's failure reproduced), and
  counts the bytes of each kind of command.
- **PROM programming over WebUSB: the measured wait, in real time (#291):** after #289 a Basys2's
  XCF02S programmed and verified in 22.9 s, 14.1 s of it the 331 waits of 20 ms, though
  ISCTESTSTATUS put a block's program time at 0.19 ms; and those 20 ms of clocks took ~43 ms: the
  port's TCK is about half the 4 MHz it says. The program time is now measured again by default
  (#289's polls: Run-Test/Idle, ISCTESTSTATUS, one clock, the status read, until ready, 50 ms at
  most) on blocks 0 and 1, every 64th and the last; the others wait 5 times the longest measured, at
  least 2 ms, at most 20 ms; the status checked at the end of each stream (a PROM still busy measured
  again), once more after the last block, and the verify. The TCK rate is measured on the 110 ms
  CLOCK_TCK of the first ISC_DISABLE and the waits counted at it when it is under the port's. The
  console: `TCK: 4.00 MHz said, 2.00 MHz measured: the waits counted at 2.00 MHz` and
  `  block program time (ISCTESTSTATUS): 0.19 to 0.21 ms on 8 blocks; the others waited 2.00 ms`;
  the fixed 20 ms with the option `measure: false`. The waits of the 331 blocks: ~0.7 s of clocks
  (and their CLOCK_TCKs' round trips) instead of 14.1 s.
- **PROM programming over WebUSB: every block confirmed before the next (#294):** on the board #291
  failed (`verify FAILED at byte 4078 (block 7): read ff expected 00`): its 9 blocks measured took
  0.32 to 2.07 ms, the others were given 10.33 ms, and block 7, not measured, needed more: a block's
  program time varies (up to ~14 ms), so it is not extrapolated any more. Every block's status is
  now polled until it says done before the next block's ISC_DATA_SHIFT, as `scripts/xcf_prog.py`
  does: in the block's own stream after ISC_PROGRAM 4 polls (#289's: 128 clocks in Run-Test/Idle,
  ISCTESTSTATUS, one clock, the read), then while busy more, the gap doubling up to 2 ms (a
  CLOCK_TCK past 1024 clocks), 50 ms at most (the existing error); the status checked once more
  after the last block, then the verify. No block's stream is sent before the previous one's status
  came back. The console: `  block program time (ISCTESTSTATUS, every block): min to max ms, mean
  … ms of TCK; N polls; min to max ms, mean … ms a block in all` (the host's time per block). #291's
  and #289's programs stay as the options `mode: 'extrapolate'` / `'fixed'`. The simulated PROM
  takes a seeded program time per block, 0.2 to 14 ms (mostly short): every block programs and
  verifies, and #291's waits fail on it at a slow block not measured, as on the board.

## 15.10.20

In short:

- **Faster Platform Flash from the browser:** programming and verifying the PROM of the Basys2 /
  Nexys2 from the browser edition now takes seconds instead of minutes.
- **Faster open synthesis:** Synthesize - Yosys (open) takes about a third less time in the browser
  (pong 9.2 s -> 6.3 s in Chrome), and less on the server too; its result the same.
- **A fast synthesis by default:** with the Silinx toolchain, the synthesis's Optimization Effort
  (Process Properties) Normal, the default, synthesizes once: about 2.4 s on the examples instead of
  4 to 9 s. High also tries the mappings for speed, as before: a slower synthesis, a circuit up to
  about 10 % faster.
- **No synthesis again when it is up to date:** with the Silinx toolchain, Implement Design and
  Generate Programming File start at Translate when the design has not changed since its last
  synthesis (only the pins, or nothing): "Synthesize - Yosys is up to date", as in ISE.

In detail:

- **PROM programming over WebUSB in streams (#274):** `core/xcf.js` sent every JTAG step as its own
  Adept command (about five USB transfers, ~1 ms each over WebUSB), and polled the PROM's status
  after each block: about 100,000 transfers to program and verify an XC3S250E design (331 blocks).
  The steps are now composed into whole JTAG streams (`JtagSeq` in `core/adept.js`: the TAP moves,
  the IR of the whole chain, the DR with the other devices in BYPASS, the Run-Test/Idle clocks, TDO
  read only where needed), sent with one PUT_TMS_TDI_BITS for several blocks: each block's
  ISC_DATA_SHIFT, ISC_ADDRESS_SHIFT and ISC_PROGRAM followed by its maximum program time (14 ms, with
  margin 20 ms) clocked in Run-Test/Idle, counted at the TCK rate the Adept reports (GET_SPEED), the
  status checked once after the last block; the verify reads several blocks a stream. The same
  design now takes about 540 transfers. The console lines, the errors and the ISC protocol are those
  of before; the simulated PROM now also flags an instruction that cuts a program short (a wait too
  short), and a test counts the transfers. The full application's `scripts/xcf_prog.py` is unchanged.
- **Yosys in two workers in the browser (#276):** the page ran Yosys in one Web Worker, so the
  synthesis's mappings from the same netlist (#86) ran one after the other; it now keeps two when the
  device has 4 cores or more and 8 GB of memory or more (or does not say: each Yosys takes about 2 GB
  on pong), one otherwise, the runs queued over them. The same netlists; in Chrome, pong 9.2 s ->
  6.3 s and clock 8.2 s -> 5.8 s. After a crash (out of memory, #153) the run is made once more in a
  new worker, and from then on one Yosys at a time.
- **Optimization Effort Normal / High with the Silinx toolchain (#282):** the synthesis's Process
  Properties already had XST's Optimization Effort (`impl.optLevel`, Normal by default); the Silinx
  toolchain now follows it. Normal is one Yosys run, the usual mapping onto LUT4s; High is every
  mapping, the fastest kept (the wide one #54, the depth-oriented ones #78, the carry chains #77), as
  before. The flow's console says which; the dialog says what each does, in English and in Portuguese;
  it is an input of the synthesis's fingerprint (#280). Blinky, pong, clock: Normal 2.3 / 2.5 / 2.3 s,
  High 3.7 / 8.2 / 9.3 s, the logic delay of the netlist 6.7 / 12.3 / 8.5 ns against 6.7 / 11.2 / 7.7.
  The quality comparisons with ISE (design corpus, `research/s3e-route/open-flow.mjs`) keep the full
  synthesis. The UI tests that check exact netlists or the placer's pins follow the new default.
- **The synthesis up to date (#280):** Implement Design, its steps and Generate Programming File
  always ran the synthesis first (the server's and the browser's chain started at it). The application
  now keeps the fingerprint of what the last good synthesis read (the design sources, not the test
  benches nor the constraints; the top, the device, the synthesis tool) in `build/silinx-status.json`;
  while it is the same, a run with the Silinx toolchain leaves the synthesis out (`synthUpToDate`):
  it starts at Translate from `build/open/<top>.json`, says `Process "Synthesize - Yosys" is up to
  date`, and the Design Summary keeps what that synthesis made. Without that netlist (another
  browser, the build folder emptied) the synthesis runs. Synthesize itself, and a run with the
  Post-Synthesis Simulation Model, always run it; the ISE modes are as before. On blinky, a change of
  the pins: Generate Programming File without its 5 s of synthesis.
- **Implement Design's synthesis in the Yosys workers too (#279):** the browser edition's flow
  (Implement Design, Generate Programming File) ran Yosys in its own worker's thread, one run at a
  time; it now keeps a pool of Yosys workers of its own (as #276's, started from a Blob in the
  single-file edition), or its thread where a browser cannot start them. Blinky's and pong's flows in
  the browser: 19.5 s -> 16.3 s.
- **The second balancing at once (#277):** the depth-oriented mapping's second balancing (with and
  without the LUT delays, #78) starts with the first mappings when 4 Yosys or more run at a time,
  only its choice waiting for them: the netlist the same, pong's synthesis 8.1 s -> 7.1 s and
  clock's 7.9 s -> 6.3 s on the server. The server's Yosys workers are up to 4 (they were 2), one
  core left to the rest; the command-line flow (`research/s3e-route/open-flow.mjs`) uses them too
  (it ran Yosys in its own thread, one run at a time: pong's synthesis 16.1 s -> 7.5 s, the same `.bit`).

## 15.10.19

In short:

- **The board's Platform Flash from the browser:** the browser edition (Chrome / Edge) now programs
  the PROM of the Basys2 / Nexys2 over USB, as the full application does, so the design starts at
  power-up: select the PROM in Configure Target Device's chain and click *Program PROM* (also
  *Verify*, *Erase*, *Back up PROM*, downloaded, and *Reload FPGA from PROM*).

In detail:

- **Platform Flash over WebUSB (#271):** a new module, `core/xcf.js`, programs the XCF01S / XCF02S /
  XCF04S over the JTAG of the board's Digilent Adept USB (`core/adept.js`), with the steps of the full
  application's `scripts/xcf_prog.py` (the IEEE 1532 flow of the XCF's BSDL: the PROM found by its
  IDCODE, ISC_ENABLE, ISC_ERASE, the data in 4096-bit blocks, 2048 on the XCF01S, with
  ISC_DATA_SHIFT, ISC_ADDRESS_SHIFT and ISC_PROGRAM, ISC_READ to verify, ISC_DISABLE, then CONFIG and
  the FPGA's DONE checked). The image is `build/<top>_prom.bit` (StartUpClk:Cclk), which Generate
  Programming File already writes in the browser, or a `.bit` chosen from the disk. The console shows
  the full application's lines; a design too large for the PROM, a bitstream for another FPGA, a
  write-protected PROM, a verify mismatch (its byte and block) or an FPGA that does not load from the
  PROM (the mode jumper) stop it with a clear error. The old "programmed by the full Silinx
  application" error is gone. Tested against a simulated board whose PROM implements the
  instructions and checks the protocol (erase before program, block writes, verify), with the blocks
  compared to those of `xcf_prog.py`; to be checked on a real Basys2 and Nexys2.

## 15.10.18

In short:

- **Removing the top module from the project:** the module left becomes the top (Undo brings the old
  one back), and I/O Pin Planning no longer opens empty for a top the project no longer has.
- **The start page shows only the command search (Ctrl+K):** its Save and Undo hints are gone.
- **Touch screens:** a finger drags the splitters between panes, a dialog by its title and the
  waveform viewer's cursor, markers and rows.
- **The right-click menus on an iPad or a touch screen:** a long press (a finger or a pen held still
  for half a second) opens them. The README and the getting-started guides say what works on a tablet.
- **Narrow screens (an iPad in portrait):** the drawing editors get the whole width. The Design pane
  is a drawer opened by the header's button, and the editors' properties (and the schematic's
  symbols) open over the drawing.

In detail:

- **Narrow screens (#266):** at 1024 px wide or less (every iPad in portrait, 768 to 1024 px; in
  landscape, from 1080 px, nothing changes) the left side (Start, Design, Files, Libraries and the
  Processes) is a drawer over the workspace, shown and hidden by a new button at the left of the
  header and, in the modern interface, by the activity bar, which stays; a tap beside it, or a document
  opened, closes it. The schematic, ASM, state diagram and Petri net editors' side panels go over the
  canvas, shown by their toolbar's *Properties* button (the schematic's palette by *Symbols*), so the
  drawing keeps nearly all the width (756 of 820 px) instead of a narrow strip. The link banner of a
  state diagram or Petri net ("HDL: … — generated from the net") is one line, its whole text in its
  tip, and the editors' toolbars wrap as one row of buttons. What was left open is remembered in the
  browser. Both interfaces; in English and in Portuguese.
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
