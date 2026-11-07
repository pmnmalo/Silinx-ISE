In detail:

- **The interface's file route writes no hidden file or folder (#3036):** `server/projects.js` writeFile (`PUT
  /api/projects/:p/file`) refuses a path with a hidden segment (`.git/hooks/pre-commit`, `.vscode/tasks.json`), by
  its name or once its symbolic links are followed, with the import gate's message as Rename's (`'.git/hooks/pre-commit':
  not written: hidden file or folder ('.git')`); `build/` stays writable through it, the browser's open synthesis
  saving its netlists in `build/open/` (`web/js/implement.js`).
