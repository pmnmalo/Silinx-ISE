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
whoever has the address with its token has the server, as the warning says at start. On this computer, the
token is in the configuration folder (`~/.silinx`) while the server runs, readable by its owner only: whoever
can read that user's files has the server too.

## What the project does

- The server listens on this computer only (loopback) unless told otherwise, and a token made at every
  start is the only way in, on loopback too (another user of the same computer has none, #2564); it
  checks the Host and Origin headers of every request. The browser a launcher opens is given a one-time code
  (single use, for a minute), which the page exchanges for the token, so that the token is on no command line; a
  second launch opens a server already on its port only when that server proves it holds the token of its file
  (#2955). The token travels in a request's `X-Silinx-Token` header only, never in an address (#3045).
- The pages carry a Content Security Policy with the hashes of their scripts and styles.
- Every path a request names is confined to the project it belongs to; a project's zip is limited in
  size when it is unpacked. A hidden file or folder (`.git`, `.env`, an editor's settings) is no part of a project:
  no file route and no MCP tool reads, writes, renames or deletes one, by its name or through a link (#3035, #3036).
- The programs the toolchain and the board programming run (Docker, ssh, ISE's tools, the programming tools) are
  spawned without a shell. The programs' paths and the arguments given to Docker and ssh come from the user's
  configuration file only: the page cannot change them (the settings `server/toolchain.js` names `FILE_ONLY`, which
  the API refuses unless sent unchanged). The page picks the rest among checked values: the build's mode, the ssh
  machine and its user, the Docker image, and for the programming one of the known tools with its options (a cable, a
  device, a board, a position, the bitstream: `server/programmer-values.js`, no value that starts with `-`); so whoever
  holds the token can send a project's build to an ssh machine of its choosing, the token being the server (Scope).
  An ISE settings script and a Docker image the page chooses are checked: the script is a file outside the projects
  and the build folders, writable only by its owner (root or the user), and Docker never pulls an image Silinx runs. The ISE
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
  and a token that writes reaches only the job that publishes (a release, the npm package, the development
  build, the site), which runs no code of the repository's dependencies: a job that reads builds the files,
  and the publishing job takes them from its artifact; Dependabot proposes an npm version a week after it is
  published. The Docker images' bases are pinned by digest.
- The self-hosted runner with Xilinx ISE (the maintainer's machine) runs only `ise.yml` and `quality.yml`,
  scheduled or started by hand, on `main`, with a read-only token and no credentials kept; never a pull
  request's code. Every workflow's jobs are checked for it in `test/workflows.test.js`; a pull request from
  a fork waits for the maintainer's approval before any of its workflows runs. Its jobs run as a user of their
  own, but that user reaches Docker Desktop's socket (`scripts/ise-runner/install.sh --docker-acl`), and Docker
  Desktop runs as the maintainer: that socket is the runner's real boundary. Code run in those jobs (a dependency of
  `main`'s lockfile, a parser led astray by a design of the corpus) could start a container of its own that mounts
  any folder Docker Desktop shares; Silinx's own `docker run` options protect only its own containers. So the
  machine's Docker Desktop must share only the runner's work and cache folders (Settings ▸ Resources ▸ File sharing),
  never the whole of `/Users`.
- On GitHub, secret scanning and push protection refuse a token or key at push time, and private
  vulnerability reporting is on.

## Files and projects from outside (#2830)

A project's zip, an ISE project (`.xise` and its folder), a design link, a file added to a project, a drawing
(an ISE schematic, a PNML Petri net), a wave configuration, a test bench's data, and whatever the MCP server imports
or writes can come from anyone: a course site, an e-mail, a forum, an assistant led astray by what it read. Silinx
treats them as untrusted, in three layers.

**What such a file must not do:** run a script in the page (a name or a label shown as markup); read or write a
file outside its own project (`..`, an absolute path, a symbolic link, a hidden folder such as `.git` with its hooks);
exhaust the memory or the stack (a zip bomb, a file far larger than it says, a billion-laughs XML, a deeply nested or
endlessly chained source, #2577); read a local file or the network through the XML parser (XXE); replace another
project or the user's settings; or run a program outside the browser's sandbox (ISE, ssh, Docker, programming a
board or a PROM) without the user's say.

1. **One import gate** (`core/import-gate.js`, the same module in the browser and on the server): every outside file
   passes through it before any parser or editor sees it.
   - Sizes: the zip (64 MB), the decompressed total (256 MB), the files (5000), each file (64 MB, a text 16 MB), a
     source's line (1 MB), the nesting of brackets, XML elements and JSON (256), an HDL file's `elsif` / `else if`
     branches (1000). A zip's sizes are checked before each entry is inflated, and inflating stops at the size the
     entry declares.
   - Names: relative to the project, no `..`, absolute path, drive letter, backslash, control character, `< > : " | ?
     *`, hidden file or folder, reserved name (`build/`, `CON`, `NUL`, …), symbolic link, a name that differs from
     another only as a case-insensitive file system reads it (its case, `ſ`, its NFC / NFD form: the server's fold,
     `core/fold-name.js`), or another spelling of `silinx.json` (#3034). A refused entry is never inflated.
   - XML (`.xise`, `.sch`, `.sym`, PNML, `.wcfg`, `.svg`): no DTD and no entity declaration, so no external entity
     and no entity expansion, whatever parser reads it next (Silinx's own XML readers expand none either).
   - Types by extension and content: a text file (a source, a drawing, constraints, a memory's data) that holds a
     NUL byte or is an HTML page is refused; text is read as UTF-8, its invalid bytes replaced with a warning. Any
     other file (a document, an image, a page or a script under its own extension, `.html`, `.js`) is kept as it is,
     opaque, and an `.svg` as XML: Silinx never renders such a file as a page nor runs it (the server sends a file as
     `text/plain`, with `nosniff`).
   - The result: the files accepted, and each refusal with its reason, in the console and in the MCP tools' results.
     A file refused is left out and the import goes on; a bomb refuses the whole import.
2. **Safe output:** what a file names (a module, a port, a label, a comment, a file) reaches the page only as text:
   `textContent`, attributes set through the DOM, SVG text escaped (`web/js/dom.js` `esc`). `test/safe-output.test.js`
   fails on HTML built from a non-constant string that is not among the reviewed sinks (every spelling of a sink, in
   `web/js` and the pages' inline scripts; the SVG and HTML templates of `core/` and `server/` too, #2986), and
   `test/ui/safe-output.test.js` opens every kind of drawing and an HDL source with a payload in each text field. The
   Content Security Policy (`server/csp.js`) runs no inline script but the page's own, by hash, so an injection that
   slipped through still could not run. Its `'unsafe-eval'` is the compiled simulator's (`core/compiled-sim.js`), whose
   generated code holds no name of the design, only its own variables and numbers: the test lists the application's
   only dynamic code.
3. **Trust for outside projects** (`core/trust.js`): an imported project (a zip, an ISE project, a design link, the
   MCP's `import_project`) is marked `trusted: false` in its `silinx.json` from the import's first write (an import that
   stops halfway leaves no trusted project), whatever the zip's own `silinx.json` says; no file route or MCP tool
   writes, renames or deletes `silinx.json`, by any spelling a case-insensitive file system takes for it (#2956), nor do the browser edition's stores and a
   design link (#3034).
   It opens, is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE (Docker, ssh, a local
   install) and programming a board or a PROM are refused (the server's 403, the browser edition's error, the MCP
   tool's) until the user trusts it: the console says so when the project opens, with a **Trust Project** button. A
   bitstream of the workspace named by its path takes its project's trust (#3039), and a bitstream built for another
   device than the project's is not programmed, by the server as by the browser, unless the request forces it (#3040).
   Saving the project's description does not make it trusted; only that button does. The MCP server has no tool to
   trust a project, by design: an assistant led astray by what it read cannot. Nor has it a tool to program a board
   or a PROM; its `run_process` runs the Silinx toolchain, or Xilinx ISE as Toolchain Settings configure it (a local
   install, Docker, ssh) when asked for (`toolchain: 'ise'`), under the same trust gate: an assistant's writes into a
   project the user made, which is trusted, can reach ISE. A project made in Silinx is trusted
   from the start, but for one the MCP server makes (`new_project`, `new_project_from_example`, `open_link` of an
   example): it holds what an assistant writes, so it is untrusted too, its console line and refusals saying it was made
   through the MCP server (#2981).

### A design opened from a link (#2826, #2829)

A link (`…/#design=…`, `#open=example:<name>`, `#open=<zip address>`, with `view=`, `top=`, `board=`) can come from a
slide, an e-mail or a forum post. What it can do: open a design in a project of the user's workspace (a new one, named
after the design) and its view (Try it, the test bench's simulation, the board emulator), all inside the browser.
What it cannot do:

- **Run a script, or carry markup:** its project's name and `top=` / `board=` must be names (letters, digits, `_`,
  `-`), anything else refuses the link; its files go through the import gate above and reach the page as text.
- **Exhaust the memory:** the link's design is at most 64 000 characters, inflated to at most 4 MB (inflating stops
  there) and 400 files; a zip at an address is read to at most 16 MB, then through the gate.
- **Reach this computer or a local network, or send anything:** `open=` takes an `https:` address only, with no user
  name or password, never `localhost`, a loopback, private, link-local or carrier-grade address, an IPv6 local one or
  a `.local` / `.lan` / `.internal` name (also a decimal or hexadecimal address, read as the browser reads it). The
  check reads the host's name, not its DNS: a public name that resolves to a private address passes, but being
  `https:` it cannot reach the local server, which serves plain `http:`. The
  zip is fetched by the browser, never by the local server, only after the user agrees in a dialog that names its
  address, with no cookies and no referrer, and never through a redirect: the address the dialog names is the one
  read (#3042). The MCP server's `open_link` fetches nothing: it opens a design inside
  the link or an example. The link's hash is never sent to a server (a browser sends no hash in a request; the site's page count
  takes the page's path, not its hash), and it is cleared from the address once read.
- **Replace the user's work:** a project of the design's name is opened as it is when its files are the link's; one
  that differs is replaced only when the user chooses Replace (the old one to the workspace's `.trash`, or deleted
  from the browser's storage, as the dialog says); Keep Mine leaves it. The MCP server's `open_link` never replaces
  one. No setting (interface, language, toolchain, MCP folder) is changed by a link.
- **Show the page under another site's:** the Pages site and the single file do not start in another site's frame,
  but say so with a link that opens them in a tab of their own (#3041); the local server's pages refuse a frame by
  their policy (`frame-ancestors 'none'`).
- **Set the local server's token:** only an address whose hash is the token alone (`#token=…`, the one the server
  prints, or the one-time code a launcher opens, `#code=…`) stores it, and a token replaces the one kept only when the
  server accepts it (#2955); a link with other options never sets or replaces it, and the link's fetch never
  carries it.
- **Run anything outside the browser:** opening a link runs no ISE, shell or programmer; Try it, the simulation and
  the emulator run the design in the browser's simulators, which a Stop ends. A project made from a link's design
  or zip (not an example) is an imported one (trust, above): Xilinx ISE and programming a board or a PROM wait for
  its Trust Project.

Privacy: a `#design=` link holds the whole project, its comments too (a student's name in a header): Copy Link…
says so. A broken link, a design that does not decode, a zip that cannot be fetched, or a view the design does not
have is an error in the console, the workspace as it was.
