// The 7-series' timing measured with Vivado (#3516, scripts/xc7-timing-vivado.mjs): the parsing of what Vivado writes on
// the host (its SDF, report_timing's paths, the routes measure.tcl lists) and of nextpnr's report, into numbers. Vivado's
// files are read in the run's temporary folder and never kept: only the numbers go on (scripts/xc7-timing-fit.mjs).
// Every delay here is in picoseconds.

// ---- SDF (IEEE 1497, as Vivado's write_sdf writes it) ----

/** An SDF's text as an s-expression: nested arrays of atoms (an atom's backslash escapes removed, a quoted string's quotes). */
export function sexpr(text) {
  const s = String(text), root = [], stack = [root];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '(') { const l = []; stack.at(-1).push(l); stack.push(l); i++; }
    else if (c === ')') { if (stack.length > 1) stack.pop(); i++; }
    else if (/\s/.test(c)) i++;
    else if (c === '"') { const j = s.indexOf('"', i + 1); stack.at(-1).push(s.slice(i + 1, j < 0 ? s.length : j)); i = j < 0 ? s.length : j + 1; }
    else {
      let a = '';
      while (i < s.length && !/[\s()"]/.test(s[i])) { if (s[i] === '\\' && i + 1 < s.length) i++; a += s[i++]; }
      stack.at(-1).push(a);
    }
  }
  return root;
}

/** An SDF timescale ('1ps', '1 ns', '100 ps') as picoseconds a unit. */
export function timescalePs(list) {
  const m = /^(\d+(?:\.\d+)?)\s*(fs|ps|ns|us)$/i.exec(list.slice(1).join(' ').trim());
  if (!m) return 1000;   // (the standard's default: 1 ns)
  return Number(m[1]) * { fs: 1e-3, ps: 1, ns: 1e3, us: 1e6 }[m[2].toLowerCase()];
}

// a delay value: (min:typ:max), (v) or () -> its max in ps (null: none)
function valueMax(v, unit) {
  if (!Array.isArray(v) || !v.length) return null;
  const parts = String(v[0]).split(':').map((x) => (x === '' ? null : Number(x))).filter((x) => x !== null && Number.isFinite(x));
  return parts.length ? +(Math.max(...parts) * unit).toFixed(3) : null;
}
// a port, maybe with its edge: 'Q' or ['posedge', 'C'] -> 'C'
const portOf = (p) => (Array.isArray(p) ? p[p.length - 1] : p);
// the worst of a list of delays (rise, fall, …) that are not null
const worst = (xs) => { const v = xs.filter((x) => x !== null); return v.length ? Math.max(...v) : null; };

/**
 * An SDF: { timescalePs, cells: [{ type, instance, iopaths: [{ from, to, ps }], interconnects: [{ from, to, ps }],
 * checks: [{ kind: 'setup' | 'hold', pin, clock, ps }] }] }, each delay the worst (rise, fall) of its maximum, in ps.
 * A SETUPHOLD gives a setup and a hold; RECREM a setup (recovery) and a hold (removal) of the asynchronous pin.
 */
export function parseSdf(text) {
  const root = sexpr(text);
  const file = root.find((x) => Array.isArray(x) && x[0] === 'DELAYFILE');
  if (!file) throw new Error('not an SDF: no DELAYFILE');
  const ts = file.find((x) => Array.isArray(x) && x[0] === 'TIMESCALE');
  const unit = ts ? timescalePs(ts) : 1000;
  const cells = [];
  for (const c of file.filter((x) => Array.isArray(x) && x[0] === 'CELL')) {
    const field = (k) => c.find((x) => Array.isArray(x) && x[0] === k);
    const cell = { type: field('CELLTYPE')?.[1] ?? '', instance: field('INSTANCE')?.[1] ?? '', iopaths: [], interconnects: [], checks: [] };
    for (const d of c.filter((x) => Array.isArray(x) && x[0] === 'DELAY')) {
      for (const abs of d.filter((x) => Array.isArray(x) && (x[0] === 'ABSOLUTE' || x[0] === 'INCREMENT'))) {
        for (const e of abs.slice(1)) {
          // (a conditional path: COND <expr> (IOPATH …))
          const p = e[0] === 'COND' ? e.find((x) => Array.isArray(x) && x[0] === 'IOPATH') : e;
          if (!p) continue;
          const ps = worst(p.slice(3).map((v) => valueMax(v, unit)));
          if (p[0] === 'IOPATH') cell.iopaths.push({ from: portOf(p[1]), to: portOf(p[2]), ps });
          else if (p[0] === 'INTERCONNECT') cell.interconnects.push({ from: p[1], to: p[2], ps });
        }
      }
    }
    for (const t of c.filter((x) => Array.isArray(x) && x[0] === 'TIMINGCHECK')) {
      for (const k of t.slice(1)) {
        const [kind, pin, clock] = k;
        if (kind === 'SETUPHOLD' || kind === 'RECREM') {
          cell.checks.push({ kind: 'setup', pin: portOf(pin), clock: portOf(clock), ps: valueMax(k[3], unit) });
          cell.checks.push({ kind: 'hold', pin: portOf(pin), clock: portOf(clock), ps: valueMax(k[4], unit) });
        } else if (kind === 'SETUP' || kind === 'RECOVERY') cell.checks.push({ kind: 'setup', pin: portOf(pin), clock: portOf(clock), ps: valueMax(k[3], unit) });
        else if (kind === 'HOLD' || kind === 'REMOVAL') cell.checks.push({ kind: 'hold', pin: portOf(pin), clock: portOf(clock), ps: valueMax(k[3], unit) });
      }
    }
    cells.push(cell);
  }
  return { timescalePs: unit, cells };
}

// ---- report_timing (its paths, each element: -input_pins) ----

const NUM = '(-?\\d+(?:\\.\\d+)?)';
// a cell's arc: "LUT6 (Prop_lut6_I3_O)", "CARRY4 (Prop_carry4_S[0]_CO[3])", "FDRE (Setup_fdre_C_D)"
const ARC = /^(\S+)\s+\((Prop|Setup|Hold|Recov|Remov)_([a-z0-9]+)_([^_\s()]+)_([^_\s()]+)\)/;
const ns = (s) => (s == null ? null : Number(s));

/**
 * report_timing's paths: [{ slackNs, met, source, destination, group, requirementNs, dataPathNs, logicNs, routeNs,
 * levels, elements, check }]. elements: the data path's, in order: { kind: 'cell', site, type, arc: { kind, lib, from,
 * to }, ns, pin } (pin: the output it reaches) and { kind: 'net', fanout, routed, ns, net, to } (to: the input pin it
 * reaches, from -input_pins' rows); check: the endpoint's (Setup_…: { type, arc, ns: its setup time, the requirement
 * it takes off }), or null.
 */
export function parseTimingPaths(text) {
  const paths = [];
  const chunks = String(text).split(/^(?=Slack(?: \([A-Z]+\))?\s*:)/m).slice(1);
  for (const chunk of chunks) {
    const head = (re) => { const m = re.exec(chunk); return m ? m[1].trim() : null; };
    const slack = new RegExp(`^Slack(?: \\(([A-Z]+)\\))?\\s*:\\s*${NUM}ns`, 'm').exec(chunk);
    const dp = new RegExp(`Data Path Delay:\\s*${NUM}ns\\s*\\(logic ${NUM}ns.*?route ${NUM}ns`).exec(chunk);
    const lv = /Logic Levels:\s*(\d+)/.exec(chunk);
    const p = {
      slackNs: slack ? ns(slack[2]) : null, met: slack ? slack[1] !== 'VIOLATED' : null,
      source: head(/^\s*Source:\s*(\S+)/m), destination: head(/^\s*Destination:\s*(\S+)/m), group: head(/^\s*Path Group:\s*(\S+)/m),
      requirementNs: ns(head(new RegExp(`^\\s*Requirement:\\s*${NUM}ns`, 'm'))),
      dataPathNs: dp ? ns(dp[1]) : null, logicNs: dp ? ns(dp[2]) : null, routeNs: dp ? ns(dp[3]) : null, levels: lv ? Number(lv[1]) : null,
      elements: [], check: null,
    };
    // the table: its sections between dashed lines (the source clock's, the data path's, the destination clock's)
    const lines = chunk.split(/\r?\n/);
    const top = lines.findIndex((l) => /^\s*Location\s+Delay type/.test(l));
    if (top < 0) { paths.push(p); continue; }
    let section = -1, pending = null;
    for (const raw of lines.slice(top + 1)) {
      if (/^\s*-{10,}/.test(raw)) { section++; if (section > 2) break; continue; }
      const l = raw.replace(/\s+$/, '');
      if (!l.trim()) continue;
      // a long delay type wraps: its numbers on the next line
      const body = (pending ? `${pending} ${l.trim()}` : l.trim());
      const loc = /^([A-Z][A-Z0-9_]*X\d+Y\d+|[A-Z]{1,2}\d{1,2})\s+(.*)$/.exec(body);
      const site = loc && ARC.test(loc[2]) ? loc[1] : null;
      const rest = site ? loc[2] : body;
      const arc = ARC.exec(rest);
      if (arc) {
        const after = rest.slice(arc[0].length);
        const m = new RegExp(`^\\s*${NUM}\\s+${NUM}\\s*([rf])?\\s*(\\S+)?`).exec(after);
        if (!m) { pending = body; continue; }
        pending = null;
        const el = { kind: 'cell', site, type: arc[1], arc: { kind: arc[2], lib: arc[3], from: arc[4], to: arc[5] }, ns: ns(m[1]), pin: m[4] || null };
        if (arc[2] === 'Prop' && section === 1) p.elements.push(el);
        else if (arc[2] !== 'Prop' && section === 2) p.check = { type: el.type, arc: el.arc, ns: +(-el.ns).toFixed(3) };
        continue;
      }
      pending = null;
      const net = new RegExp(`^net \\(fo=(\\d+)(, routed)?\\)\\s+${NUM}\\s+${NUM}\\s+(\\S+)`).exec(rest);
      if (net && section === 1) { p.elements.push({ kind: 'net', fanout: Number(net[1]), routed: !!net[2], ns: ns(net[3]), net: net[5], to: null }); continue; }
      // an input pin's row (-input_pins): the net before it reaches it
      const pin = /^(?:\S+\s+){0,2}([rf])\s+(\S+\/\S+)$/.exec(body);
      if (pin && section === 1 && p.elements.at(-1)?.kind === 'net' && !p.elements.at(-1).to) p.elements.at(-1).to = pin[2];
    }
    paths.push(p);
  }
  return paths;
}

// ---- the routes measure.tcl lists ----

/**
 * The routes' list (measure.tcl's routes.txt, a tab-separated record a line): NET <net>; DRV <pin> <node>; SNK <pin>
 * <node>; PIP <uphill node> <downhill node>; LUTPIN <pin> <bel pin>. -> { nets: [{ name, drivers: [{ pin, node }],
 * sinks: [{ pin, node }], pips: [[from, to]] }], lutPins: Map(pin -> bel pin) }.
 */
export function parseRoutes(text) {
  const nets = [], lutPins = new Map();
  let net = null;
  for (const line of String(text).split(/\r?\n/)) {
    const f = line.split('\t');
    if (f[0] === 'NET') nets.push(net = { name: f[1] || '', drivers: [], sinks: [], pips: [] });
    else if (f[0] === 'LUTPIN' && f[1] && f[2]) lutPins.set(f[1], f[2]);
    else if (!net) continue;
    else if (f[0] === 'DRV') net.drivers.push({ pin: f[1], node: f[2] || null });
    else if (f[0] === 'SNK') net.sinks.push({ pin: f[1], node: f[2] || null });
    else if (f[0] === 'PIP' && f[1] && f[2]) net.pips.push([f[1], f[2]]);
  }
  return { nets, lutPins };
}

/**
 * A net's connections, its driver to each sink: [{ from, to, nodes }] (nodes: the route's nodes from the driver's to the
 * sink's, both included; [] when the sink is reached inside the site, or not by the net's PIPs: not routed through the
 * fabric). The route is a tree: each node's uphill node is the one its PIP leaves.
 */
export function connections(net) {
  const up = new Map();
  for (const [a, b] of net.pips) if (!up.has(b)) up.set(b, a);
  const drv = net.drivers[0];
  const out = [];
  for (const s of net.sinks) {
    const nodes = [];
    if (drv?.node && s.node) {
      let n = s.node;
      const seen = new Set();
      while (n && !seen.has(n)) { seen.add(n); nodes.unshift(n); if (n === drv.node) break; n = up.get(n); }
      if (nodes[0] !== drv.node) nodes.length = 0;
    }
    out.push({ from: drv?.pin ?? null, to: s.pin, nodes });
  }
  return out;
}

// the classes of the 7-series' interconnect wires, by the node's wire name (its tile's left out): Project X-Ray's and
// nextpnr's names, which are Vivado's
const WIRE_CLASSES = [
  ['single', /^[NSEW][LR]1(BEG|END)/], ['double', /^(EE|WW|NN|SS|NE|NW|SE|SW)2(BEG|END|[A-Z])/], ['quad', /^(EE|WW|NN|SS|NE|NW|SE|SW)4(BEG|END|[A-Z])/],
  ['hex', /^(EE|WW|NN|SS|NE|NW|SE|SW)6(BEG|END|[A-Z])/], ['long', /^L[HV]B?(_L)?\d+/], ['output', /^LOGIC_OUTS/], ['imux', /^IMUX/],
  ['bypass', /^BYP/], ['fan', /^(G?FAN)/], ['ctrl', /^CTRL/], ['bounce', /BOUNCE/], ['clock', /^(G?CLK|HCLK|GCLK|CLK_|BUFG|CMT)/],
  ['const', /^(GND|VCC)_WIRE/],
];

/** A node's wire class: single, double, quad, hex, long, output, imux, bypass, fan, ctrl, bounce, clock, const; 'site'
 *  for a site's own wire (a CLB's, an IOB's pin), 'other' else. node: Vivado's name, <tile>/<wire>. */
export function wireClass(node) {
  const [tile, wire] = String(node).includes('/') ? String(node).split('/') : ['', String(node)];
  for (const [c, re] of WIRE_CLASSES) if (re.test(wire)) return c;
  return /^(CLB|IOI|LIOI|RIOI|LIOB|RIOB|BRAM|DSP)/.test(tile) ? 'site' : 'other';
}

/** A LUT's physical pin of a bel pin ('SLICE_X1Y2/A6LUT/A3'): { bel: 'A6LUT', pin: 'A3', out: 'O6' } (A5LUT: O5), or null. */
export function lutBelPin(belPin) {
  const m = /(?:^|\/)([A-D])([56])LUT\/(A[1-6])$/.exec(String(belPin || ''));
  return m ? { bel: `${m[1]}${m[2]}LUT`, pin: m[3], out: `O${m[2]}` } : null;
}

// ---- nextpnr's report (--report): its critical paths ----

/** nextpnr's critical path of each clock: { [from]: { logicNs, routeNs, totalNs } } (logic: clk-to-q, the cells' and
 *  the setup's delays; route: its routing's), from --report's critical_paths (delays in ns). */
export function nextpnrPathSplit(report) {
  const out = {};
  for (const cp of report?.critical_paths || []) {
    let logic = 0, route = 0;
    for (const e of cp.path || []) { if (e.type === 'routing') route += e.delay || 0; else logic += e.delay || 0; }
    out[cp.from || '?'] = { logicNs: +logic.toFixed(3), routeNs: +route.toFixed(3), totalNs: +(logic + route).toFixed(3) };
  }
  return out;
}
