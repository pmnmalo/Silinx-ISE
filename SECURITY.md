# Security

## Reporting a vulnerability

Report a vulnerability privately, not in a public issue: on GitHub, Security ▸ Report a
vulnerability, at <https://github.com/pmnmalo/Silinx/security/advisories/new>. Say what you
found, how to reproduce it (the version, from Help ▸ About, the edition and how the server was
started) and what it allows. You get an answer within two weeks. A confirmed vulnerability is fixed
in the next release, which names it in [CHANGELOG.md](CHANGELOG.md) once the fix is published.

## Supported versions

The latest release (the zip of the [releases page](https://github.com/pmnmalo/Silinx/releases)
and the Pages site's root) and `main` (the development site, under `dev/`). Older releases are not
patched: update to the latest.

## Scope

In scope: the local server and its API (`server/`), the browser editions (`web/`, the single-file
edition and the Pages site), the open toolchain (`packages/silinx-fpga/`: synthesis with Yosys, pack, place and route with nextpnr, bitgen),
the core (`core/`: the simulators and the board programming), the GitHub workflows (`.github/workflows/`), the scripts
(`scripts/`) and the launchers (`Start Silinx.command`, `Start Silinx.bat`,
`start-silinx.sh`).

Out of scope: Xilinx ISE itself and its Docker image (the project only drives them; report their
problems to their vendors); the user's operating system and browser; a server the user exposed to
other computers with `serve --host 0.0.0.0` (or another address), which the printed token protects:
whoever has the address with its token has the server, as the warning says at start. On this computer, the
token is in the configuration folder (`~/.silinx`) while the server runs, readable by its owner only (the folder
0700 and `config.json` 0600, a folder made before or by hand tightened when the server starts, #3410): whoever can
read that user's files has the server too.

## What the project does

- The server listens on this computer only (loopback) unless told otherwise, and a token made at every
  start is the only way in, on loopback too (another user of the same computer has none, #2564); it
  refuses an API request another site's page made (`Sec-Fetch-Site`), one that changes something from another Origin,
  and, bound to loopback, one whose Host is not local. The browser a launcher opens is given a one-time code
  (single use, for a minute), which the page exchanges for the token, so that the token is on no command line; nor is
  the code: the opener (`open`, `xdg-open`, `start`) is given a page of the configuration folder, readable by its owner
  only and deleted after the code's minute, that leads the browser to the address with its code (#3409); a
  second launch opens a server already on its port only when that server proves it holds the token of its file
  (#2955). The token travels in a request's `X-Silinx-Token` header only, never in a request's address (the printed `#token=` stays in the
  browser, #3045). The MCP server's `share_project` sends it only to the server it belongs to: a loopback address whose
  server proves it holds it, as a second launch asks; a relay on another computer takes its own key (#3181).
- The pages carry a Content Security Policy with the hashes of their scripts and styles.
- Every path a request names is confined to the project it belongs to; a project's zip is limited in
  size when it is unpacked. A hidden file or folder (`.git`, `.env`, an editor's settings) is no part of a project:
  no file route and no MCP tool reads, writes, renames or deletes one, by its name or through a link (#3035, #3036),
  nor by a short (8.3) name that may be one's (`GIT~1`), nor by a path the system resolves to one (#2830); a folder
  that holds one (a clone's `.git`, with its untrusted mark) is neither renamed nor deleted (#3354).
- The programs the toolchain and the board programming run (Docker, ssh, ISE's tools, the programming tools) are
  spawned without a shell. The programs' paths and the arguments given to Docker and ssh come from the user's
  configuration file only: the page cannot change them (the settings `server/toolchain.js` names `FILE_ONLY`, which
  the API refuses unless sent unchanged). The page picks the rest among checked values: the build's mode, the ssh
  machine and its user, the ssh build folder (inside the remote home; an absolute one in the configuration file only), ISE's
  settings script (`settings64.sh` or `settings32.sh`), the Docker image, its memory and platform, and for the programming one of the known tools with its options (a cable, a
  device, a board, a position, the bitstream: `server/programmer-values.js`, no value that starts with `-`); so whoever
  holds the token can send a project's build to an ssh machine of its choosing, the token being the server (Scope).
  An ISE settings script and a Docker image the page chooses are checked: the script is a file outside the projects
  and the build folders (on the ssh machine, every build folder used before too: `ssh.earlierDirs`, which the page cannot
  change; no file named as a settings script is ever copied into a build folder, #3407), writable only by its owner
  (root or the user), and Docker never pulls an image Silinx runs. The ssh port is a port number and the host no option of
  ssh. The ISE
  container runs with no network, no capability, no way to gain privileges and a bound on its processes
  (`--network none --cap-drop ALL --security-opt no-new-privileges --pids-limit`), and a memory limit
  when the configuration sets one (`docker.memory`).
- Git (#3195, `server/git.js`): the system's git is spawned with an argument array, never through a shell, with a
  timeout and no prompt (`GIT_TERMINAL_PROMPT=0`, ssh in batch mode). No hook of a repository runs (`core.hooksPath`
  is an empty folder of Silinx's), nor a repository's fsmonitor; no symbolic link is checked out; only https and ssh
  are allowed (`protocol.allow`), and a remote is github.com's (checked before a clone, a push and a pull: every fetch
  and push URL). A repository's own configuration (a folder that came with its `.git`) holds only the settings a clone,
  Silinx and the usual tools write: one that names a program git would run (a filter, a merge or diff driver, a signing
  program, a credential helper, a remote's helper), a file to include or an address rewritten stops every git command
  in it, the error naming the setting (#3523, `server/git-repo-config.js`). The repository is the project's folder or the workspace, never one above it
  (`GIT_CEILING_DIRECTORIES`), and every command is limited to the project's folder. The credentials are the system's
  credential helper's: Silinx never asks for, stores or logs one (an error's URLs lose their `user:password@`). A
  cloned project passes the import gate and is untrusted (#2830); its hidden files (`.vscode`, `.envrc`, `.gitattributes`,
  `.github`; not `.git` nor the `.gitignore`) stay in the repository, out of the project's folder (git's sparse checkout),
  and a commit leaves them as they are (#3359). A pull's files go through the import gate too: a hidden file, a tool's
  output or another spelling of `silinx.json` stays out of the folder (in the repository, untouched by a commit), with a
  warning each, and another file the gate refuses pulls nothing, as does a name another tracked file has but for its case
  (one file on a case-insensitive file system, #3524). An untrusted project in a repository keeps its mark in
  the repository's `.git`, never in what git tracks, so that no pull or merge trusts it whatever the pulled `silinx.json`
  says; a project a pull brings into the workspace's repository is untrusted. On a hosted server git uses the server
  account's credentials: `SILINX_GIT=off` turns git off.
- Git in the browser edition (#3196, `core/git-rest.js`, `web/js/git-browser.js`): no git, GitHub's REST API only
  (api.github.com, which the page's Content-Security-Policy allows). The sign-in is OAuth's device flow with the public
  client ID of Silinx's GitHub OAuth App and no secret, through Silinx's relay (`relay/github-device-flow`, a Cloudflare
  Worker: only the device flow's two POSTs, with only their own fields, only Silinx's origins, nothing kept nor
  logged; the page's policy allows its origin), or, with no relay, a fine-grained personal access token the user pastes
  (checked with GitHub's API before it is kept, never shown again). The device flow asks for the narrowest scope that
  works, `public_repo gist` (the public repositories, the gists of Copy Link's short links); the user's private
  repositories (a Classroom assignment's) only when they tick them at the sign-in, which asks for `repo gist`: an OAuth
  App has no scope for a single private repository, which only a fine-grained token (the pasted way) limits to the
  repositories chosen (#3356). Its token is kept in the user's browser only, sent only to GitHub's API in the
  `Authorization` header, never in a URL nor in a message; Sign out of GitHub forgets it. Where it is kept is the
  trade-off (#3356): the site is served from `pmnmalo.github.io`, an origin that every GitHub Pages site of the account
  shares (the development build's `dev/` too), and a page of that origin reads its storage. The sign-in dialog's **Remember me in this browser**,
  ticked by default (the maintainer's choice: a student signs in once), keeps the token in `localStorage` (kept across
  sessions, readable by any page of the origin, as its label says); unticked, the token is kept in the tab's
  `sessionStorage` only (forgotten when the tab closes, read only by a page of the origin loaded in that same tab); each edition has its own key (`silinx.github-token`, the development site's `silinx.dev.github-token`).
  The single file opened from the disk (`Silinx.html` at a `file:` address) never remembers it (#3530): in Chrome every
  page opened from the disk shares that one origin and its `localStorage`, so there Remember me is unticked and disabled
  (its tip says why), the token is kept in the tab's `sessionStorage` only, and a token left in `localStorage` is not read.
  A key is no boundary between pages of one origin, so the remaining exposure is the account's other Pages sites,
  which are the maintainer's; an origin of its own (a custom domain) would remove it. A repository's address is checked as the server's (github.com's only), the sign-in page linked is github.com's
  only, and an opened or pulled file passes the import gate; the repository's hidden and binary files stay on GitHub,
  never run nor deleted. A cloned project is untrusted (#2830). A commit moves its branch only forward (never forced).
  On a server, `SILINX_GIT=github` (`server/git-github.js`) uses the same back end with the environment's token
  (`GH_TOKEN`), never stored nor logged; what a project was at its last commit is kept in Silinx's configuration
  folder, out of the workspace, so that the MCP's file tools cannot point its commits at another repository.
- The MCP server's outbound channels (#3363): an assistant led astray by what it read must not send a project where it
  chooses. `git_init` sets a project's remote only to a GitHub repository the user's configuration file names
  (`mcp.remotes`: `owner/repo` or `owner/*`), so `git_push` reaches only a remote the user set, one a clone came from,
  or one of that list. `share_project` and `follow_project` connect only to the Silinx server of this computer
  (loopback) or to a relay the configuration file names (`relay.relays`), never to another host, a private or local
  address included. Both lists are `FILE_ONLY` settings: the page cannot change them. A tool's result that holds a
  project's or a remote's text (`read_file`, `find_in_project`, `git_log`, `git_diff`, `git_checks`, `get_report`, the import's, `import_source`'s and a clone's
  warnings, `follow_project`'s files and names, `share_project`'s followers and warnings, `open_link`'s design,
  `project_info`, a project's own lab in `lab`, the lines a design prints in `simulate`, and every tool's error, #3528;
  a failed `check_syntax`'s, a `simulate` that did not start, a failed `run_process`, a `verify` that failed or could
  not run, and a failed `c_simulation`, `c_cosimulation` or `c_synthesis_report`, whose lines quote the design's
  names, #3681)
  is labelled "Untrusted content" after its text, and `untrusted` in its structured content: data, never instructions.
  `open_link` takes a design's own board and top only as names, as the link's `board=` and `top=` are.
- What the MCP server tells an assistant of the user's folders (#3412, #3418): its results and errors name the
  workspace and the exchange folder `<workspace>` and `<exchange folder>`, never their absolute paths (the user's name,
  their folders); a file of `build/` it reads is redacted as a report is (the ISE machine's address); and its
  `import_project` never takes the exchange folder as a whole (by default the user's Downloads: a `.xise` at its root,
  or the folder itself), only a project's own folder in it.
- A short link (#3223, `core/gist-link.js`): the project is encrypted where the link is made (AES-GCM, a random
  256-bit key and 96-bit IV each time) and saved as a secret gist of the user's account; the key is only in the link's
  fragment, which a browser never sends, so GitHub keeps only the ciphertext. Opening it reads the gist through GitHub's
  API with no credentials (GitHub's answer read to a cap before it is parsed, #3362), checks it is a Silinx link's, decrypts it (a wrong key or a changed gist refused by AES-GCM's
  tag) and imports it as a design link: the same import gate and limits. A secret gist is unlisted, not private:
  anyone with the link opens the project, as with the full link. Its expiry (#3629) is kept beside the ciphertext and
  authenticated with it (AES-GCM's additional data: a date changed, the key no longer opens it), and in the gist's
  description, so that making a short link deletes the user's expired Silinx gists without their keys (only gists
  whose description and single file are Silinx's). An expired link is refused by Silinx, but its gist stays on GitHub
  until it is deleted: anyone who kept the link and the gist could still decrypt it by hand. Short Links… (#3635) lists
  and deletes only those gists of the account; the links this browser made (with their keys) are kept where its
  sign-in is (localStorage; at `file:`, the tab only), never sent anywhere.
- At every release, CI scans for private data (e-mail addresses, computer names, network addresses and
  paths, keys and tokens, Xilinx files, a bitstream under any name) the tracked files, text, compressed
  and binary, and every line, binary file and commit message, author and committer ever added to `main` (#3366); CodeQL analyses
  the JavaScript nightly and at every release; Dependabot's alerts report a dependency with a known
  vulnerability, and Dependabot updates the dependencies weekly and opens security updates at once.
  Before every push, `node scripts/check-private-data.mjs` checks the tracked files.
- Every release lists its files' SHA-256 checksums (`SHA256SUMS`, also in its notes) and carries GitHub's
  build provenance attestation of each file: how to check a download is in the README and
  [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md).
- The workflows install the dependencies without their install scripts, their checkouts keep no credentials,
  and a token that writes reaches only the job that publishes (a release, the npm package, the development
  build, the site), which runs no code of the repository's dependencies: a job that reads builds the files,
  and the publishing job takes them from its artifact; Dependabot proposes an npm version, an action's release and a
  Docker image's digest a week after it is published. The Docker images' bases are pinned by digest.
- The self-hosted runner with Xilinx ISE (the maintainer's machine) runs only `ise.yml` and `quality.yml`,
  scheduled or started by hand, on `main`, with a read-only token and no credentials kept; never a pull
  request's code. Every workflow's jobs are checked for it in `test/workflows.test.js` and `test/ise-runner.test.js`; a pull request from
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
   - Names: relative to the project, no `..`, absolute path, drive letter, backslash, control character, invisible
     or direction character (zero-width, bidi override, #3414), `< > : " | ? *`, hidden file or folder, reserved name
     (`build/`, `CON`, `NUL`, `COM¹`, `__proto__`, …), symbolic link, a name that differs from
     another only as a case-insensitive file system reads it (its case, `ſ`, its NFC / NFD form: the server's fold,
     `core/fold-name.js`), or another spelling of `silinx.json` (#3034). A refused entry is never inflated. The same
     rules hold for a file the server writes (`PUT /projects/:p/file`, #3414) and for the paths an imported
     `silinx.json` names (its files, its constraints: never `silinx.json` itself, which updating the constraints would
     overwrite, #3411).
   - XML (`.xise`, `.sch`, `.sym`, PNML, `.wcfg`, `.svg`): valid UTF-8, declared so or not at all (#3414), with no DTD
     and no entity declaration, so no external entity and no entity expansion, whatever parser reads it next (Silinx's
     own XML readers expand none either).
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
   bitstream of the workspace named by its path takes its project's trust (#3039), also when named in another case on a
   case-insensitive file system (#3358), and a bitstream built for another device than the project's is not
   programmed, by the server as by the browser, unless the request forces it (#3040).
   Saving the project's description does not make it trusted; only that button does. The MCP server has no tool to
   trust a project, by design: an assistant led astray by what it read cannot. Nor has it a tool to program a board
   or a PROM; its `run_process` runs the Silinx toolchain, or Xilinx ISE as Toolchain Settings configure it (a local
   install, Docker, ssh) when asked for (`toolchain: 'ise'`), under the same trust gate: an assistant's writes into a
   project the user made, which is trusted, can reach ISE. A project made in Silinx is trusted
   from the start, but for one the MCP server makes (`new_project`, `new_project_from_example`, `open_link` of an
   example): it holds what an assistant writes, so it is untrusted too, its console line and refusals saying it was made
   through the MCP server (#2981).

### A project shared live (#3181, #3182, #3183, #3355)

Share Project… (and the MCP's `share_project`) shares a project through a relay or the owner's page (#3227), end-to-end encrypted with a key in the
link's fragment: the relay sees no file. A follower's link reads only. An editor's link writes too: its holder changes
the text of the project's text files (HDL, constraints, C / C++, notes) and its drawings (#3183: their states and
transitions, a table's outputs and cells, merged per field into the drawing's structure, `core/collab-model.js`), signed with the link's key; anything
else an editor changes (another drawing, the project's settings, a new file) is undone from the owner's disk. An editor's link is a
bearer capability that can be forwarded, so what it writes is a file from outside: at the owner's, each change passes
the import gate (`core/collab-doc.js` `gateEdit`; a drawing as its normalized JSON, its HDL generated by the
owner's Silinx from it, never taken from the editor) before it is written, what the gate refuses is not written (a
warning says why), and the project is marked untrusted before the first change is written (`madeBy: "editor"`): Xilinx ISE and
programming a board or a PROM are refused for it, its messages saying an editor changed it, until the user trusts it
again with Trust Project; a later change untrusts it again. A project followed is not copied into the follower's
workspace.

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
  one that carries an IPv4 address (Teredo, 6to4, NAT64), a `.local` / `.lan` / `.internal` / `.corp` / `.svc` name or
  one that never resolves (`.test`, `.invalid`, `.example`), a single label, or a name with an empty label (also a
  decimal or hexadecimal address, read as the browser reads it, and a name with its trailing dots, #3415). Another
  internal name, under a suffix not listed here, is not recognised as one: the dialog names the address for the user to judge. The
  check reads the host's name, not its DNS: a public name that resolves to a private address passes, but being
  `https:` it cannot reach the local server, which serves plain `http:`. The
  zip is fetched by the browser, never by the local server, only after the user agrees in a dialog that names its
  address, with no cookies and no referrer, and never through a redirect: the address the dialog names is the one
  read (#3042). The MCP server's `open_link` fetches nothing: it opens a design inside
  the link or an example. The link's hash is never sent to a server (a browser sends no hash in a request; the site's page count
  takes the page's path, not its hash), and it is cleared from the address once read.
- **Save the user's work unasked:** a link given to a Silinx already running (its address's hash changed, which another
  page holding its window can do) saves the open documents only once the link is read and agreed to: a hash that is
  no link, or a broken one, saves nothing; a document with changes not saved yet is saved only when the user says so
  (Save and Open), or once the user agrees to fetch a zip (#3362). A link's files pass the import gate before any of
  its HDL is compiled or its drawings read (the HDL a drawing makes again: from the files the gate passed, then gated).
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

### Live sharing (#3181, #3182, #3227, #3361)

Share Project… (and the MCP's `share_project`) shares the open project live; anyone with its link follows it.

- **The relay** (`server/collab-relay.js`, `core/collab-room.js`): the Silinx server that serves the page, or another
  Silinx's relay named in the link. It reads nothing of the project: every message is sealed with a key that is only in
  the link's fragment (AES-GCM, `core/collab-crypto.js`), which a browser never sends. Opening a room takes the server's
  token (or a relay's key); joining one, its id. It forwards only the owner's updates (a follower's are refused) and,
  when the owner lets editors in, an editor's edits signed with the room's key (`core/collab-sign.js`). A follower's presence (who they are, what they look at) goes through marked with the client id it joined with, so it
  speaks for that follower only, never for the owner nor another (#3360). What a join asks for (the whole document,
  who is in) goes to the follower that joined only (#3529): joining and leaving again multiplies nobody else's
  download. Its limits: a
  follower's message 64 KB, the owner's 16 MB, followers per room, rooms per server.
- **A room the owner's page hosts** (the browser edition, `#follow=….host`): the followers reach it over WebRTC. With
  the owner's key in the link, the follower's page looks for the owner at a public meeting point: Trystero's WebTorrent
  trackers (`core/collab-meet.js` `TRACKERS`), and the owner proves itself with a signature only it can make. Without
  it, the codes are exchanged by hand. Either way a STUN server (`stun.l.google.com`, or this browser's own list)
  finds the connection's addresses. Those servers see the follower's IP address, so the follow dialog names them
  before anything is sent.
- **A follower** receives the project read only, and nothing it does changes the owner's. The owner may be anyone who
  sent the link, so everything the room shows passes the import gate first (`core/collab-doc.js` `gatedDocFile`):
  each file's size (1 MB), NUL bytes, an HTML page, an XML DTD. A file refused is not shown, and the console gives
  its reason; the MCP's `follow_project` refuses it the same way. A room whose document passes 5000 files or 64 MB
  or 100,000 drawing objects (`FOLLOW_LIMITS`) is left at once, with an error in the console. The 64 MB holds for the
  whole document (#3527): its encoded size, whatever it holds (values that are no text, updates waiting for others),
  counted as the updates arrive; an update that adds a part no shared project has (a root other than `meta`,
  `project`, `files`, `drawings`: `core/collab-roots.js`) is not applied, and the room is left. Nothing a follower receives is written to the
  disk.
- **An editor** (an editor's link, `#edit=…`) changes the project's text files and drawings. At the owner's, an edit
  that changes another part of the document (the project's settings, its meta, a root of its own), builds on changes
  the owner does not have, or would take the document past 64 MB is refused before it is applied, said as a warning
  (#3527); each change passes the
  import gate before it is written. The first one makes a trusted project untrusted (#3355): Xilinx ISE and the board
  wait for the user's Trust Project.
