// New Source in the UI tests: a source type picked, then its wizard opened by the Wizard button of the File Name and
// Location page (#958).

// click the source type `type` (its label) in New Source's list
export const pickSourceType = (page, type) => page.eval((t) => {
  const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => e.lastChild.textContent.trim() === t);
  r.scrollIntoView(); r.click();
}, type);

// the page of New Source shown is `title`
export const waitNewSourcePage = (page, title) => page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [title], { what: `New Source page ${title}` });

// Project ▸ New Source…, the type `type`, Next >, the file name `name`, then Wizard >: the wizard `title` opens at its
// own pages (no page of the name, #2082)
// (labels: { menu, item, dialog, next, wizard, file } in another language; location, lang: those typed on the page)
export async function newSourceWizardOf(page, type, name, title, {
  menu = 'Project', item = 'New Source…', dialog = 'New Source', next = 'Next >', wizard = 'Wizard >', file = 'File Name and Location',
  location = null, lang = null,
} = {}) {
  await page.menu(menu, item);
  await page.waitDialog(dialog);
  await pickSourceType(page, type);
  await page.dialogButton(next);
  await waitNewSourcePage(page, file);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  if (location !== null) await page.fill('.dlg-overlay .wiz-main input[type=text]', location, { index: 1 });
  if (lang !== null) await page.fill('.dlg-overlay .wiz-main select', lang);
  await page.dialogButton(wizard);
  await page.waitDialog(title);
}
