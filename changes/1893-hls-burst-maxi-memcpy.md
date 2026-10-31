In short:
- Silinx HLS: `hls_burst_maxi.h` and `memcpy` on an AXI4 master argument.

In detail:
- Silinx HLS: `hls::burst_maxi<T>` arguments (`hls_burst_maxi.h`): their read and write requests queued and their reads and writes made in turn on the AXI4 master; `memcpy` of an array or a pointer argument a loop of its elements, its pointer casts dropped (#1893).
