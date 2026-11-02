In detail:
- Silinx HLS C simulation and co-simulation: an array parameter given a pointer into an array (a `malloc`'ed buffer, `&a[0][0]`, `a + k`) receives the array's elements from that offset (`memIn` and `memOut`, not a single value in `ptrIn`) (#2592)
