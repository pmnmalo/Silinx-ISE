In short:

- **The Tasks interface's Edit task is called Design:** its button, its tooltip and its page; "Design" in
  Portuguese too.

In detail:

- **Tasks: the Design task (#1046):** `TASK_LABEL.edit` is "Design" (its id `edit` kept, for the kept state and the
  documents). In Portuguese it stays "Design", not "Projeto" (the Project menu's, beside it in the header):
  `web/js/i18n.js` keeps a text untranslated inside an element marked `data-i18n-keep="Design"` (the task's button,
  its empty page's heading), and the tooltip pattern ("Design — concluído, sem avisos"). The Design pane and the
  console's Design filter keep "Projeto". Tests: `test/tasks.test.js`, `test/web-i18n.test.js`,
  `test/ui/tasks.test.js` (the labels and tooltips in English and Portuguese).
