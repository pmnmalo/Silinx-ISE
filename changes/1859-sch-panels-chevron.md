In detail:

- **The side panels' chevron chosen among constants (#1859):** web/js/sch-panels.js (#1713) put `${CHEVRON[dir]}` in
  its markup, a shape test/web-markup-interpolations.test.js does not know as safe, and the release's CI failed on it;
  the chevron is now `CHEVRON.left` or `CHEVRON.right`, chosen by the side, the same drawing.
