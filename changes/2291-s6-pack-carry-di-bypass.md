In detail:

- **Spartan-6: a design whose adder's carry input is its own sum input packs (#2291):** the Silinx toolchain's Nexys3
  and Atlys builds of a design such as a loop that takes 10 away while it fits no longer stop at "its pin AX carries
  … and …": the slice's bypass input that carries the carry's input is no longer given to a flip-flop too. Test:
  test/s6-pack.test.js.
