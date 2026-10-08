// Small 16x16 SVG icons in the spirit of the ISE toolbar / tree icons.
const S = (body, vb = '0 0 16 16') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const icons = {
  newProject: S('<path d="M2 4h5l1 1.5h6v8.5H2z" fill="#f4d27a" stroke="#b48a2c"/><path d="M11 1v6M8 4h6" stroke="#2a8a2a" stroke-width="2"/>'),
  open: S('<path d="M1.5 4h5l1 1.5h6v8H1.5z" fill="#f4d27a" stroke="#b48a2c"/><path d="M3 8h12l-2 5.5H1.5z" fill="#fbe7a6" stroke="#b48a2c"/>'),
  save: S('<rect x="2" y="2" width="12" height="12" rx="1" fill="#4a72b8" stroke="#24467e"/><rect x="4.5" y="2.5" width="7" height="4.5" fill="#fff"/><rect x="4" y="9" width="8" height="5" fill="#d9e4f5"/>'),
  saveAll: S('<rect x="4" y="1" width="11" height="11" rx="1" fill="#7f9fd6" stroke="#24467e"/><rect x="1" y="4" width="11" height="11" rx="1" fill="#4a72b8" stroke="#24467e"/><rect x="3.5" y="4.5" width="6" height="4" fill="#fff"/>'),
  undo: S('<path d="M5 3L1.5 6.5 5 10" fill="none" stroke="#2b5797" stroke-width="2"/><path d="M2 6.5h7a4.5 4.5 0 010 9H6" fill="none" stroke="#2b5797" stroke-width="2"/>'),
  redo: S('<path d="M11 3l3.5 3.5L11 10" fill="none" stroke="#2b5797" stroke-width="2"/><path d="M14 6.5H7a4.5 4.5 0 000 9h3" fill="none" stroke="#2b5797" stroke-width="2"/>'),
  cut: S('<circle cx="4.5" cy="12" r="2.3" fill="none" stroke="#333" stroke-width="1.4"/><circle cx="11.5" cy="12" r="2.3" fill="none" stroke="#333" stroke-width="1.4"/><path d="M5.8 10L11 1.5M10.2 10L5 1.5" stroke="#555" stroke-width="1.4"/>'),
  copy: S('<rect x="5" y="1.5" width="9" height="10" fill="#fff" stroke="#555"/><rect x="2" y="4.5" width="9" height="10" fill="#fff" stroke="#555"/>'),
  paste: S('<rect x="2" y="2.5" width="10" height="12" rx="1" fill="#c79a52" stroke="#7a5a26"/><rect x="5" y="1" width="4" height="3" fill="#ddd" stroke="#666"/><rect x="7" y="6" width="7.5" height="9" fill="#fff" stroke="#555"/>'),
  find: S('<circle cx="6.5" cy="6.5" r="4.3" fill="#dff0ff" stroke="#2b5797" stroke-width="1.6"/><path d="M9.6 9.6L14.5 14.5" stroke="#2b5797" stroke-width="2.4"/>'),
  run: S('<path d="M3 2l11 6-11 6z" fill="#21a121" stroke="#0d6b0d"/>'),
  stop: S('<rect x="3" y="3" width="10" height="10" fill="#d33" stroke="#900"/>'),
  schematic: S('<path d="M1 5h4M1 11h4M11 8h4" stroke="#000080"/><path d="M5 3h3.5a5 5 0 010 10H5z" fill="#fffff0" stroke="#000080"/>'),
  wave: S('<rect x="0.5" y="1.5" width="15" height="13" fill="#000"/><path d="M1.5 11h3V5h3v6h3V5h4" fill="none" stroke="#0f0" stroke-width="1.3"/>'),
  sim: S('<rect x="0.5" y="1.5" width="15" height="13" rx="1" fill="#1b2a44"/><path d="M2 10h2.5V5H7v5h2.5V5H12" fill="none" stroke="#0f0"/><path d="M10 9l5 3-5 3z" fill="#2ecc40"/>'),
  chip: S('<rect x="3" y="3" width="10" height="10" fill="#444" stroke="#111"/><path d="M5 1v2M8 1v2M11 1v2M5 13v2M8 13v2M11 13v2M1 5h2M1 8h2M1 11h2M13 5h2M13 8h2M13 11h2" stroke="#888"/><text x="8" y="10.5" font-size="5" fill="#fff" text-anchor="middle" font-family="Arial">X</text>'),
  project: S('<rect x="2" y="1.5" width="12" height="13" fill="#fff" stroke="#556"/><path d="M4 5h8M4 8h8M4 11h5" stroke="#6a8fc8"/><rect x="2" y="1.5" width="12" height="2.5" fill="#6a8fc8"/>'),
  module: S('<rect x="3" y="3" width="10" height="10" fill="#e8f0ff" stroke="#000080"/><path d="M1 6h2M1 10h2M13 8h2" stroke="#000080"/>'),
  moduleTop: S('<rect x="3" y="3" width="10" height="10" fill="#cfe8cf" stroke="#006000"/><path d="M1 6h2M1 10h2M13 8h2" stroke="#006000"/><rect x="5.5" y="5.5" width="5" height="5" fill="#2a2"/>'),
  vhdl: S('<rect x="2" y="1.5" width="12" height="13" fill="#fff" stroke="#556"/><text x="8" y="11" font-size="6.5" text-anchor="middle" fill="#a03000" font-family="Arial" font-weight="bold">VHD</text>'),
  verilog: S('<rect x="2" y="1.5" width="12" height="13" fill="#fff" stroke="#556"/><text x="8" y="11" font-size="7.5" text-anchor="middle" fill="#0050a0" font-family="Arial" font-weight="bold">V</text>'),
  ucf: S('<rect x="2" y="1.5" width="12" height="13" fill="#fff" stroke="#556"/><text x="8" y="11" font-size="6" text-anchor="middle" fill="#606" font-family="Arial" font-weight="bold">UCF</text>'),
  asm: S('<rect x="4" y="1" width="8" height="4" fill="#fff8d0" stroke="#806000"/><path d="M8 5v2" stroke="#806000"/><path d="M8 7l4 2.5-4 2.5-4-2.5z" fill="#e0f0ff" stroke="#004080"/><path d="M8 12v3" stroke="#806000"/>'),
  file: S('<path d="M3 1.5h7l3 3v10H3z" fill="#fff" stroke="#556"/><path d="M10 1.5v3h3" fill="none" stroke="#556"/>'),
  folder: S('<path d="M1.5 3.5h5l1 1.5h7v9h-13z" fill="#f4d27a" stroke="#b48a2c"/>'),
  ok: S('<circle cx="8" cy="8" r="6.5" fill="#2da12d" stroke="#176b17"/><path d="M4.8 8.2l2.2 2.2 4.3-4.6" fill="none" stroke="#fff" stroke-width="1.8"/>'),
  warn: S('<path d="M8 1.5l7 12.5H1z" fill="#f5c400" stroke="#9c7a00"/><path d="M8 5.5v4.2" stroke="#000" stroke-width="1.6"/><circle cx="8" cy="11.8" r=".9"/>'),
  err: S('<circle cx="8" cy="8" r="6.5" fill="#d42020" stroke="#8a0d0d"/><path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" stroke="#fff" stroke-width="1.8"/>'),
  stale: S('<circle cx="8" cy="8" r="6.5" fill="#f0f0f0" stroke="#888"/><text x="8" y="11.5" font-size="9" text-anchor="middle" fill="#c08000" font-family="Arial" font-weight="bold">?</text>'),
  running: S('<circle cx="8" cy="8" r="6" fill="none" stroke="#ccc" stroke-width="2.5"/><path d="M8 2a6 6 0 016 6" fill="none" stroke="#2b7de9" stroke-width="2.5"><animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.9s" repeatCount="indefinite"/></path>'),
  // a runnable process (not a box with a plus: that reads as an expander)
  process: S('<circle cx="8" cy="8" r="6" fill="#e6eefb" stroke="#6b85b6"/><path d="M6.5 5l4 3-4 3z" fill="#3a5f9e"/>'),
  // expanders of the trees: ⊞ collapsed, ⊟ expanded
  expand: S('<rect x="3.5" y="3.5" width="9" height="9" fill="#fff" stroke="#8a8a8a"/><path d="M5.5 8h5M8 5.5v5" stroke="#333"/>'),
  collapse: S('<rect x="3.5" y="3.5" width="9" height="9" fill="#fff" stroke="#8a8a8a"/><path d="M5.5 8h5" stroke="#333"/>'),
  procGroup: S('<path d="M2 4h12v9H2z" fill="#eef3fb" stroke="#6b85b6"/><path d="M2 4l2-2h8l2 2" fill="#dbe5f5" stroke="#6b85b6"/>'),
  report: S('<rect x="2.5" y="1.5" width="11" height="13" fill="#fff" stroke="#556"/><path d="M4.5 10l2-3 2 2 3-4" fill="none" stroke="#2a7" stroke-width="1.3"/>'),
  pins: S('<rect x="4" y="4" width="8" height="8" fill="#333"/><path d="M6 1v3M10 1v3M6 12v3M10 12v3M1 6h3M1 10h3M12 6h3M12 10h3" stroke="#b08000" stroke-width="1.5"/>'),
  impact: S('<rect x="1" y="5" width="6" height="6" fill="#444"/><rect x="9" y="5" width="6" height="6" fill="#444"/><path d="M7 8h2" stroke="#e33" stroke-width="2"/><path d="M4 2v3M12 2v3" stroke="#e33"/>'),
  gear: S('<circle cx="8" cy="8" r="2.5" fill="none" stroke="#555" stroke-width="1.5"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3M3 3l2 2M11 11l2 2M13 3l-2 2M5 11l-2 2" stroke="#555" stroke-width="1.8"/>'),
  help: S('<circle cx="8" cy="8" r="6.5" fill="#2b6fd1" stroke="#15458e"/><text x="8" y="12" font-size="10" text-anchor="middle" fill="#fff" font-family="Georgia" font-weight="bold">?</text>'),
  close: S('<path d="M4 4l8 8M12 4l-8 8" stroke="#555" stroke-width="1.6"/>'),
  template: S('<rect x="2" y="1.5" width="12" height="13" fill="#fff" stroke="#556"/><path d="M4 5h3M4 8h7M4 11h5" stroke="#a03000"/>'),
  summary: S('<rect x="1.5" y="1.5" width="13" height="13" fill="#fff" stroke="#556"/><rect x="1.5" y="1.5" width="13" height="3" fill="#8fb0e0"/><path d="M3.5 7h9M3.5 9.5h9M3.5 12h6" stroke="#999"/>'),
  console: S('<rect x="1" y="2" width="14" height="12" fill="#fff" stroke="#556"/><path d="M3 6l2 2-2 2M7 10h4" stroke="#333" fill="none"/>'),
  up: S('<path d="M8 2l5 6h-3v6H6V8H3z" fill="#4a7bd0" stroke="#24467e"/>'),
  refresh: S('<path d="M13 8a5 5 0 11-1.6-3.7" fill="none" stroke="#2b7a2b" stroke-width="1.8"/><path d="M13.5 1.5v4h-4" fill="none" stroke="#2b7a2b" stroke-width="1.8"/>'),
  add: S('<path d="M8 2v12M2 8h12" stroke="#2a8a2a" stroke-width="2.4"/>'),
  remove: S('<path d="M2 8h12" stroke="#c22" stroke-width="2.4"/>'),
};

export function icon(name) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = icons[name] || icons.file;
  return span;
}
