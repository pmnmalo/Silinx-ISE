# Security

## Reporting a vulnerability

Report a vulnerability privately, not in a public issue: on GitHub, Security ▸ Report a
vulnerability, at <https://github.com/pmnmalo/Silinx-ISE/security/advisories/new>. Say what you
found, how to reproduce it (the version, from Help ▸ About, the edition and how the server was
started) and what it allows. You get an answer within two weeks. A confirmed vulnerability is fixed
in the next release, which names it in [CHANGELOG.md](CHANGELOG.md) once the fix is published.

## Supported versions

The latest release (the zip of the [releases page](https://github.com/pmnmalo/Silinx-ISE/releases)
and the Pages site's root) and `main` (the development site, under `dev/`). Older releases are not
patched: update to the latest.

## Scope

In scope: the local server and its API (`server/`), the browser editions (`web/`, the single-file
edition and the Pages site), the open toolchain (`packages/silinx-fpga/`: synthesis, pack, place, route, bitgen),
the core (`core/`: the simulators and the board programming), the GitHub workflows (`.github/workflows/`), the scripts
(`scripts/`) and the launchers (`Start Silinx-ISE.command`, `Start Silinx-ISE.bat`,
`start-silinx-ise.sh`).

Out of scope: Xilinx ISE itself and its Docker image (the project only drives them; report their
problems to their vendors); the user's operating system and browser; a server the user exposed to
other computers with `serve --host 0.0.0.0` (or another address), which the printed token protects:
whoever has the address with its token has the server, as the warning says at start.

## What the project does

- The server listens on this computer only (loopback) unless told otherwise, and then a token made
  at every start is the only way in; it checks the Host and Origin headers of every request.
- The pages carry a Content Security Policy with the hashes of their scripts and styles.
- Every path a request names is confined to the project it belongs to; a project's zip is limited in
  size when it is unpacked.
- The programs the toolchain runs (Docker, ssh, ISE's tools) are spawned without a shell, and the
  settings that choose which program runs, and with what arguments, are read from the user's
  configuration file only, never from the page. The ISE settings script and the Docker image the
  page may choose are checked: the script is a file outside the projects and the build folders,
  writable only by its owner (root or the user), and Docker never pulls an image Silinx runs. The ISE
  container runs with no network, no capability, no way to gain privileges and a bound on its processes
  (`--network none --cap-drop ALL --security-opt no-new-privileges --pids-limit`), and a memory limit
  when the configuration sets one (`docker.memory`).
- At every release, CI scans for private data (e-mail addresses, computer names, network addresses and
  paths, keys and tokens, Xilinx files, a bitstream under any name) the tracked files, text, compressed
  and binary, and every line ever added to `main`; CodeQL analyses
  the JavaScript nightly and at every release; Dependabot's alerts report a dependency with a known
  vulnerability, and Dependabot updates the dependencies weekly and opens security updates at once.
  Before every push, `node scripts/check-private-data.mjs` checks the tracked files.
- Every release lists its files' SHA-256 checksums (`SHA256SUMS`, also in its notes) and carries GitHub's
  build provenance attestation of each file: how to check a download is in the README and
  [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md).
- The workflows install the dependencies without their install scripts, their checkouts keep no credentials,
  and a token reaches only the step that publishes (a release, the development build, the site); Dependabot
  proposes an npm version a week after it is published.
- The self-hosted runner with Xilinx ISE (the maintainer's machine) runs only `ise.yml` and `quality.yml`,
  scheduled or started by hand, on `main`, with a read-only token and no credentials kept; never a pull
  request's code. Every workflow's jobs are checked for it in `test/workflows.test.js`; a pull request from
  a fork waits for the maintainer's approval before any of its workflows runs.
- On GitHub, secret scanning and push protection refuse a token or key at push time, and private
  vulnerability reporting is on.
