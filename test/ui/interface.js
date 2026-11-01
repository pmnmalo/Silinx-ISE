// The interface the UI tests run in (SILINX_UI_INTERFACE): silinx (the default, also when unset) or ise (#2451).
// The ids of before (modern, classic) are still accepted for a transition, mapped to theirs with a warning, so a
// command of before does not silently test the other interface. test/ui/harness.js normalises the variable on load.
export const UI_INTERFACES = ['silinx', 'ise'];
// the ids before #2451 (web/js/modern.js LEGACY_INTERFACES)
export const LEGACY_UI_INTERFACES = Object.freeze({ modern: 'silinx', classic: 'ise' });

/** The interface id SILINX_UI_INTERFACE asks for ('' when unset); an old id mapped with a warning, an unknown one
 *  an error. */
export function uiInterface(value, warn = (m) => console.warn(m)) {
  const v = String(value ?? '').trim();
  if (!v || UI_INTERFACES.includes(v)) return v;
  if (Object.hasOwn(LEGACY_UI_INTERFACES, v)) {
    const now = LEGACY_UI_INTERFACES[v];
    warn(`SILINX_UI_INTERFACE=${v} is the id of before #2451: running in '${now}' (write SILINX_UI_INTERFACE=${now})`);
    return now;
  }
  throw new Error(`SILINX_UI_INTERFACE=${v}: not an interface (${UI_INTERFACES.join(' or ')})`);
}
