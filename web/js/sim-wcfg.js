// The simulator's wave configurations as files of the project (#1019): Save Wave Configuration writes the wave
// window's (web/js/isim-wcfg.js) to a .wcfg file, next to the simulated module's source unless another name is given;
// Load Wave Configuration offers the project's .wcfg files, the module's own first. wcfgFiles(mod) is ISim's opts.wcfg
// (web/js/viewers.js runSimulation); the paths (wcfgPath, wcfgList) are core/wcfg.js's.
import { wcfgList, wcfgPath } from '/core/wcfg.js';
import { api } from './api.js';
import { h, alertDlg, confirmDlg, dialog, promptDlg } from './ui.js';
import { S, moduleInfo } from './app.js';
import { reloadProject } from './project.js';

const SAVE = 'Save Wave Configuration', LOAD = 'Load Wave Configuration';

const projectFiles = () => S.diskTree || S.fileTree || [];

/** ISim's opts.wcfg for a simulation of `mod`: { save(text), load() }. */
export function wcfgFiles(mod) {
  let last = null;   // the file saved or loaded last: offered first
  const dir = () => { const f = moduleInfo(mod)?.file || ''; return f.includes('/') ? f.replace(/\/[^/]*$/, '/') : ''; };
  return {
    async save(text) {
      const v = await promptDlg(SAVE, 'File name in the project:', last || `${dir()}${mod}.wcfg`);
      if (v == null) return null;
      const path = wcfgPath(v);
      if (!path) { await alertDlg(SAVE, `'${v}' is not a valid file name (letters, digits, _ . - and folders; .wcfg).`, 'error'); return null; }
      if (projectFiles().includes(path) && !await confirmDlg(SAVE, `${path} already exists. Overwrite it?`)) return null;
      await api.writeFile(S.project.name, path, text);
      last = path;
      await reloadProject();
      return path;
    },
    async load() {
      const files = wcfgList(projectFiles(), mod);
      if (!files.length) { await alertDlg(LOAD, 'The project has no wave configuration (.wcfg) yet: save one first.'); return null; }
      const sel = h('select', { style: { width: '100%' }, 'data-no-i18n': true }, ...files.map(f => h('option', { value: f }, f)));
      if (last && files.includes(last)) sel.value = last;
      const path = await dialog({ title: LOAD, width: 420, body: h('div', {}, h('label', {}, 'Wave configuration:'), sel),
        buttons: [{ label: 'Load', primary: true, value: () => sel.value }, { label: 'Cancel', value: null }] });
      if (!path) return null;
      const text = await api.readFile(S.project.name, path);
      last = path;
      return { name: path, text };
    },
  };
}
