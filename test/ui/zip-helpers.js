// Import Project (.zip)… and Export Project (.zip)… (#3703): their window opened from the File menu, the software
// chosen in it (web/js/project-zip-dialogs.js).
export const FILE = '.dlg-overlay input[data-field=file]', FOLDER = '.dlg-overlay input[data-field=folder]';
const software = (page, id) => page.click(`.dlg-overlay input[data-field=software-${id}]`);

/** Export Project (.zip)… to `id` (silinx, xilinx): the window closed, the download started. */
export async function exportZip(page, id) {
  await page.menu('File', 'Export Project (.zip)…');
  await page.waitDialog('Export Project');
  await software(page, id);
  await page.dialogButton('Export');
  await page.waitNoDialog();
}

/** Import Project (.zip)…'s window, `id` (silinx, xilinx) chosen in it. */
export async function openImport(page, id) {
  await page.menu('File', 'Import Project (.zip)…');
  await page.waitDialog('Import Project');
  await software(page, id);
}
