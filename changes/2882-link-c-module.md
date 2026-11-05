In detail:

- **Copy Link… and a link's `top=` take a C module (#2882):** a module written in C (Silinx HLS) was refused, "The
  design has no module": core/design-link.js read the design's modules from its HDL and its drawings only. Its C / C++
  sources' modules (their top function's, as the Design pane's) are now among them.
