In detail:

- **A hidden task button is not shown (#2595):** the rule hiding the task switcher's button of a task the project's
  tool does not have (#2311) was written inside the task buttons' own rule in web/css/tasks.css, where it read as a
  nested rule that matched nothing; it is a rule of its own again. Test: test/ui/tasks-hidden.test.js.
