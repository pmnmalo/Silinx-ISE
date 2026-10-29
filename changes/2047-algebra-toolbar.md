In short:

- The Boolean algebra editor's toolbar no longer says which HDL file the table generates (only when that file is out of
  sync), and its buttons are named "Algebra from Module…" and "Handwritten Algebra…".

In detail:

- **Boolean algebra editor: its toolbar (#2047):** web/js/truthtable.js shows the link to the table's HDL file only
  when the file is not in sync with the table ("Not in sync with …"), the file's name kept in the link's data-hdl.
  "Boolean Algebra from Module…" is now "Algebra from Module…" (its dialog too) and "Handwritten…" "Handwritten
  Algebra…", with their Portuguese labels. Tests: test/ui/truthtable.test.js, test/ui/projects.test.js,
  test/web-i18n.test.js.
