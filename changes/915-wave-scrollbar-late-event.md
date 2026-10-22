In short:

- **The waveform viewer keeps the whole of a two-finger scroll:** the time's scrollbar, following the view a frame
  later, could take back the gesture's last step (a few pixels of time) when its scroll event came late.

In detail:

- **The waveform viewer's time scrollbar tells its own scrolls from the user's by where it was put (#915):** the view
  counted the scrolls it made and ignored as many scroll events; an event the view had not caused made the count
  drift, and the event of the view's own scroll of a frame before, arriving after a two-finger scroll moved the time
  on, set the time back to the scrollbar's old place (the UI test of #674 found 88 px of a 100 px scroll on a CI run).
  A scroll event that finds the scrollbar where the view last put it is now ignored; the rows' scrollbar needed no
  count (the rows follow it). UI test: test/ui/touch-pan.test.js (the two-finger scroll and a late scroll event in
  one task; the scrollbar moved by the user still scrolls the time).
