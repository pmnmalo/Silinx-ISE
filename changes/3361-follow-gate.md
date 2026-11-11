In short:

- **Following a shared project:** the room's files pass the import gate before the page shows them. A room that grows
  past what a follower takes is left, with an error. The follow dialog of a project the owner's page hosts names the
  public servers it reaches (the trackers, the STUN server).

In detail:

- **A followed room's files through the import gate, its size capped; the public servers named (#3361):** a
  follower's page and the MCP's `follow_project` read every file of the room through the import gate
  (`core/collab-doc.js` `gatedDocFile`: 1 MB, NUL bytes, an HTML page, an XML DTD, the gate's names). A file it
  refuses is not shown, its reason in the console ("WARNING: Follow a shared project: <file>: not shown: <reason>.")
  or the tool's error, and a live editor stays bound to its file only while the file passes. A room whose document
  passes 5000 files or 64 MB (`FOLLOW_LIMITS`, `core/collab-client.js` followRoom `limits`) is left at once, with
  "ERROR: Follow a shared project: the shared project has more files than a follower takes (…)". The follow dialog
  of a room the owner's page hosts names the WebTorrent trackers (with the owner's key in the link) and the STUN
  servers, which see the follower's IP address (`web/js/collab-meet.js` `publicServers`; Portuguese). SECURITY.md
  gains a section on live sharing. Tests: collab (each refusal, the caps), mcp-collab (follow_project's refusals and
  cap), UI collab-follow-gate (a hostile owner's page not shown, the room left with its error; the dialog's servers,
  in Portuguese; both interfaces).
