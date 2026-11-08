# A third interface, organised around the tasks (#782): the inventory

Step 1 of #782. What the app shows today (15.11.3), read from `web/` and seen in the running app with
the pong example on a Basys2, at a laptop's 1366 × 768 and a tablet's 820 × 1180; then the tasks of a
lab session, what each needs on screen and what is in the way.

## 1. The window today

Both interfaces share one page (`web/index.html`); classic and modern differ in CSS (`web/css/app.css`,
`web/css/modern.css`). Sizes: classic / modern.

| Region | Size | What it holds |
|---|---|---|
| Header | 26 + 22 px / one 48 px row | logo, title, project chip; the menu bar; (modern) the search box "Search commands and files… Ctrl K" and the theme button |
| Toolbar | 28 / 44 px | New, Open · Undo, Redo · Cut, Copy, Paste, Find · Design Summary, RTL Schematic, I/O Pin Planning, New ASM · Implement, Stop, Simulate, iMPACT · Toolchain Settings, About; modern adds the five steps **Check · Simulate · Implement · Emulate · Program** (labels hidden ≤ 1180 px) |
| Left pane | 300 / 344 px (splitter 180–700) | pages Start, **Design**, Files, Libraries (classic: tabs at the bottom; modern: a 64 px activity bar) |
| · Design page | | "View: Implementation / Simulation", the Hierarchy tree, a splitter, the **Processes** list (42 % of the height) |
| Documents | the rest | one tab per document (classic: tabs at the bottom; modern: on top, scrolling) |
| Bottom panel | 170 px (splitter 60–700) | **Console**, **Errors (n)**, **Warnings (n)**, Clear |
| Status bar | 22 / 26 px | message ("Ready"), Ln/Col, device · board, (browser edition) where projects are kept |

Below 1025 px the left pane becomes a drawer over the documents (the header's panel button; it closes
when a document opens); the editors' side panels (ASM, schematic symbols and properties) become
overlays. Touch: a long press opens context menus; two fingers pan and pinch the drawings and the
waves. The menu bar opens on mouse down or hover only.

### Menus

- **File**: New / Open Project, Import / Export Silinx and Xilinx ISE projects (.zip), (browser) Project
  Bundle and the workspace folder items, Close Project, Print, Recent Projects.
- **Edit**: Undo, Redo, Cut, Copy, Paste, Delete, Find, Replace, Go to Line, Design Checks (Lint Warnings).
- **View**: Implementation / Simulation, Design Summary, Language, **Interface** (Modern / Xilinx ISE
  (Classic)), Theme, Command Palette.
- **Project**: New Source, Add Copy of Source, Set as Top Module, Design Properties, (server) Sync with .xise.
- **Process**: Implement Top Module, Stop, Run, Check Syntax, Simulate Behavioral Model.
- **Tools**: ASM, Truth Table / Karnaugh, FSM and Petri net editors, I/O Pin Planning, iMPACT, Board
  Emulator, RTL Schematic, Implemented Design (FPGA View), Toolchain Settings.
- **Window** (the open documents), **Help** (About, Keyboard Shortcuts, Check for Updates, Tell Us Who
  You Are), and Development in development builds.
- Context menus on the document tabs, the editor, every tree row and process, the ISim names, objects,
  instances and waves, the schematic symbols.

### Processes (the Processes panel, by view and selection)

- Always first: **Design Summary/Reports**.
- **Simulation view**, a module selected: ISim Simulator ▸ Behavioral Check Syntax, **Simulate Behavioral
  Model**, Simulate Post-Synthesis / Post-Translate / Post-Map / Post-Place & Route Model; View RTL
  Schematic; Create Test Bench (Wizard).
- **Implementation view**, a module selected: [View/Edit the drawing]; Design Utilities ▸ View HDL
  Instantiation Template; User Constraints ▸ I/O Pin Planning, Edit Constraints (Text), Check
  Constraints; **Synthesize - Yosys** (XST with ISE) ▸ View RTL / Technology Schematic, Check Syntax,
  Generate Post-Synthesis Simulation Model; **Implement Design** ▸ Translate, Map, Place & Route (each
  with its simulation model; Place & Route also Static Timing, Text Power Report, Back-annotate Pin
  Locations, View Implemented Design (FPGA)); **Generate Programming File**; **Emulate on Board** ▸
  Emulate Behavioral Model (RTL) and the four netlist models; **Configure Target Device** ▸ Manage
  Configuration Project (iMPACT).
- A drawing selected: View/Edit its diagram. The UCF: Edit Constraints, Check Constraints, I/O Pin
  Planning. States: done, warnings, errors, running, out of date.

### Documents (what opens as a tab)

HDL / UCF editor (Check Syntax, Templates, find); instantiation template; the ASM, FSM, truth table /
Karnaugh, Petri net and schematic editors (the schematic with its live simulation); RTL and technology
schematic viewers; **Design Summary** (status, utilization, timing, programming file, the reports);
text reports; I/O Pin Planning; **iMPACT** (board, tool, cable, .bit, chain, Program FPGA, the PROM box);
FPGA view; **ISim** and the **Board Emulator**.

- **ISim** is an IDE inside its tab: its own title bar, a toolbar of about 16 buttons and the run-time fields, Instances and
  Processes, Objects (a 290 px column), the wave window, its own **Console with an `ISim>` command
  line** (170 px) and its own status bar ("Sim Time").
- **The Board Emulator**: a bar (Model, Engine, Run / Pause, Step, Power cycle, Clock, Timing, When
  hidden), the board picture (Basys2, Nexys2, S3E Starter or generic), a VGA monitor when used, and a
  side column (min 260 px): Watch, Timing generics, Not on the board, **Messages** (max 140 px).

### Dialogs

New Project Wizard (3 pages); Open / Import / Replace Project; **New Source Wizard** (14 kinds of source,
up to 6 pages); Module, Schematic and Petri Net wizards; **Test Bench Wizard** (5 pages); Add Copy of
Source; Source, Design and Process Properties; Update Constraints; Toolchain Settings; About; Check for
Updates; Keyboard Shortcuts; Rename; Print; ISim's Define Clock, Force, Stimulus Timing, Input / Expected
Value; and the confirmations (top module, PROM erase and program, remove, convert, back-annotate).

## 2. Where the messages go today

| Source | Where it is written |
|---|---|
| Check Syntax, Check Constraints | project Console; errors and warnings also in the Errors / Warnings tabs (it switches to Errors on failure); status bar |
| Synthesis, implementation, bitgen | project Console (streamed), Errors / Warnings; status bar ("Running…", "Loading Yosys… n %"); a toast if one is already running |
| Simulation | the model's build: project Console; the simulator's messages, `$display`, the `ISim>` commands and their answers: **ISim's own console**, in the ISim tab; hints in ISim's status bar |
| Board Emulator | one start line in the project Console; the design's messages in the emulator's **Messages** box (200 lines, 140 px); build errors in an alert |
| Programming (iMPACT) | project Console and a toast ("'1': Programmed successfully." / "Failed — see console") |
| Commands | the command palette (Ctrl K), the `ISim>` line, the menus and the toolbar |

Four places to read (project Console with its Errors / Warnings, ISim's console, the emulator's
Messages, the toasts and status bar) and two to type (the palette, `ISim>`).

## 3. A lab session, in order

From the examples, in the order the course uses them (gates, traffic, blinky, pong, stopwatch, clock,
vga) and `docs/GETTING-STARTED.md`:

1. **Open or create the project**: the Start page, an example or New Project (wizard: board, device,
   language).
2. **Edit**: the HDL editor, or a drawing (gates: a schematic; traffic: a state diagram and a truth
   table; blinky: an ASM chart; pong onwards: Verilog / VHDL modules), New Source for each module.
3. **Check**: Check Syntax, read the errors, fix them (loops with 2).
4. **Test bench**: the Test Bench Wizard (vectors and expected outputs) or an HDL test bench (pong's
   `tb_pong.v`).
5. **Simulate**: run, add signals, move the cursor, read the values, change the design and run again
   (loops with 2–4; the longest task of a session).
6. **Emulate**: the design on the board picture, buttons and switches by hand (pong: two players).
7. **Constraints**: the UCF from the board (I/O Pin Planning, auto-assign), Check Constraints.
8. **Implement**: Implement / Generate Programming File; read the Design Summary (utilization, timing).
9. **Program**: the board on USB, Initialize Chain, Program FPGA (or the PROM to keep it).
10. **Hand in**: Export Silinx Project (.zip).

Screens (the answers in #782): lab desktops (taken here as 1920 × 1080), the students' laptops (1280–1440 ×
768–900) and tablets in both orientations, with touch.

## 4. What each task needs on screen, and what is in the way

Measured in the running app at 1366 × 768 (modern interface), pong open:

| Task | Needs | In the way today |
|---|---|---|
| Edit | the editor, the hierarchy, the errors of the last check | the Processes list (42 % of the left pane) and the View switch while editing; the errors are in a tab of the bottom panel |
| Check | the errors next to the code | Errors is a tab beside Console; the check's output and the errors are two lists |
| Simulate | the waves, as many rows and as wide as possible; the run controls; the values at the cursor | the waves get about **400 × 120 px: five signal rows** of pong's ten. Around them: the left pane (344 px), ISim's own Instances / Objects column (290 px), ISim's console (170 px) and the project console (170 px), with two status bars |
| Simulate (the views) | the test bench | the toolbar's Simulate in the Implementation view simulated **`pong`, not `tb_pong`** ("Building simulation model for top 'pong'"): the test bench only appears in the Simulation view |
| Emulate | the whole board: the LEDs and display and the buttons and switches at once | the board is cut off at the LEDs: **the switches and buttons are below the fold** and need scrolling; the emulator's Messages and Watch are further down; the left pane and the console stay |
| Implement | the steps' progress, then the results: utilization, timing, the bitstream | Implement runs Generate Programming File while the emulator tab stays in front; the result is a line in the console and the Design Summary has to be opened (or found among the tabs) |
| Program | the board's state, the chain, Program FPGA / PROM | iMPACT's fields (tool, cable, file) come before the buttons; the result is a toast and a console line |
| Tablet, portrait (820 × 1180) | the document full width; large touch targets | the Design pane is a drawer that covers the document; the toolbar's steps lose their labels below 1180 px; the menu bar is built for a mouse; the targets are 24–28 px high |

In short: the student reads four message places, the simulator and the emulator get what is left of a
laptop's screen, the Design pane stays when it is not needed, and which view a task needs is not
obvious (a Simulate that does not simulate the test bench).
