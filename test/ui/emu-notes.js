// The Board Emulator's notes in the console (#2718): the lines "Board Emulator: …" after the last one that opened it
// (its design on its board), without their prefix, in their order.

// (in the page)
const notes = () => {
  const lns = [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent);
  const i = lns.findLastIndex((t) => /^Board Emulator: '[^']*' \(/.test(t));
  return i < 0 ? null : lns.slice(i + 1).filter((t) => t.startsWith('Board Emulator: ')).map((t) => t.slice('Board Emulator: '.length));
};

/** The emulator's notes since it last opened (null: not opened). */
export const emuNotes = (page) => page.eval(`(${notes})()`);

/** Waits for a note of the emulator that `re` matches; returns it. */
export async function waitEmuNote(page, re, what = String(re)) {
  return page.waitFor(`((${notes})() || []).find((t) => ${re}.test(t))`, [], { what })
    .catch(async (e) => { throw new Error(`${e.message}: ${JSON.stringify(await emuNotes(page))}`); });
}
