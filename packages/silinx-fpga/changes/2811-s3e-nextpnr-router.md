In detail:

- **The Spartan-3E's nextpnr engine: nextpnr-himbaechel-spartan3e 0.20.0, the single-threaded router's fix of #2800
  (#2811).** nextpnr-spartan's PR 11 (d5190e23), the only change since 0.19.0: in a build without threads (the
  WebAssembly build that ships), router2 routed each partition as in the threaded case but kept the search inside it, so
  an arc whose route leaves its partition was given up ("Failed to route arc"); it is now left to the whole-device pass,
  as the threaded build does. The Spartan-6 has had it since 0.1.3. No Spartan-3E example met it with 0.19.0 (the ten
  examples on the four devices, seeds 1 to 8, all routed), so the test guards against it coming back.
  - **Tests:** test/examples-nextpnr-s3e.test.js (new).
