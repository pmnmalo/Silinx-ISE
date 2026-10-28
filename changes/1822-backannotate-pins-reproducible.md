In detail:

- **Back-annotate Pin Locations' tests: the placer's pads reproducible, a failure with its evidence (#1822):** the
  pads the placer chose had changed with the placer, not by chance (its placements are made one after another, the
  faster kept, the first of equal ones; nothing depends on the time); the UI tests already take them from the run
  (#1771, #1840). The open flow's test now builds blinky twice from the same UCF and gets the same pin file, and the
  open mode's UI test, when its dialog disagrees with the run's `build/top_pins.ucf`, prints both and the run's log.
