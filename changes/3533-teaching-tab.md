In short:

- **A Teaching tab:** the Design pane's row of tabs has a Teaching tab, in both interfaces, with the guided labs and
  the exercises, the project's link, Open from Repository… and Share Project…; it replaces the Start page's Teaching
  box.

In detail:

- **The Teaching tab (#3533):** a page of the side panel after Libraries (`web/js/teaching-page.js`), in the Silinx
  and the ISE style interfaces: Labs and Exercises (Guided Labs…, Exercise…) and Links and Sharing (Copy Link to
  Project…, Open from Repository… where there is git, Share Project… in the editions that share), the same dialogs as
  the Project and File menus, which keep their entries; a project's commands are disabled with none. The Start
  page's Teaching box (#3333) is gone. Portuguese labels; a UI test in both interfaces, on a narrow screen too.
