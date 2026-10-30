In detail:

- **The remote scripts' ssh does not hang (#2019):** scripts/hls-vitis.mjs, scripts/check-open-flow.mjs,
  research/synth-quality/fsm-ise.mjs and test/designs-corpus/compare-ise.mjs give every ssh and rsync
  `ServerAliveInterval=30`, `ServerAliveCountMax=4` and `ConnectTimeout=30`: a connection that drops silently fails
  within about 2 minutes. Test: test/ssh-keepalive.test.js.
