In short:

- **Share Project… in the Silinx interface:** in the Start page's Project Commands, below Copy Link to Project….
  Who is in a shared project is shown at the right of the top bar, before Search commands and files.

In detail:

- **Share Project… and who is in a shared project, placed for each interface (#3315):**
  - **The Start page's Project Commands** have Share Project…, below Copy Link to Project…, in the editions that share
    (a server's relay, the browser edition), since the Silinx interface has no File menu. Like the exports, it is
    disabled with no project open, and absent while following another's project.
  - **Who is in** (the participants' badges, the Sharing / Following button) is at the Silinx interface's top bar,
    before Search commands and files, and at the ISE style toolbar's right end. It moves when the interface changes.
  - **The ISE style toolbar** has no Split button any more: View ▸ Split Editor splits the editor there.
  - **Tests:** collab (Share Project… from the Start page, who is in at its place in both interfaces and after a change
    of interface, View ▸ Split Editor, Portuguese); projects (the Start page's commands); split-view, tasks, app,
    tab-order, tab-sight (the split from View ▸ Split Editor in the ISE style); interface-parity (the Silinx header's
    Split button, the ISE style's View ▸ Split Editor); the collab tests find who is in wherever it is.
