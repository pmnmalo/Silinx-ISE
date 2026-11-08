In short:

- **The 3D Karnaugh map of 3 and 4 inputs:** every cell in view shows its number and value on the cylinder and the
  torus, smaller where the surface is seen at a slant, never beside it. A group's outline on cells hidden behind the
  surface is no longer drawn over the surface in front of them.

In detail:

- **The cells' texts on the 3D map of 3 and 4 inputs (#3119):** a cell's text is shown wherever the cell faces the
  viewer. That is its centre while the centre faces the viewer well, else the part of the cell that does (before, the
  centre's normal had to point at least a quarter towards the screen, which hid cells in plain view: on the torus only
  7, 11 and 14 showed a value). The text is upright and shrinks with the surface's foreshortening. It is drawn after
  its own cell's faces (the cell's nearer faces covered it), only where its box lies on the surface and nothing nearer
  hides it, shrunk or moved within the cell when it does not fit. The 0s of an SOP map stay blank, as on the flat map
  (`core/kmapsurface.js`: labelSpots, textFits, textMatrix, surfaceFrame).
- **The group outlines of the 3D map of 3 and 4 inputs (#3120):** what lies on the faces seen from behind is drawn
  first: on the closed torus such a face is always behind a face seen from the front, and on the open cylinder it is
  the inside. On the torus it is not drawn at all. A sort by depth alone drew, along the silhouette, the outlines of
  hidden groups over the surface in front (the torus's m(4, 5), the cylinder's a.c). An outline segment is drawn after
  the faces round it, so a neighbouring face no longer cuts it into dashes (`core/kmapsurface.js`: paintOrder,
  kmapPatch's `around`). Tests: kmapsurface-view (the groups' cells against the flat map's, the texts' spots, size and
  fit, the order on the torus in six views); ui/tt-kmapsurface-view (the two maps of the issues, in two views).
