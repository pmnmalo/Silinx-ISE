In short:

- **Truth tables:** the 3D Karnaugh map no longer runs out of the page or over the list of groups, however it is turned.

In detail:

- **The 3D Karnaugh map holds its place (#2206):** its scene is sized to the whole stack at any rotation
  (`kmapSceneSide`, the projection of the sphere around it) rather than to one flat layer, so turning it moves
  nothing beside it, and the list of groups goes beside it or below it.
