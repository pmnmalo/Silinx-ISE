In short:

- **Editing a shared project's text files together, live:** Share Project… now gives an editors' link too (Copy Editor
  Link). Whoever opens it edits the project's HDL, constraints, C / C++ and notes files with you, as you all type:
  each one's changes appear in the others' editors at once, and each one's Undo undoes their own. Your page writes the
  merged text to your disk. The drawings stay yours, read only for the editors. The followers see the text editors
  change live too.

In detail:

- **Shared projects, phase 2b: the text files edited live (#3182, part of #3180):**
  - **The binding:** an open text editor is bound to its file's text in the shared document (`web/js/collab-bind.js`,
    through `y-codemirror.next`'s sync). This is so on the owner's page, on an editor's (whose link signs its changes,
    phase 2a), and on a follower's, read only.
  - **Undo:** the others' changes are kept out of an editor's history, so Undo and Redo undo this participant's changes
    only, mapped through everyone else's.
  - **Large changes:** a change that inserts more than 8192 characters (a paste) is made in pieces, so that each frame
    stays within a follower's maximum.
  - **The carets** stay Silinx's own, from each participant's view, in the page's colours, with their names as text.
    `y-codemirror.next`'s remote selections are not used, since they put the colour a participant gives into a style
    attribute.
  - **The owner's page writes an editor's change** of a text file to the disk. Anything else an editor's page changes
    (a file, a drawing, the HDL a drawing generates, the settings) is undone from the disk, with a warning in the
    console.
  - **When an editor arrives,** the owner's console says "Rui edits your project", and the presence's menu shows them
    as an editor.
  - **What is no longer said:** a text file whose open editor shows a change live is neither reloaded nor reported
    again ("Changed by …").
  - **An editor's link** (`…#edit=…`) opens at start-up as a follower's does.
  - `y-codemirror.next` (MIT) is a new dependency (NOTICE, THIRD-PARTY-NOTICES.md, the import map).
