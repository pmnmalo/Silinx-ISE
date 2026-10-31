In detail:

- **The Spartan-3E research flow and C sources (#1966):** `research/s3e-route/open-flow.mjs` adds the module of each C source of the project (Silinx HLS: its HDL made from the C, as the IDE makes it, with no file of its own), so `check:open-flow` takes a project with one, as the example isqrt.
