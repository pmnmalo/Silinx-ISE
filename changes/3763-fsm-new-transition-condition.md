In short:

- **State diagrams:** a condition typed in the Properties panel as a transition is drawn is kept, in the generated
  HDL and in Try it.

In detail:

- **A new transition's condition typed in the Properties panel kept (#3763):** the Condition field clicked while the
  transition's text was still open on the drawing lost the focus (the text closed drew the panel anew); and every
  field of the panel kept only its first key, writing to the diagram's objects as they were when the panel was drawn,
  no longer the diagram's after a change. The fields write to the diagram as it is now; a text in place left as it was
  changes nothing, and a field being typed in keeps the focus when the panel is drawn anew.
