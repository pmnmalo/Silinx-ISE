// A file system error on a project's file as the server answers it (#3537): its status and a plain message that names
// the file by its path in the project, never Node's own message (which names the server's absolute path), the same in
// the HTTP API and the MCP server (server/projects.js's routes' functions throw it).
import fs from 'node:fs/promises';
import path from 'node:path';

// the first folder of `full`'s path below `dir` that is a file -> its path in the project, or null
async function fileOnTheWay(dir, full) {
  const parts = path.relative(dir, full).split(path.sep);
  for (let i = 1; i < parts.length; i++) {
    const at = path.join(dir, ...parts.slice(0, i));
    let st;
    try { st = await fs.stat(at); } catch { return null; }
    if (!st.isDirectory()) return parts.slice(0, i).join('/');
  }
  return null;
}

/** A Node file system error (`e.code`, `e.syscall`) on `full`, a path in the project's folder `dir` ->
 *  { status, message }, or null for any other error (thrown as it is). */
export async function fsFailure(e, dir, full) {
  if (!e || typeof e.code !== 'string' || !e.syscall) return null;
  const rel = path.relative(dir, full).split(path.sep).join('/');
  switch (e.code) {
    case 'ENOTDIR': case 'EEXIST': {
      const file = await fileOnTheWay(dir, full);
      if (file) return { status: 400, message: `'${file}' is a file, not a folder` };
      return { status: 409, message: `'${rel}' already exists` };
    }
    case 'EISDIR': return { status: 400, message: `'${rel}' is a folder, not a file` };
    case 'ENOENT': return { status: 404, message: `no file or folder '${rel}'` };
    case 'EACCES': case 'EPERM': return { status: 403, message: `'${rel}': permission denied` };
    case 'ENAMETOOLONG': return { status: 400, message: `'${rel}': name too long` };
    case 'ENOSPC': case 'EDQUOT': return { status: 507, message: `'${rel}': no space left on the disk` };
    case 'EROFS': return { status: 403, message: `'${rel}': the disk is read-only` };
    default: return { status: 500, message: `'${rel}': the file system's error ${e.code}` };
  }
}
