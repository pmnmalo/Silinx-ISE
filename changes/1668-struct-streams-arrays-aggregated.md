In short:

- **Silinx HLS: streams and arrays of structs as Vitis HLS makes them:** a top function's `hls::stream` of structs is
  one `ap_fifo` of the packed struct, an array of structs one `ap_memory` of packed words, with no warning;
  `#pragma HLS AGGREGATE` / `DISAGGREGATE` and `#pragma HLS INTERFACE bram` are made.

In detail:

- **Silinx HLS: a stream and an array of structs one ap_fifo / one ap_memory of words (#1668):** the members packed in
  their order from the LSB, each of its bits (`compact=bit`, Vitis HLS's default for them), a member array's elements
  one after the other; a pointer to structs indexed too. A struct read from a stream or written to it is one word; an
  element's word is read once while its index and the memory do not change, its members written into it and the word
  written whole (read first when some fields were not written). The co-simulation packs the test bench's words from
  the C's members. `#pragma HLS AGGREGATE compact=bit | byte | none | auto` chooses the packing (of a scalar struct
  argument too), `#pragma HLS DISAGGREGATE` keeps a port, a stream or a memory per member, with no warning; a struct
  with a stream in it is disaggregated without a warning, as Vitis HLS does. A stream of `ap_axis` reads or writes a beat
  in one state (interface-streaming-using-axi-stream-with-side-channel-data: 6-7 cycles instead of 31-34; its `axis`
  ports, `TDATA`, `TKEEP`…, are #1894's); aggregation-of-m-axi-ports 43 cycles instead of 53.
