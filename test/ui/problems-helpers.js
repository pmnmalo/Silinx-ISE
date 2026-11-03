// A drawing's problems in the console (#2718): its file's entries of the Errors and Warnings tabs (its notes too, in
// Warnings), as "<severity>: <message>" in their order (the errors first); and a click on one of them.

// (in the page: the entries of `f`, as "error: …", "warning: …", "info: …")
const entries = (f) => [...document.querySelectorAll('#console-errors .diag, #console-warnings .diag')]
  .filter((d) => d.querySelector('.loc')?.textContent === `"${f}"`)
  .map((d) => `${/^(\w+):/.exec(d.querySelector('.loc').previousElementSibling.textContent)[1].toLowerCase()}: ${d.querySelector('.loc').nextElementSibling.textContent.replace(/^: /, '')}`);

/** The problems of the drawing `file` in the console's tabs. */
export const problems = (page, file) => page.eval(`(${entries})(${JSON.stringify(file)})`);

/** Waits for the drawing `file`'s problems to be `want`. */
export async function waitProblems(page, file, want, what = 'its problems') {
  await page.waitFor(`JSON.stringify((${entries})(${JSON.stringify(file)})) === ${JSON.stringify(JSON.stringify(want))}`, [], { what })
    .catch(async (e) => { throw new Error(`${e.message}: ${JSON.stringify(await problems(page, file))}`); });
}

/** Clicks the console's entry of the drawing `file` whose message has `text`. */
export const clickProblem = (page, file, text) => page.eval((f, t) => {
  const d = [...document.querySelectorAll('#console-errors .diag, #console-warnings .diag')]
    .find((x) => x.querySelector('.loc')?.textContent === `"${f}"` && x.textContent.includes(t));
  d.click();
}, file, text);

/** Nothing of a problems panel left in the document in front. */
export const panelGone = (page) => page.eval(() => !document.querySelector('.doc:not([hidden]) .asm-problems, .doc:not([hidden]) .asm-prob, .doc:not([hidden]) .fsm-problems'));
