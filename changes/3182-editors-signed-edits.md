In detail:

- **Shared projects, phase 2a: editors, whose link signs their changes (#3182, part of #3180):**
  - **Roles by keys:** when the owner lets editors in, their side makes a signing key for the room (ECDSA P-256,
    `core/collab-sign.js`). An editor's link carries it: `…#edit=<room>.<key>.<signing key>`, with `.host` when the
    owner's page hosts the room.
  - **Signed edits:** an editor's change is sealed as before and signed. The relay or host forwards it only when the
    signature is the room's (the room's public key comes in the owner's `open`), each sender's edits in their order
    (`core/collab-room.js`). Every participant checks the signature again before applying it, with the room's public
    key from the project's document. A follower's link still only reads, and an edit signed with another room's key
    is refused and applied nowhere. The protocol's version is now 2.
  - **What an editor may change:** the text of an existing HDL, constraints, C / C++ or notes file (`editFile` in
    `core/collab-doc.js`). The text is sent in parts, so that each frame stays within a follower's 64 KB, and no pair
    of surrogates is split. Never a drawing, a new file, the project's settings, or the HDL a drawing generates.
  - **The owner's disk is the truth:** the owner writes an editor's change of a text file to the disk. Anything else an
    editor's page changes is undone for everyone, the project published again from the disk.
  - **The MCP server:** `share_project` with `editors` gives an editor's link besides the follower's, and writes what
    the editors change. `follow_project` with an editor's link takes `write: { path, text }`, merged as one
    participant's edit. Following a project and editing it are two participants, each with its own link.
  - **Next (#3182, phase 2b):** the interface's editor's link, with the text editors bound live to the shared text.
