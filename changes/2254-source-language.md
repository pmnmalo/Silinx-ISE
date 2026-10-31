In short:

- **Source Properties:** a drawn source's language is now a choice: Project Preferred Language, VHDL or Verilog. The Petri
  net editor's own VHDL/Verilog selector is gone. View Association is gone from Source Properties.

In detail:

- **A drawn source's language in Source Properties (#2254):** a schematic, ASM chart, state diagram, truth table or Petri
  net; its HDL file is made again in that language. Set to VHDL or Verilog, it keeps that language when the project's
  Preferred Language changes; HDL written by hand keeps the language of its file.
- **View Association out of Source Properties (#2255):** a source's association itself is unchanged, set when it is added
  and shown in the Files view.
