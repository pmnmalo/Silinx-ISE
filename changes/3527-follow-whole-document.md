In detail:

- **A shared project's limits hold for its whole document (#3527):** a follower (the page, the MCP's `follow_project`)
  counts the document's bytes as the updates arrive (its encoded size, values that are no text and updates waiting for
  others included) against the 64 MB of `FOLLOW_LIMITS`, and leaves a room whose owner sends a part no shared project
  has (a root other than `meta`, `project`, `files`, `drawings`), not applying it, with the exact error. At the
  owner's (the page, the MCP's `share_project`), an editor's edit that changes another part than the files and the
  drawings, builds on changes the owner does not have, or would take the document past the limit is refused before
  it is applied, said as a warning (the share's status for the MCP). What an update changes is read before it is
  applied (`core/collab-roots.js`). SECURITY.md says it. Tests: collab-roots (the roots against applying the update,
  the messages, the meter), collab (a room whose owner sends another root or values that are no text: left, said),
  collab-edit (an editor's edits refused at the owner's, applied nowhere), mcp-collab (`follow_project`,
  `share_project`'s status).
