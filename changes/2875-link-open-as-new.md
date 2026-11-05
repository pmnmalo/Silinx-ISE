In short:

- **Open a link's design beside your own project:** when a link names a project you changed, the question offers a
  third answer, **Open as ALU_2**: the link's design opens in a new project, yours kept as it is.

In detail:

- **Open from a Link: Open as `<name>_N` (#2875):** a project of the link's design's name that differs from it is
  replaced only on Replace (#2826); now the question's first answer, the primary, opens the link's design as a new
  project with the first free suffix (`_2`, `_3`, …; core/design-link.js `freeName`), the student's project kept,
  the link's view and module opened in the new one; Keep Mine and Replace as before. In Portuguese.
