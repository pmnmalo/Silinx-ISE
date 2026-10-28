In detail:

- **The research scripts run from the command line on Windows (#1877):** their check `import.meta.url ===
  file://${process.argv[1]}` never matched a `C:\` path, so `measure.mjs designs` found no designs (its generators wrote
  nothing). The 19 scripts now compare `path.resolve(process.argv[1])` with `fileURLToPath(import.meta.url)`, as
  `scripts/` does. Tests: test/s3e-device.test.js (no research script keeps the old check).
