In short:

- On a tablet, holding a push button of the Board Emulator keeps it pressed: the long press no longer opens the
  context menu.

In detail:

- **The Board Emulator on a tablet (#1985):** no context menu over the emulated board (a long press is one, and it
  released a push button held down); its buttons take the touch themselves (`touch-action: none`), and the board shows
  no text selection or touch callout.
