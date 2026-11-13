In detail:

- **The markup check reads the boards drawn as the real ones (#3728).** `test/web-markup-interpolations.test.js`
  failed on the Basys 3's and Nexys A7's drawings (#3706) the Spartan-3 / 3A Starter's, Mimas V2's and Cmod S6's (#3745):
  their connectors' helpers (`pmodSide`, `unit`, `expTop`, `pins`, `header40`: numbers, and a name through `text`,
  which escapes it) join the Board Emulator's helpers, a shift (`i >> 1`) counts as a number in a coordinate, the Cmod S6's
  `PIN_X` as `DIG_X`, its `dip` as markup made by a template.
