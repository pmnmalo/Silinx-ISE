In short:

- **The Design Summary and the power report no longer offer Show … Beside.** Their tab's menu and View showed the top
  module's schematic and HDL, without saying which module; the reports cover the whole project.

In detail:

- **No related views for the Design Summary and the power report (#3310).** relatedViews (web/js/related-views.js)
  gives them none: their tab's menu keeps Close, Close Others, Close All, and Move to the Other Side and Close Split when
  the split is open. The RTL / technology schematic, the C model and the waveforms keep their module's views (#2834).
