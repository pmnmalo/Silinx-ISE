In detail:

- **The RTL and Technology Schematic's translation test: a junction dot an object (#3818):** since #3806 a junction dot is
  an object of its own in the read-only schematic views too (clicked, it is selected); test/ui/open-toolchain.test.js's
  #130 test lists it among the objects it clicks (both views), and its texts are translated.
