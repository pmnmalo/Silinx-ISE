In detail:

- **mountISim split, seventh part: the rendering in web/js/isim-draw.js (#405):** the drawing of the names column
  and of the wave window (the ruler, the grid, the waves, the markers, the cursor and their delta) moves from
  mountISim to mountDraw(ctx), called at the same point of the mount; the scheduling of a frame stays in mountISim;
  no change in behaviour. Tests: `test/ui/isim-draw.test.js`, the drawing mounted alone on its own canvases.
