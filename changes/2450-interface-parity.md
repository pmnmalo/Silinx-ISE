In short:

- **Add to Project… in the ISE style interface:** Project ▸ Add to Project… adds the project folder's files that are
  not in the project, as the Silinx interface's Files page does.

In detail:

- **Interface parity, a test (#2450):** `test/ui/interface-parity.test.js` collects, in both interfaces, every action a
  user can reach with a project open and each kind of editor open (the menus, the toolbars and their "more" menus, the
  panes' and the editors' context menus, the Processes, the command search) and fails on any difference that is not
  in its allow-list, each entry with its reason; every command of the command search runs in both. The gap it found:
  Add to Project… (#1214) had no way in the ISE style interface, now in the Project menu; iMPACT's folded settings
  button in the Silinx interface says whether they are shown (`aria-expanded`).
