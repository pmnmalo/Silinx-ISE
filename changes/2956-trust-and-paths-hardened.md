In short:

- **Security:** an imported project stays untrusted however its files are written or renamed, and however its import
  ends; an ISE project's files land inside the project only.

In detail:

- **Imported projects: their trust and their paths hardened (#2956):** the project's description (silinx.json) is
  recognised by its full Unicode case fold and as the same file on disk, not by its lower case alone, wherever a file
  is written, renamed or deleted (the server's file routes, the MCP tools, the zip import), since a case-insensitive
  file system takes other spellings for the same name; an imported project (a zip, an ISE project) is untrusted from
  its first write, so an import that stops halfway leaves no trusted project; an ISE project's file paths follow the
  import gate's rules for names (no hidden folder, no `build/`); the build copies a source to its path inside the
  project as resolved, under `build/src/`, and checks a drawn source's name for XST's script as an HDL file's; the
  MCP `rename_file` takes a new name by the import gate's rules.
