// Portuguese texts of the device's resources checked against a design (packages/silinx-fpga/src/resource-check.js; the change of the
// target device, web/js/device-change.js, #796), merged into web/js/i18n.js.

// packages/silinx-fpga/src/resource-check.js resourceNoun's names
const NOUN_PT = {
  'flip-flops': 'flip-flops', LUTs: 'LUTs', slices: 'slices', 'bits of distributed RAM': 'bits de RAM distribuída', 'I/O pads': 'pinos de E/S',
  'block RAMs': 'RAMs de bloco', 'block RAM halves (RAMB8BWER)': 'metades de RAM de bloco (RAMB8BWER)', multipliers: 'multiplicadores', 'DSP slices': 'slices DSP',
  'global clock buffers': 'buffers globais de relógio', 'I/O clock buffers': 'buffers de relógio de E/S', 'horizontal clock buffers': 'buffers horizontais de relógio',
  DCMs: 'DCMs', PLLs: 'PLLs', 'memory controllers': 'controladores de memória',
};

export const RESOURCES_PT = {
  'Device Change': 'Mudança de Dispositivo',
  'Change Device': 'Mudar o Dispositivo',
  'The device can still be changed: change the design (or choose another device) before running the flow.':
    'O dispositivo pode ser mudado na mesma: altere o projeto (ou escolha outro dispositivo) antes de executar o fluxo.',
};

export const RESOURCES_PT_PATTERNS = [
  [/^The design, as it is, does not fit the (\w+):$/, 'O projeto, tal como está, não cabe no $1:'],
  [/^Module '(.+)' uses (\w+), which the (.+) family does not have: use (\w+) instead\.$/, "O módulo '$1' usa $2, que a família $3 não tem: use $4 em vez dele."],
  [/^Module '(.+)' uses (\w+), which the (.+) family does not have, nor an equivalent\.$/, "O módulo '$1' usa $2, que a família $3 não tem, nem um equivalente."],
  [/^(\d+) (.+) needed, the (\w+) has (\d+)\.$/, (m, n, noun, part, count) => `O projeto precisa de ${n} ${NOUN_PT[noun] || noun}, o ${part} tem ${count}.`],
];
