In short:

- **The constraints' checks in the Implementation console:** a UCF's Check Syntax and Check Constraints write their
  messages to the Implementation console, with the rest of the implementation's, not to the Design console.

In detail:

- **A UCF's Check Syntax and Check Constraints: Implementation's lines (#2692):** the message centre gives the
  "Check Constraints" header the Implementation source (it was Design's, since #994); run from the Design task of
  the Tasks interface, its lines are shown and the filter turns to Implementation (as a C module's commands, #2262).
