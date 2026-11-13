// Portuguese strings of the logic analyzer (#3176: the Design Summary's Logic Analyzer table, web/js/summary.js), merged
// into the dictionary of i18n.js. The probes' paths and the clock are the design's names, as they are.
export const CAPTURE_PT = {
  'Logic Analyzer': 'Analisador Lógico',
  'Probes': 'Sondas',
  'Samples': 'Amostras',
  'Trigger': 'Disparo',
  'Link': 'Ligação',
  'rises': 'sobe',
  'falls': 'desce',
  'changes': 'muda',
  'and': 'e',
  'or': 'ou',
  'the first sample': 'a primeira amostra',
  // the processes (Configure Target Device) and the settings' dialog (web/js/capture-ui.js)
  'Analyze Design Using the Logic Analyzer': 'Analisar o Projeto com o Analisador Lógico',
  'Logic Analyzer Settings': 'Definições do Analisador Lógico',
  'View the Last Capture': 'Ver a Última Captura',
  'Signals to watch:': 'Sinais a observar:',
  'Samples:': 'Amostras:',
  'Before the trigger:': 'Antes do disparo:',
  'Trigger:': 'Disparo:',
  'All (and)': 'Todas (e)',
  'Any (or)': 'Qualquer (ou)',
  'Add a condition': 'Acrescentar uma condição',
  'Remove the condition': 'Remover a condição',
  'Implement inserts the capture core (the Silinx toolchain: the Spartan-3E, the Spartan-6, the 7-series); program the board, then Analyze Design Using the Logic Analyzer.':
    'A Implementação insere o núcleo de captura (a cadeia de ferramentas Silinx: o Spartan-3E, o Spartan-6, a série 7); programe a placa e depois Analisar o Projeto com o Analisador Lógico.',
};
export const CAPTURE_PT_PATTERNS = [
  // (the board's oscillator as the capture's clock, #3481)
  [/^the board's clock (\S+) \(([^,]+), ([\d.]+) ns\)$/, 'o relógio da placa $1 ($2, $3 ns)'],
  [/^(\d+) bits × (\d+) samples on (.+), (\d+) before the trigger$/, (m, w, d, c, n) => `${w} bits × ${d} amostras em ${c.replace(/^the board's clock (\S+) \(([^,]+), ([\d.]+) ns\)$/, 'o relógio da placa $1 ($2, $3 ns)')}, ${n} antes do disparo`],
  [/^(\d+) block RAM\(s\), in the utilization above$/, '$1 block RAM(s), na utilização acima'],
  [/^(\d+) bits × (\d+) samples: (\d+) block RAM\(s\)( of the device's (\d+))?$/, (m, w, d, b, of, n) => `${w} bits × ${d} amostras: ${b} block RAM(s)${of ? ` das ${n} do dispositivo` : ''}`],
  // (the window of a capture, its tab)
  [/^Capture \((.+)\)$/, 'Captura ($1)'],
];
