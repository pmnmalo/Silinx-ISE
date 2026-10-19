In detail:

- **The vga example's model tests lighter (#566):** the post-synthesis models' test benches run with no
  waveforms (vga's took gigabytes, about 13 minutes of a Linux unit shard), and vga's post-place & route test
  runs its VHDL and Verilog models in two files that run alongside each other (19 minutes in one file).
