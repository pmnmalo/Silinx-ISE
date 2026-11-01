// SSim's colours (#405: out of mountISim in isim.js): the wave window's and the names' colours and fonts read from
// the theme's variables (web/css/modern.css and the ISE style theme), again when the theme changes.

/** { readColors } of mountISim (setColors(v): the colours read, kept by the window). */
export function mountColors(ctx) {
  const {
    root, setColors
  } = ctx;

  // ---------------------------------------------------------------- theme colours
  function readColors() {
    const cs = getComputedStyle(root);
    const g = (n, d) => (cs.getPropertyValue(n).trim() || d);
    setColors({
      bg: g('--wave-bg', '#000'), grid: g('--wave-grid', '#303030'), fg: g('--wave-fg', '#00ff00'),
      x: g('--wave-x', '#ff0000'), z: g('--wave-z', '#4080ff'), text: g('--wave-text', '#fff'),
      cursor: g('--wave-cursor', '#ffff00'), marker: g('--wave-marker', '#00c0ff'), names: g('--wave-names-bg', '#fff'),
      accent: g('--accent', '#316ac5'), accentFg: g('--accent-fg', '#fff'), border: g('--border', '#a0a0a0'),
      borderLight: g('--border-light', '#d4d0c8'), fgText: g('--fg', '#000'), muted: g('--muted', '#6d6d6d'),
      header: g('--bg', '#f0f0f0'),
      // the header of the names and the time ruler (themes: web/css/modern.css)
      head1: g('--wave-head-1', '#fbfbfb'), head2: g('--wave-head-2', '#e3e3e3'), rulerFg: g('--wave-ruler-fg', '#000'), rulerTick: g('--wave-ruler-tick', '#555'),
      font: g('--font', 'Tahoma, Arial, sans-serif'), mono: g('--mono', 'Consolas, monospace'),
    });
  }

  return { readColors };
}
