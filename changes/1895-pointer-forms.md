In short:
- **Silinx HLS: more pointer forms, as Vitis HLS takes them:** a pointer cast to a narrower integer type, a pointer to
  a pointer resolved at compile time, a pointer argument moved by `p += n`.

In detail:
- **Silinx HLS: a pointer cast, a pointer to a pointer, a pointer argument moved (#1895):** a local pointer set to a
  cast to a narrower native integer type (`char *p = (char *)&a[i]`) reads the bytes of the array's elements, from
  their least significant, as on x86 (written through it, said); a pointer to a pointer parameter of a function the
  top calls is resolved at compile time when each call passes `&q` and the function only reads through it; a local
  pointer with one target, not moved, is passed on to a function as its target; a pointer argument moved
  (`p += n`, `p++`, `p = p + n`) has an offset of its own, its indices from its new base. A stream's depth may be a
  named constant (`hls::stream<T, DEPTH>`: it was the default 2, and a DATAFLOW region could wait for ever). AMD's
  modeling-pointers-native-casts, modeling-pointers-using-double and interface-streaming-axi-stream-to-master now
  pass the C simulation, the synthesis and the co-simulation (the last one's AXI4-Stream port still made as FIFOs,
  #1894). The messages of what is refused name Vitis HLS's rule.
