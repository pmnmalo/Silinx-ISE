In short:

- An open project no longer says "Changed outside Silinx: silinx.json." after a change made in the interface itself.

In detail:

- **The page's own writes not told as another process's (#2913).** The watcher of an open project (#2843) could
  read the folder just before a request of the page wrote to it, the request ending during that read: the read used
  up the request's mark ("what changed is ours") with the folder as it was before the write, and the next look told
  the page's own write as a change made outside Silinx. A request ending during a read now keeps the mark for the next
  look too (`server/project-watch.js`).
  - **Tests:** test/project-watch.test.js (a request ending while the folder is read: nothing told; another process's
    write after it: told).
