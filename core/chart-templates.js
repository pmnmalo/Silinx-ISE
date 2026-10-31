// The templates of the FSM, ASM and Petri net wizards of New Source (#2149), and the list of the Schematic Wizard's (#2180): a template and its parameters give the
// chart's ports and its states (an FSM's transitions too), or the whole of an ASM chart or a Petri net, laid out for
// the editor; the wizard's next pages edit them before the chart is made (core/chart-wizard.js).

// a parameter: n / m a number (min, max, default), pattern a bit string, overlap a choice, type Moore / Mealy
const N = (label, def, min, max) => ({ key: 'n', label, def, min, max });
const PATTERN = { key: 'pattern', label: 'Pattern (bits):', def: '1011' };
const OVERLAP = { key: 'overlap', label: 'Overlapping matches:', def: 'yes', options: [['yes', 'yes (1011011: two)'], ['no', 'no (1011011: one)']] };
const TYPE = { key: 'type', label: 'Machine type:', def: 'moore', options: [['moore', 'Moore (the output on a state)'], ['mealy', 'Mealy (the output on a transition)']] };

export const FSM_TEMPLATES = [
  { id: 'empty', label: 'Empty', text: 'No inputs or outputs, two states: type in your own.' },
  { id: 'counter', label: 'Counter', text: 'N states in a cycle, one at each clock edge; the output q is the count (0 to N-1).', params: [N('Number of states (N):', 8, 2, 64)] },
  { id: 'updown', label: 'Up/down counter', text: 'N states in a cycle: up = 1 counts up, up = 0 counts down; the output q is the count.', params: [N('Number of states (N):', 8, 2, 64)] },
  { id: 'enable', label: 'Counter with enable', text: 'N states in a cycle: it counts while en = 1 and stays while en = 0; the output q is the count.', params: [N('Number of states (N):', 8, 2, 64)] },
  { id: 'ring', label: 'Ring counter', text: 'N states in a cycle, the output q one-hot: one bit set, moving one place at each clock edge.', params: [N('Number of states (N):', 4, 2, 32)] },
  { id: 'johnson', label: 'Johnson counter', text: 'N states (an even number) in a cycle, the output q of N/2 bits a twisted ring: 000, 001, 011, 111, 110, 100…', params: [N('Number of states (N, even):', 6, 2, 64)] },
  { id: 'detector', label: 'Sequence detector', text: 'The input x read one bit at each clock edge; the output z is 1 when the last bits read are the pattern.', params: [PATTERN, OVERLAP, TYPE] },
  { id: 'traffic', label: 'Traffic light', text: 'Green, yellow, red in turn, each until the input t (its time is up) is 1; the outputs green, yellow and red light the lamps.' },
];

export const ASM_TEMPLATES = [
  { id: 'empty', label: 'Empty', text: 'No inputs or outputs, two state boxes chained: add your own.' },
  { id: 'counter', label: 'Counter', text: 'N state boxes chained in a cycle, each one setting the output q to its count.', params: [N('Number of states (N):', 8, 2, 32)] },
  { id: 'updown', label: 'Up/down counter', text: 'N state boxes in a cycle, a decision on up after each: up = 1 to the next, up = 0 to the previous; q is the count.', params: [N('Number of states (N):', 4, 3, 32)] },
  { id: 'startdone', label: 'Start/done controller', text: 'IDLE (ready) waits for start, RUN (busy) waits for done, FINISH (ready) goes back to IDLE.' },
  { id: 'handshake', label: 'Request/acknowledge handshake', text: 'IDLE waits for req; ACK sets ack while req stays 1, then back to IDLE.' },
];

export const PETRI_TEMPLATES = [
  { id: 'empty', label: 'Empty', text: 'No places yet: draw your own.' },
  { id: 'cycle', label: 'Cycle of N places', text: 'N places in a ring, one token going round: a transition fires while go = 1; the output q is the number of the marked place.', params: [N('Number of places (N):', 4, 2, 32)] },
  { id: 'prodcons', label: 'Producer/consumer', text: 'A buffer of N items: produce (put = 1) takes a free slot, consume (get = 1) gives it back; can_put and has_data say whether there is room and data.', params: [N('Buffer size (N):', 4, 1, 255)] },
  { id: 'mutex', label: 'Mutual exclusion', text: 'Two processes share one token: req1 / req2 ask for it, grant1 / grant2 say who has it; never both.' },
  { id: 'forkjoin', label: 'Fork/join', text: 'go splits the token into two branches, each going on with its input (a, b); they join again when both are done.' },
  { id: 'semaphore', label: 'Semaphore', text: 'M users share N resources: req takes one (if any is free), rel gives one back; active while some user has one.',
    params: [N('Resources (N):', 2, 1, 255), { key: 'm', label: 'Users (M):', def: 3, min: 1, max: 255 }] },
];

// the Schematic Wizard's (#2180; drawn by core/sch-templates.js): each one the editor's symbols, placed and wired
const WIDTH = (def = 8, min = 1) => N('Width (bits):', def, min, 32);
const YES_NO = [['yes', 'yes'], ['no', 'no']];
const ENABLE = { key: 'en', label: 'Clock enable:', def: 'yes', options: YES_NO };
const RESET = { key: 'reset', label: 'Reset:', def: 'async', options: [['async', 'Asynchronous (at once)'], ['sync', 'Synchronous (at the clock edge)'], ['none', 'No reset']] };
export const SCH_TEMPLATES = [
  { id: 'empty', label: 'Empty', text: 'No symbols: only the I/O markers of the inputs and outputs you type in.' },
  { id: 'register', label: 'Register', text: 'N flip-flops side by side: q takes d at the rising edge of clk, while ce = 1; rst sets it to 0.', params: [WIDTH(), ENABLE, RESET] },
  { id: 'shift', label: 'Shift register', text: 'N flip-flops in a chain: at the rising edge of clk, q moves one place to the left and its bit 0 takes the serial input si.', params: [WIDTH(8, 2), ENABLE, RESET] },
  { id: 'counter', label: 'Counter', text: 'A binary counter of N bits: q counts at the rising edge of clk, while ce = 1; rst sets it to 0.',
    params: [WIDTH(), ENABLE, RESET, { key: 'dir', label: 'Direction:', def: 'up', options: [['up', 'up'], ['down', 'down']] }] },
  { id: 'modcounter', label: 'Modulo-N counter', text: 'A counter and a comparator: when q reaches N-1, the comparator clears the counter at the next count, so q goes 0 to N-1; tc marks the last count, to chain another counter.',
    params: [N('Modulus (N):', 10, 2, 65536)] },
  { id: 'clockdiv', label: 'Clock divider (tick)', text: 'A counter and a comparator give tick, 1 for one clock period in every N: connect it to a clock enable, rather than making another clock.',
    params: [N('Divide by (N):', 50000, 2, 16777216)] },
  { id: 'pwm', label: 'PWM', text: 'A free counter compared with the duty kept in a register (load = 1 takes it): pwm is 1 for duty clocks in every 2^N, to dim an LED.', params: [WIDTH(8)] },
  { id: 'edge', label: 'Edge detector', text: 'A flip-flop keeps the input of one clock ago and a gate compares it with the present one: pulse is 1 for one clock period at each edge of d.',
    params: [{ key: 'kind', label: 'Edge:', def: 'rise', options: [['rise', 'rising'], ['fall', 'falling'], ['both', 'both']] }] },
  { id: 'debounce', label: 'Synchroniser and debouncer', text: 'For a button: two flip-flops bring d into the clock\'s domain, and a third one samples it once every N clocks, longer than the bouncing lasts; q is the clean input.',
    params: [N('Clocks between samples (N):', 500000, 2, 16777216)] },
  { id: 'addsub', label: 'Adder-subtractor', text: 'One adder for both: sub = 1 chooses the complement of b and adds 1 through the carry in, so s = a - b; ov says that the signed result does not fit.', params: [WIDTH()] },
  { id: 'accumulator', label: 'Accumulator', text: 'An adder and a register in a loop: at each rising edge of clk, while ce = 1, q takes q + d; rst sets it to 0.', params: [WIDTH()] },
  { id: 'display', label: 'Multiplexed 7-segment display', text: 'The digits of d shown one at a time, too fast to see: a tick every N clocks moves a counter, which chooses the digit and lights its anode; a multiplexer of constants gives its segments. seg (gfedcba) and an are active low.',
    params: [{ key: 'k', label: 'Digits:', def: '4', options: [['2', '2'], ['4', '4']] }, N('Clocks per digit (N):', 50000, 2, 16777216)] },
  { id: 'fulladder', label: 'Full adder (gates)', text: 'One bit added with XOR, AND and OR gates: s = a xor b xor ci, co = a and b, or (a xor b) and ci.' },
];

const LISTS = { fsm: FSM_TEMPLATES, asm: ASM_TEMPLATES, petri: PETRI_TEMPLATES, sch: SCH_TEMPLATES };

/** The template `id` of a kind (fsm, asm, petri, sch), the first one (empty) if unknown. */
export const templateOf = (kind, id) => LISTS[kind].find(t => t.id === id) || LISTS[kind][0];
/** A template's parameters at their defaults: { key: value }. */
export const templateDefaults = (kind, id) => Object.fromEntries((templateOf(kind, id).params || []).map(p => [p.key, p.def]));

/** The error of a template's parameters (as typed), or null. */
export function templateError(kind, id, params) {
  for (const p of templateOf(kind, id).params || []) {
    const v = params[p.key];
    if (p.options) { if (!p.options.some(([k]) => k === v)) return `${p.label.replace(/:$/, '')}: choose one.`; continue; }
    if (p.key === 'pattern') {
      if (!/^[01]{1,16}$/.test(String(v ?? '').trim())) return 'Pattern: 1 to 16 bits, 0 and 1 only.';
      continue;
    }
    const n = Number(v);
    if (!Number.isInteger(n) || n < p.min || n > p.max) return `${p.label.replace(/:$/, '')}: a whole number from ${p.min} to ${p.max}.`;
  }
  if (kind === 'fsm' && id === 'johnson' && Number(params.n) % 2) return 'A Johnson counter has an even number of states.';
  return null;
}

const bitsFor = n => Math.max(1, Math.ceil(Math.log2(n)));
const port = (name, dir, width = 1) => ({ name, dir, width });
// a ring of points around (cx, cy): the states of a cycle
const ring = (k, n, r) => ({ x: Math.round(r + 120 + r * Math.sin((2 * Math.PI * k) / n)), y: Math.round(r + 120 - r * Math.cos((2 * Math.PI * k) / n)) });
const radius = n => Math.max(150, n * 32);

// ---------------------------------------------------------------- FSM
/**
 * An FSM template: { type, ports, states [names], outputs { state: { output: value } }, transitions
 * [{ from, to, cond, outputs? }] by the states' names, layout: 'circle' | undefined }.
 */
export function fsmTemplate(id, params = {}) {
  const n = Number(params.n);
  const cycle = (names, cond = '') => names.map((s, i) => ({ from: s, to: names[(i + 1) % names.length], cond }));
  const counting = (names, value = i => String(i)) => Object.fromEntries(names.map((s, i) => [s, { q: value(i) }]));
  const S = k => Array.from({ length: k }, (_, i) => `S${i}`);
  switch (id) {
    case 'counter': {
      const st = S(n);
      return { type: 'moore', ports: [port('q', 'out', bitsFor(n))], states: st, outputs: counting(st), transitions: cycle(st), layout: 'circle' };
    }
    case 'updown': {
      const st = S(n);
      return { type: 'moore', ports: [port('up', 'in'), port('q', 'out', bitsFor(n))], states: st, outputs: counting(st), layout: 'circle',
        transitions: st.flatMap((s, i) => [{ from: s, to: st[(i + 1) % n], cond: 'up' }, { from: s, to: st[(i + n - 1) % n], cond: '!up' }]) };
    }
    case 'enable': {
      const st = S(n);
      return { type: 'moore', ports: [port('en', 'in'), port('q', 'out', bitsFor(n))], states: st, outputs: counting(st), transitions: cycle(st, 'en'), layout: 'circle' };
    }
    case 'ring': {
      const st = S(n);
      return { type: 'moore', ports: [port('q', 'out', n)], states: st, outputs: counting(st, i => (1n << BigInt(i)).toString()), transitions: cycle(st), layout: 'circle' };
    }
    case 'johnson': {
      const w = n / 2, mask = (1n << BigInt(w)) - 1n, vals = [];
      for (let i = 0, v = 0n; i < n; i++) { vals.push(v); v = ((v << 1n) | (((v >> BigInt(w - 1)) & 1n) ^ 1n)) & mask; }
      const st = S(n);
      return { type: 'moore', ports: [port('q', 'out', w)], states: st, outputs: counting(st, i => vals[i].toString()), transitions: cycle(st), layout: 'circle' };
    }
    case 'detector': return detector(String(params.pattern).trim(), params.overlap !== 'no', params.type === 'mealy' ? 'mealy' : 'moore');
    case 'traffic': {
      const st = ['GO', 'CAUTION', 'STOP'];
      return { type: 'moore', ports: [port('t', 'in'), port('green', 'out'), port('yellow', 'out'), port('red', 'out')], states: st,
        outputs: { GO: { green: '1' }, CAUTION: { yellow: '1' }, STOP: { red: '1' } }, transitions: cycle(st, 't'), layout: 'circle' };
    }
    default: return { type: 'moore', ports: [], states: ['S0', 'S1'], outputs: {}, transitions: [] };
  }
}

// a sequence detector of `p` (bits): the state Si has the first i bits of p matched (the longest prefix of p that the
// bits read end with); Moore: S0..Sk, z = 1 in Sk; Mealy: S0..S(k-1), z = 1 on the transition that reads the last bit
function detector(p, overlap, type) {
  const k = p.length;
  // the longest prefix of p, at most `max` bits, that `s` ends with
  const prefixIn = (s, max) => { for (let j = Math.min(max, s.length); j > 0; j--) if (s.endsWith(p.slice(0, j))) return j; return 0; };
  const after = (i, b) => {   // the state after reading b in Si (Si: i bits matched; i = k: Moore's match)
    if (i === k) return overlap ? prefixIn(p.slice(1) + b, k) : prefixIn(b, k);
    return prefixIn(p.slice(0, i) + b, k);
  };
  const count = type === 'moore' ? k + 1 : k;
  const st = Array.from({ length: count }, (_, i) => `S${i}`);
  const transitions = [];
  for (let i = 0; i < count; i++) {
    for (const b of ['1', '0']) {
      let j = after(i, b), outputs;
      if (type === 'mealy' && j === k) { outputs = { z: '1' }; j = overlap ? prefixIn(p.slice(1), k - 1) : 0; }
      transitions.push({ from: st[i], to: st[j], cond: b === '1' ? 'x' : '!x', ...(outputs ? { outputs } : {}) });
    }
  }
  return { type, ports: [port('x', 'in'), port('z', 'out')], states: st, outputs: type === 'moore' ? { [st[k]]: { z: '1' } } : {}, transitions, layout: 'circle' };
}

/** The place of state k of n on the drawing (a circle; else rows of 4, as typed in). */
export function fsmStatePos(k, n, layout) {
  if (layout === 'circle') return ring(k, n, radius(n));
  return { x: 120 + 200 * (k % 4), y: 160 + 200 * Math.floor(k / 4) };
}

// ---------------------------------------------------------------- ASM
/** An ASM template: { ports, states [names], nodes, edges } (the state boxes named by `names`, in the states' order). */
export function asmTemplate(id, params = {}, names = null) {
  const n = Number(params.n);
  const state = (i, name, x, y, actions = []) => ({ id: `s${i + 1}`, type: 'state', name, x, y, actions });
  const decision = (i, cond, x, y) => ({ id: `d${i + 1}`, type: 'decision', cond, x, y });
  const pick = def => (names && names.length === def.length ? names : def);
  let e = 0;
  const edge = (from, to, port = 'next') => ({ id: `e${++e}`, from, to, port });
  switch (id) {
    case 'counter': {
      const st = pick(Array.from({ length: n }, (_, i) => `S${i}`));
      return { ports: [port('q', 'out', bitsFor(n))], states: st,
        nodes: st.map((s, i) => state(i, s, 200, 80 + 130 * i, [`q = ${i}`])), edges: st.map((_, i) => edge(`s${i + 1}`, `s${(i + 1) % n + 1}`)) };
    }
    case 'updown': {
      const st = pick(Array.from({ length: n }, (_, i) => `S${i}`));
      return { ports: [port('up', 'in'), port('q', 'out', bitsFor(n))], states: st,
        nodes: st.flatMap((s, i) => [state(i, s, 200, 80 + 240 * i, [`q = ${i}`]), decision(i, 'up', 200, 190 + 240 * i)]),
        edges: st.flatMap((_, i) => [edge(`s${i + 1}`, `d${i + 1}`), edge(`d${i + 1}`, `s${(i + 1) % n + 1}`, 'true'), edge(`d${i + 1}`, `s${(i + n - 1) % n + 1}`, 'false')]) };
    }
    case 'startdone': {
      const st = pick(['IDLE', 'RUN', 'FINISH']);
      return { ports: [port('start', 'in'), port('done', 'in'), port('busy', 'out'), port('ready', 'out')], states: st,
        nodes: [state(0, st[0], 200, 80, ['ready = 1']), decision(0, 'start', 200, 190), state(1, st[1], 200, 300, ['busy = 1']), decision(1, 'done', 200, 410), state(2, st[2], 200, 520, ['ready = 1'])],
        edges: [edge('s1', 'd1'), edge('d1', 's2', 'true'), edge('d1', 's1', 'false'), edge('s2', 'd2'), edge('d2', 's3', 'true'), edge('d2', 's2', 'false'), edge('s3', 's1')] };
    }
    case 'handshake': {
      const st = pick(['IDLE', 'ACK']);
      return { ports: [port('req', 'in'), port('ack', 'out')], states: st,
        nodes: [state(0, st[0], 200, 80), decision(0, 'req', 200, 190), state(1, st[1], 200, 300, ['ack = 1']), decision(1, 'req', 200, 410)],
        edges: [edge('s1', 'd1'), edge('d1', 's2', 'true'), edge('d1', 's1', 'false'), edge('s2', 'd2'), edge('d2', 's2', 'true'), edge('d2', 's1', 'false')] };
    }
    default: {   // the states typed in, each followed by the next, the last by the first
      const st = names || ['IDLE', 'RUN'];
      return { ports: [], states: st, nodes: st.map((s, i) => state(i, s, 200, 80 + 130 * i)),
        edges: st.map((_, i) => edge(`s${i + 1}`, `s${(i + 1) % st.length + 1}`)) };
    }
  }
}

// ---------------------------------------------------------------- Petri net
/** A Petri net template: { ports, places, transitions, arcs }. */
export function petriTemplate(id, params = {}) {
  const n = Number(params.n);
  let a = 0;
  const arc = (from, to) => ({ id: `a${++a}`, from, to });
  const place = (pid, name, x, y, tokens = 0, capacity = 1, outputs = {}) => ({ id: pid, name, x, y, tokens, capacity, outputs });
  const trans = (tid, name, x, y, guard = '') => ({ id: tid, name, x, y, guard });
  switch (id) {
    case 'cycle': {
      const r = radius(2 * n);
      const places = Array.from({ length: n }, (_, i) => place(`p${i + 1}`, `p${i}`, ring(2 * i, 2 * n, r).x, ring(2 * i, 2 * n, r).y, i ? 0 : 1, 1, { q: String(i) }));
      const transitions = Array.from({ length: n }, (_, i) => trans(`t${i + 1}`, `t${i}`, ring(2 * i + 1, 2 * n, r).x, ring(2 * i + 1, 2 * n, r).y, 'go'));
      return { ports: [port('go', 'in'), port('q', 'out', bitsFor(n))], places, transitions,
        arcs: transitions.flatMap((t, i) => [arc(`p${i + 1}`, t.id), arc(t.id, `p${(i + 1) % n + 1}`)]) };
    }
    case 'prodcons': return {
      ports: [port('put', 'in'), port('get', 'in'), port('can_put', 'out'), port('has_data', 'out')],
      places: [place('p1', 'free', 120, 140, n, n, { can_put: '1' }), place('p2', 'items', 360, 140, 0, n, { has_data: '1' })],
      transitions: [trans('t1', 'produce', 240, 60, 'put'), trans('t2', 'consume', 240, 220, 'get')],
      arcs: [arc('p1', 't1'), arc('t1', 'p2'), arc('p2', 't2'), arc('t2', 'p1')],
    };
    case 'mutex': return {
      ports: [port('req1', 'in'), port('req2', 'in'), port('grant1', 'out'), port('grant2', 'out')],
      places: [place('p1', 'idle1', 120, 80, 1), place('p2', 'cs1', 120, 300, 0, 1, { grant1: '1' }), place('p3', 'free', 300, 190, 1),
        place('p4', 'idle2', 480, 80, 1), place('p5', 'cs2', 480, 300, 0, 1, { grant2: '1' })],
      transitions: [trans('t1', 'enter1', 60, 190, 'req1'), trans('t2', 'leave1', 200, 190, '!req1'), trans('t3', 'enter2', 540, 190, 'req2'), trans('t4', 'leave2', 400, 190, '!req2')],
      arcs: [arc('p1', 't1'), arc('p3', 't1'), arc('t1', 'p2'), arc('p2', 't2'), arc('t2', 'p1'), arc('t2', 'p3'),
        arc('p4', 't3'), arc('p3', 't3'), arc('t3', 'p5'), arc('p5', 't4'), arc('t4', 'p4'), arc('t4', 'p3')],
    };
    case 'forkjoin': return {
      ports: [port('go', 'in'), port('a', 'in'), port('b', 'in'), port('busy_a', 'out'), port('busy_b', 'out')],
      places: [place('p1', 'start', 80, 200, 1), place('p2', 'a1', 260, 100, 0, 1, { busy_a: '1' }), place('p3', 'b1', 260, 300, 0, 1, { busy_b: '1' }),
        place('p4', 'a2', 440, 100), place('p5', 'b2', 440, 300)],
      transitions: [trans('t1', 'fork', 170, 200, 'go'), trans('t2', 'ta', 350, 100, 'a'), trans('t3', 'tb', 350, 300, 'b'), trans('t4', 'join', 530, 200)],
      arcs: [arc('p1', 't1'), arc('t1', 'p2'), arc('t1', 'p3'), arc('p2', 't2'), arc('t2', 'p4'), arc('p3', 't3'), arc('t3', 'p5'),
        arc('p4', 't4'), arc('p5', 't4'), arc('t4', 'p1')],
    };
    case 'semaphore': {
      const m = Number(params.m);
      return {
        ports: [port('req', 'in'), port('rel', 'in'), port('active', 'out')],
        places: [place('p1', 'idle', 120, 140, m, m), place('p2', 'resources', 300, 260, n, n), place('p3', 'busy', 480, 140, 0, m, { active: '1' })],
        transitions: [trans('t1', 'acquire', 300, 60, 'req'), trans('t2', 'release', 300, 160, 'rel')],
        arcs: [arc('p1', 't1'), arc('p2', 't1'), arc('t1', 'p3'), arc('p3', 't2'), arc('t2', 'p1'), arc('t2', 'p2')],
      };
    }
    default: return { ports: [], places: [], transitions: [], arcs: [] };
  }
}
