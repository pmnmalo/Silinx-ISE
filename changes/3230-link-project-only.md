In short:

- **Copy Link to Project with "Open the project only"** opens the project with no source in front: the link no longer names a module.

In detail:

- **The project's Copy Link… with Open the project only puts no module in the link (#3230):** it added `&top=` when the Module list's choice was not the project's top (a module chosen, or a project with no top set), and the link then opened that module's source. The Module list is disabled for that choice; Copy Link to This Module… keeps its module (#2871).
