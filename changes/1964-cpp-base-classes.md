In short:

- **Silinx HLS C++:** base classes (non-virtual), and static objects or arrays of objects whose constructor is not of
  constants: a static object's state is a register set at the reset to what its constructor computes.

In detail:

- Silinx HLS C++: a base class is a member of its own: its members and methods through it, hiding, `A::f()`, upcasts,
  several bases, class templates; a constructor calls the bases' and the members', in C++'s order. A static or global
  object's constructor runs when the source is checked (constants only, said otherwise), its results the initial
  values; arrays of objects, each element's constructor; a method of an element by reference, inlined; a virtual
  function or base still refused (#1964).
