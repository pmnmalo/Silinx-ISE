In detail:

- **The file routes read, rename and delete no hidden file (#3354):** the file's read, the rename's source and new
  name, and the delete refuse a hidden path (`.git`, `.env`), by its name, a short (8.3) name or a symbolic link, as a
  write does (`'.env': not read: hidden file or folder ('.env')`); a folder that holds a hidden file or folder (a
  clone's `.git`) is neither renamed nor deleted (`'sub': not deleted: the folder holds a hidden file or folder
  ('sub/.git')`), through the interface's routes and the MCP's `rename_file` and `delete_file` alike, so a clone's
  untrusted mark (kept in its `.git`) stays. A Mac's `.DS_Store` does not keep a folder.
