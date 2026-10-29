// Small helpers the New Source wizards share (#1406; no import: the unit tests load them).

/** A folder of the project as typed (no trailing '/'; empty: src). */
export const cleanLoc = loc => String(loc || 'src').trim().replace(/\/+$/, '') || 'src';
/** A port as the wizards list it: its name and, a bus, its range (count [7:0]). */
export const portText = p => `${p.name}${+p.width > 1 ? ` [${p.width - 1}:0]` : ''}`;
/** The pages of a wizard opened by New Source ▸ Wizard > (#2082): its name page left out (the name and the location
 * were typed on New Source), its checks made by the first page left, before that page's own; `tail()`, the name
 * page's fields that are not the name (a description), at the end of that page. */
export function namedPages(namePage, pages, named, tail = null) {
  if (!named) return pages;
  const [first, ...rest] = pages.filter(p => p !== namePage);
  return [{
    ...first,
    render: tail ? () => { const d = document.createElement('div'); d.append(first.render(), tail()); return d; } : first.render,
    validate: async () => (await namePage.validate()) || (first.validate ? first.validate() : null),
  }, ...rest];
}
