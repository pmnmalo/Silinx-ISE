// The order names are listed in (#3819): the Design pane's modules, the Files page's paths, the module pickers, the
// MCP's listings. The numbers in a name compare by their value (access_next_state_2 before access_next_state_10), the
// rest as localeCompare did before (upper and lower case alike, '_' and '.' before the digits, the digits before the
// letters); one collation, English's, the same in every browser and in Node whatever their language.
//
//   ['s_10', 's_2', 'S_1'].sort(naturalCompare) → ['S_1', 's_2', 's_10']

const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Compares two names in their natural order: < 0 when a comes first, 0 only for the same name, > 0 otherwise. */
export function naturalCompare(a, b) {
  const x = String(a ?? ''), y = String(b ?? '');
  // the same but for case or leading zeros: one order still (fewer zeros first, then upper case first)
  return COLLATOR.compare(x, y) || x.length - y.length || (x < y ? -1 : x > y ? 1 : 0);
}

/** A comparator that keeps `first` (a name, any case) in front, the others in their natural order. */
export function firstThenNatural(first) {
  const f = first ? String(first).toLowerCase() : null;
  return (a, b) => {
    const af = f !== null && String(a).toLowerCase() === f, bf = f !== null && String(b).toLowerCase() === f;
    return af !== bf ? (af ? -1 : 1) : naturalCompare(a, b);
  };
}
