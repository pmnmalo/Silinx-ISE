In short:

- **Karnaugh maps of 3 and 4 variables in 3D:** the 3D box now also rolls a map of 3 variables into a cylinder and
  puts a map of 4 on a torus, so a group across the flat map's edges (its first and last columns, its four corners) is
  seen as one patch. Turn it by dragging or with the arrow keys, and click its cells as on the flat map.

In detail:

- **The Karnaugh map of 3 or 4 variables on a cylinder or a torus (#2925):** the axis of four codes goes round a
  circle, so its first and last cells meet (3 variables: a cylinder; 4: a torus, the surface on which every Karnaugh
  neighbour is a neighbour, which a sphere is not). The seam is in front. Each group is one patch in its colour with
  its outline. The geometry (`core/kmapsurface.js`) is tested without the DOM: two cells share an edge exactly when
  they are Karnaugh neighbours, and every cube's patch is one connected piece over exactly its cells. The view
  (`web/js/tt-kmapsurface.js`) is an SVG drawn farthest face first, with the 3D box's drag, arrow keys, Reset view,
  cell titles, Portuguese, dark theme and print view.
