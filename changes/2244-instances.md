In short:

- **Silinx HLS: an instance a call, FUNCTION_INSTANTIATE and ALLOCATION of a function:** a sub-module (`INLINE off`)
  called several times has an instance for each call, as Vitis HLS makes them; `ALLOCATION instances=f limit=N function`
  limits them to N, and `FUNCTION_INSTANTIATE variable=v` makes a module for each constant `v` the calls give.

In detail:

- **Silinx HLS: a sub-module's instances (#2244):** an `INLINE off` function is instantiated once per call
  (`<function>_U0`, `_U1`, …), as Vitis HLS makes it, where its calls shared one instance; one with a `static` variable
  (in it or in what it calls) keeps one instance, the variable one, as the C's. `ALLOCATION instances=f limit=N function`
  gives the calls N instances at most, in turn (limit=2 was said and made one). `FUNCTION_INSTANTIATE variable=v`
  (accepted and ignored before) makes a module of the function for each constant `v` its calls give, `v` a constant of
  it and its port gone, a call whose `v` is not a constant the module with the port; a name that is no argument, or a
  pointer, array, stream or struct: a warning. Co-simulated in VHDL and Verilog; test/c-instances.test.js.
- **Silinx HLS: a large function kept as a sub-module, behind an option (#2244):** `cToHdl(…, { large: true })` (and
  `cosimulate`'s) makes a function with no pragma that holds a loop of its own (not unrolled whole), called outside any
  loop and any pipelined function, a sub-module, as Vitis HLS keeps a large function; not the default until Vitis HLS's
  modules of the corpus say which functions it keeps.
- **The HLS corpus against Vitis HLS: the modules (#2244):** `scripts/hls-vitis.mjs` records each design's modules,
  Vitis's from `csynth.xml`'s RTL hierarchy (`<RTLDesignHierarchy>`) and Silinx's from its report, into `vitis.json`
  (`modules: [{ module, instance, of }]`), on its next run.
