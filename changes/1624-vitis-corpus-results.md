In short:
- Silinx HLS's corpus compared with AMD Vitis HLS 2025.2: the table in test/hls-corpus/README.md.

In detail:
- Silinx HLS: the first full run of the HLS corpus (73 designs) through Vitis HLS 2025.2 on an Artix-7 (`scripts/hls-vitis.mjs`). The results are in `test/hls-corpus/vitis.json` and the corpus README's table: numbers and port names only. Vitis passes the C simulation on 72 designs and Silinx on 51; Silinx's ports are the same as Vitis's on 12 designs (#1624).
