In short:

- **ASM charts: a long chain of decisions.** A chart whose decisions' branches meet again at the next decision (2^n
  paths) is checked, simulated and turned into VHDL and Verilog in a moment, a thousand decisions too; 30 of them ran out
  of memory.

In detail:

- **ASM charts: a state's decisions walked once each (#3554).** The validation and the generators walked a block's
  decisions as a tree: where both branches of a decision reached the same next box, that box was walked once per path,
  so a chain of n decisions took 2^n steps (16: 0.9 s, 30: out of memory, in the validation). The walk now shares a
  subtree reached again (core/asm.js `sharedWalk`; a subtree with a loop, an error, is walked again on each path for
  20000 boxes, then shared too), keeps its own stack, and every walk of the trees (`treeParts`, `treeNodes`, the
  counts) takes each subtree once; the join points (where a decision's branches meet again) are the immediate
  post-dominators found by intersection, not from sets of post-dominators. A chart is generated as before while a
  state's tree written out has 1024 boxes at most (the repository's charts, byte-identical); past it, its decisions'
  branches are written up to where they meet again and the boxes after once, as the every-cycle blocks already were, a
  state's logic 200000 statements at most ("State 'A': its logic takes more than 200000 statements, too many to
  generate"). The header lists a block's paths up to 256 of them, and counts them past it; `extractTransitions`,
  `extractAlwaysBlocks` and the conversion to a state diagram refuse more than 4096 paths, saying how many ("the state
  A has 1073741824 paths through its decisions, more than 4096 transitions for a state diagram"), and the conversion no
  longer takes a chain of more than 200 boxes for a loop. A chain of 1000 decisions: validated and generated in about
  0.3 s.
