In short:

- **Silinx HLS makes `BIND_STORAGE impl=` and `ARRAY_RESHAPE`, and explains `STREAM`:** a memory in LUTs, block RAM or
  registers, a reshaped local array, and a warning saying why for what it cannot make.

In detail:

- **`BIND_STORAGE impl=`, `ARRAY_RESHAPE`, `STREAM` (#1961):** `impl=lutram` and `bram` set the tools' `ram_style` or
  `rom_style`, and `register` makes no memory; `uram`, `srl` and `latency=` warn, as does `impl=` on an argument. `ARRAY_RESHAPE` of a local array is made as a
  partition, with its accesses at once, and says so; of an argument it warns and keeps the port. `STREAM` warns outside a
  DATAFLOW region, on an array that stays a buffer, and for `type=shared` or `unsync`.
