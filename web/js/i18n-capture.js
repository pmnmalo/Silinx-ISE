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
};
export const CAPTURE_PT_PATTERNS = [
  [/^(\d+) bits × (\d+) samples on (\S+), (\d+) before the trigger$/, '$1 bits × $2 amostras em $3, $4 antes do disparo'],
  [/^(\d+) block RAM\(s\), in the utilization above$/, '$1 block RAM(s), na utilização acima'],
];
