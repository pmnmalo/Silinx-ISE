// nextpnr's router in the browser edition's flow worker (#3143): the 7-series' back end routes with router2, as the local
// server does (its .bit the same), which takes about 1.3 GB for the xc7a35t: where nextpnr stops without an error of its own
// (WebAssembly out of the browser's memory), the run is made again with router1 (about 0.4 GB, ten times slower), and a
// warning says so. nextpnr's lines of the first run are given only when it is the run that counts. The warning is a line of
// the run's (nextpnr's Warning:), so that the back end says it with the run's own (the best of 3 seeds: the kept run's
// only, #3825).

/** np (an io.nextpnr micro-architecture's: { run, chipdb }) with router2 and that fallback. */
export function routerFallback(np) {
  return {
    ...np,
    router: 'router2',
    async run(args, files, onLine = () => {}) {
      const i = args.indexOf('--router');
      if (i < 0 || args[i + 1] !== 'router2') return np.run(args, files, onLine);
      const lines = [];
      try {
        const out = await np.run(args, files, l => lines.push(l));
        lines.forEach(onLine);
        return out;
      } catch (e) {
        // (an error of nextpnr's own, said on its ERROR: lines: the design's, the same with router1)
        if (lines.some(l => /^ERROR:/.test(l))) { lines.forEach(onLine); throw e; }
        onLine(`Warning: nextpnr's router2 stopped without an error (${e.message || e}): out of this browser's memory, likely; routed again with router1 (less memory, slower; its routing, and so the .bit, not the local server's).`);
        return np.run(args.map((a, k) => (k === i + 1 ? 'router1' : a)), files, onLine);
      }
    },
  };
}
