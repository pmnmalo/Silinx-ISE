// A text in XML, the escapes of the files Silinx writes, one copy of each (#3545: six copies with different sets). The
// sets differ on purpose: a file's bytes stay those its writer always made (ISE reads them, the tests compare them).
// The page's HTML escape is web/js/dom.js esc (', as &#39;, too: HTML has no &apos;). No Node or DOM API.

/** & < > and " (an element's text and a double-quoted attribute's value): the .xise project, the schematic's SVG, the
 *  ISE schematic's (.sch, .sym) attributes, the PNML of a Petri net. */
export const escXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** & < > " and ' (as &apos;): an attribute's value in either quote (the wave configuration, .wcfg). */
export const escXmlApos = s => escXml(s).replace(/'/g, '&apos;');

/** & < > only: an element's text (the ISE schematic's graphics' text, never in an attribute). */
export const escXmlText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
