// Helpers of the language test: visible UI text of the page, English vs Portuguese.

/** Installs window.__uiTexts(root): the visible text nodes and title / placeholder attributes
 *  that the i18n module translates (the same parts it leaves alone are skipped). */
export const TEXTS = `window.__uiTexts = (root = document.body) => {
  const SKIP = '.CodeMirror, .console-page, pre, code, textarea, [data-no-i18n], #hier .lbl, #libs-page .lbl, svg, .sch-svg, .xl-hover-tip, .CodeMirror-hints, script, style, .toasts';
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    { acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 3) {
      const t = n.nodeValue.trim();
      const p = n.parentElement;
      if (t && (p.tagName === 'OPTION' || p.getClientRects().length)) out.push(t);
    } else for (const a of ['title', 'placeholder']) if (n.hasAttribute(a) && n.getAttribute(a).trim()) out.push('@' + n.getAttribute(a).trim());
  }
  return out;
};`;

// Text that is the same in both languages: names, codes, units, product names, file names…
const SAME = [
  /^[^A-Za-z]*$/,                                  // numbers, symbols
  /^@?[^a-z]*$/,                                   // ALL CAPS codes (VHDL, LVCMOS33, XC3S250E, CP132…)
  /^@?(Silinx|ISE|ISim|iMPACT|XST|VHDL|Verilog|Spartan|Virtex|Artix|Kintex|Zynq|Digilent|Basys|Nexys|Xilinx|GitHub|Docker|SSH|Claude|Anthropic|Pedro|AMD|Pmod|JTAG|CCLK|OK|UCF|HDL|RTL|ASM|Ln|Col|xise|VCD|PNG|SVG|PDF)\b/,
  /^@?[\w.-]+\.(vhdl?|v|ucf|json|zip|xise|sch|mem|asm\.json|sch\.json)$/i,   // file names
  /^@?(src|sim|constraints)\/?$/,
  /^@?xc\d|^@?xc[a-z0-9]+/i,                       // part names
  /^@?(github\.com|https?:)/,
  /^@?Ctrl\+|^@?F\d+$|^@?(Ctrl|Cmd|Shift|Alt)\b/,
  /^@?-?\d/,                                       // speed grades, versions
  /^@?(MHz|kHz|Hz|ns|us|ms|ps|fs)$/,
  /^@?(English|Português)$/,
  /^@?<workspace>/,
  /^@?(Default\.wcfg)$/,
];
export const isSame = (s) => SAME.some((re) => re.test(s));

/** English texts that stayed the same in Portuguese (by position; both lists from __uiTexts). */
export function untranslated(en, pt, extraSame = []) {
  const out = [];
  if (en.length === pt.length) {
    en.forEach((e, i) => { if (e === pt[i] && /[A-Za-z]{2}/.test(e) && !isSame(e) && !extraSame.some((re) => re.test(e))) out.push(e); });
  } else {
    const p = new Set(pt);
    for (const e of new Set(en)) if (p.has(e) && /[A-Za-z]{2}/.test(e) && !isSame(e) && !extraSame.some((re) => re.test(e))) out.push(e);
  }
  return [...new Set(out)];
}
