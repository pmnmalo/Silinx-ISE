// Silinx - open synthesis: the state machines one-hot (#539). Yosys's `fsm` pass (in synth_xilinx's prepare
// step) never extracts a machine from Silinx's netlists: the front end (core/synth-verilog.js) gives every
// register its power-up value (an `init`), and fsm_detect refuses a register that has one. XST re-encodes the
// machines it finds, one-hot from about 8 states. At Optimization Effort High a design whose machines of
// FSM_RULE.states states or more are refused for their init value alone is synthesized once more with them
// extracted and re-encoded one-hot, the power-up state kept, and that netlist kept when better (core/synth-open.js,
// DEPTH_RULE). The measurement that chose this (#438, #539): research/synth-quality/README.md, "State machines".
//
// The runs (the open synthesis's own script, its first step split around `fsm`: the steps of synth_xilinx's
// prepare, written out):
//   1. fsmProbeCommands: up to `opt -nodffe -nosdff`, the design written (RTLIL); then, quietly (tee -q), the init
//      values off, fsm_detect and the machines it marks extracted in one-hot: their states and codes (-encfile);
//   2. fsmChosen: the machines kept are those with an init value (refused today: the others Yosys extracts
//      already) of FSM_RULE.states states or more whose init state is one of their states (a VHDL integer
//      starting at integer'left, never written again, is not: fsm_opt drops it);
//      also those fsm_detect refused only because their users "don't seem to benefit" (#652: iwls05-i2c's bit
//      controller, 18 states written one-hot and tested on all 17 bits, which XST re-encodes one-hot): run 1's
//      fsm_detect messages (FSM_DETECT_FILE) name them, fsmForceCommands extracts them by hand from run 1's netlist
//      (their states and codes), and one without an init value starts in state 0 (the flip-flops' power-up); these
//      at Optimization Effort Normal too, the others at High alone;
//   3. fsmExtractCommands: those lose their init value and are marked one-hot (fsm_encoding), `fsm` extracts and
//      re-encodes them (the others as it does today) and writes each one's old -> new codes;
//   4. each re-encoded register gets as init the new code of its old init state (fsmInits), and fsmRestCommands
//      runs the rest of prepare and of the usual script from that netlist.
// fsm_detect itself refuses a register a port reads (marking one by hand crashes Yosys 0.70 on ITC'99 b06): such a
// register is never forced.

// synth_xilinx's prepare step (Yosys 0.70, `help synth_xilinx`, no -widemux) around its `fsm`
export const PREP_HEAD = 'proc; check; flatten; tribuf -logic; deminout; opt_expr; check; opt_clean; opt -nodffe -nosdff';
export const PREP_TAIL = 'opt; wreduce; peepopt; opt_clean; pmux2shiftx; clean; sort';
export const FSM_PRE_FILE = 'silinx_fsm_pre.il';
export const FSM_MARKED_FILE = 'silinx_fsm_marked.il';
export const FSM_POST_FILE = 'silinx_fsm_post.il';
export const FSM_ENC_FILE = 'silinx_fsm_enc.txt';
export const FSM_DETECT_FILE = 'silinx_fsm_detect.txt';
export const FSM_FORCED_FILE = 'silinx_fsm_forced.il';
// fsm_detect's one reason that marking a register by hand overrides (#652): its heuristic on the register's users
export const USERS_REASON = "Users of register don't seem to benefit from recoding.";
// the machines tried one-hot: of 8 states or more (#539: ITC'99 b01, 8 states, 17 % fewer slices; the 7-state
// b02 and b06 150 % and 60 % more)
export const FSM_RULE = { states: 8 };

/** fsm_detect's messages (one run of it): { marked: [wire], refused: [{ wire, reasons }] }. */
export function parseDetect(lines, top) {
  const strip = n => n.replace(new RegExp(`^${top.replace(/[.$\\]/g, '\\$&')}\\.`), '');
  const marked = [], refused = [];
  let cur = null;
  for (const l of lines) {
    let m;
    if ((m = /^Found FSM state register (\S+)\.$/.exec(l))) { marked.push(strip(m[1])); cur = null; }
    else if ((m = /^Not marking (\S+) as FSM state register:$/.exec(l))) { cur = { wire: strip(m[1]), reasons: [] }; refused.push(cur); }
    else if (cur && /^ {4}\S/.test(l)) cur.reasons.push(l.trim());
    else cur = null;
  }
  return { marked, refused };
}

/** A wire's name in RTLIL: \name, or $name as it is. */
export const rtlilName = n => (n.startsWith('$') ? n : `\\${n}`);

/** RTLIL text: the wires `names` lose their init attribute (returned, as written: `3'000`) and are marked
 *  fsm_encoding `encoding`. */
export function markWires(il, names, encoding = 'auto') {
  const want = new Set(names.map(rtlilName)), inits = {};
  const lines = il.split('\n'), out = [];
  let attrs = [];
  for (const l of lines) {
    if (/^\s*attribute /.test(l)) { attrs.push(l); continue; }
    const m = /^(\s*)wire\b.* (\S+)$/.exec(l);
    if (m && want.has(m[2])) {
      const init = attrs.find(a => /^\s*attribute \\init /.test(a));
      if (init) inits[m[2]] = init.trim().split(/\s+/)[2];
      attrs = attrs.filter(a => a !== init && !/^\s*attribute \\fsm_encoding /.test(a));
      attrs.push(`${m[1]}attribute \\fsm_encoding "${encoding}"`);
    }
    out.push(...attrs, l);
    attrs = [];
  }
  out.push(...attrs);
  return { il: out.join('\n'), inits };
}

/** The init attributes of the RTLIL text's wires: { \name: "3'010" }. */
export function wireInits(il) {
  const inits = {};
  let init = null;
  for (const l of il.split('\n')) {
    const a = /^\s*attribute \\init (\S+)$/.exec(l);
    if (a) { init = a[1]; continue; }
    if (/^\s*attribute /.test(l)) continue;
    const m = /^\s*wire\b.* (\S+)$/.exec(l);
    if (m && init) inits[m[1]] = init;
    init = null;
  }
  return inits;
}

/** fsm_recode's -encfile: { wire: [[old, new], …] } (bit patterns MSB first, '-' a don't-care). */
export function parseEncfile(text) {
  const fsms = {};
  let cur = null;
  for (const l of (text || '').split('\n')) {
    const f = /^\.fsm \S+ (\S+)$/.exec(l), m = /^\.map (\S+) (\S+)$/.exec(l);
    if (f) fsms[f[1]] = cur = [];
    else if (m && cur) cur.push([m[1], m[2]]);
  }
  return fsms;
}

/** The new init of a re-encoded machine: the new code of its old init state, don't-cares 0; null when the
 *  init state is not one of the machine's states (fsm_opt dropped it) or has unknown bits. */
export function newInit(oldInit, map) {
  const m = /^(\d+)'([01xz]+)$/.exec(oldInit || '');
  if (!m) return null;
  const bits = m[2].padStart(+m[1], '0');
  const hit = map.find(([o]) => o === bits);
  return hit ? `${hit[1].length}'${hit[1].replace(/-/g, '0')}` : null;
}

/** RTLIL text: the wires of `inits` ({ \name: "7'0000001" }) get that init attribute. */
export function setInits(il, inits) {
  return il.split('\n').map(l => {
    const m = /^(\s*)wire\b(?: width (\d+))?.* (\S+)$/.exec(l);
    if (!m || !inits[m[3]]) return l;
    const w = +(m[2] || 1);
    if (+inits[m[3]].split("'")[0] !== w) throw new Error(`fsm: ${m[3]} has ${w} bits, its new init ${inits[m[3]]}`);
    return `${m[1]}attribute \\init ${inits[m[3]]}\n${l}`;
  }).join('\n');
}

/** Run 1: the design up to fsm written (FSM_PRE_FILE); quietly, its machines without the init values extracted
 *  one-hot, their codes in FSM_ENC_FILE, fsm_detect's messages in FSM_DETECT_FILE (`synth`: synth_xilinx's command;
 *  `read`: the commands that read the design). */
export const fsmProbeCommands = (read, synth) => `${read}${synth} -run :prepare; ${PREP_HEAD}; write_rtlil ${FSM_PRE_FILE}; `
  + `tee -q setattr -unset init; tee -q -o ${FSM_DETECT_FILE} fsm_detect; tee -q fsm -nodetect -encoding one-hot -encfile ${FSM_ENC_FILE}`;

/** The registers fsm_detect refused for their users alone (USERS_REASON), from run 1's FSM_DETECT_FILE. */
export const refusedForUsers = (text, top) => parseDetect((text || '').split('\n'), top).refused
  .filter(r => r.reasons.length === 1 && r.reasons[0] === USERS_REASON).map(r => r.wire);

/** Run 1b, when some were refused for their users alone: run 1's netlist with them marked one-hot by hand
 *  (FSM_FORCED_FILE: markWires), quietly extracted with the others (run 1's way): every machine's codes in
 *  FSM_ENC_FILE. */
export const fsmForceCommands = () => `read_rtlil ${FSM_FORCED_FILE}; tee -q setattr -unset init; tee -q fsm_detect; `
  + `tee -q fsm -nodetect -encoding one-hot -encfile ${FSM_ENC_FILE}`;

/** The machines to re-encode one-hot, from run 1's files: [{ wire, states, init }] (wire as fsm_recode names it,
 *  init the RTLIL's); `forced`: the wires marked by hand (run 1b), kept with or without an init value (without:
 *  state 0, the flip-flops' power-up, as init). */
export function fsmChosen(pre, enc, rule = FSM_RULE, forced = []) {
  const inits = wireInits(pre);
  const zero = map => `${map[0][0].length}'${'0'.repeat(map[0][0].length)}`;
  return Object.entries(parseEncfile(enc))
    .map(([wire, map]) => ({ wire, states: map.length, init: inits[rtlilName(wire)] ?? (forced.includes(wire) && map.length ? zero(map) : undefined), map }))
    .filter(m => m.init && m.states >= rule.states && newInit(m.init, m.map))
    .map(({ wire, states, init }) => ({ wire, states, init }));
}

/** A run's messages without Yosys's warning on the wires marked by hand (fsm_detect's "Regarding the user-specified
 *  fsm_encoding attribute on <top>.<wire>:" and its indented reasons): `say` given the others. */
export function quietForced(say, top, wires) {
  const heads = new Set(wires.map(w => `Warning: Regarding the user-specified fsm_encoding attribute on ${top}.${w}:`));
  let skip = false;
  return l => {
    if (heads.has(l)) { skip = true; return; }
    if (skip && /^\s+\S/.test(l)) return;
    skip = false;
    say(l);
  };
}

/** Run 2: the chosen machines (marked in FSM_MARKED_FILE) extracted and re-encoded, the others as `fsm` does. */
export const fsmExtractCommands = () => `read_rtlil ${FSM_MARKED_FILE}; fsm -encfile ${FSM_ENC_FILE}; write_rtlil ${FSM_POST_FILE}`;

/** The new init values of the chosen machines from run 2's codes ({ \wire: init }); null when one was not
 *  re-encoded as run 1 found it, or its init state is no longer one of its states. */
export function fsmInits(machines, enc) {
  const maps = parseEncfile(enc), inits = {};
  for (const m of machines) {
    const map = maps[m.wire];
    const n = map && map.length === m.states && newInit(m.init, map);
    if (!n) return null;
    inits[rtlilName(m.wire)] = n;
  }
  return inits;
}

/** The init values of the old state registers `fsm` keeps beside a re-encoded machine for the readers it could not
 *  take in (`$fsm$oldstate\<wire>`, a copy of the register as written, in run 2's RTLIL `post`: a machine read bit by
 *  bit, as the forced ones of #652 may be): each its machine's old init, else it would power up undefined. */
export function oldStateInits(machines, post) {
  const wires = new Set([...(post || '').matchAll(/^\s*wire\b.* (\S+)$/gm)].map(m => m[1]));
  return Object.fromEntries(machines.map(m => [`$fsm$oldstate${rtlilName(m.wire)}`, m.init]).filter(([w]) => wires.has(w)));
}

/** Run 3: the rest of prepare and of the script (`synth`: synth_xilinx's command, `rest`: the usual script after
 *  its `-run :fine`) from the netlist with the new init values (FSM_POST_FILE). */
export const fsmRestCommands = (synth, rest) => `read_rtlil ${FSM_POST_FILE}; ${PREP_TAIL}; ${synth} -run map_dsp:fine; ${rest}`;
