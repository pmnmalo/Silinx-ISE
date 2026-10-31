In short:

- **Silinx HLS:** a loop that copies a struct with a small member array (`auto tmp = arr[i];`) is pipelined whole,
  as Vitis HLS pipelines it: the corpus's aggregation-of-struct takes 13 cycles, down from 103.

In detail:

- **Silinx HLS: a struct's member array copied a statement each (#2126):** a copy (`a = b;`, `S c = d;`) of a
  member array of 64 elements or fewer is a statement per element, no longer an inner loop, so that the loop
  around it is pipelined automatically (core/c-pipeline.js's rule for a parent of small inner loops); a larger
  member array is still copied in a loop. The corpus's aggregation-of-struct: an II of 1, down from 8 (Vitis HLS 2025.2: 2),
  its latency 13 cycles, down from 103 (Vitis HLS: 24).
