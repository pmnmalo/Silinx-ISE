// Plain-language help (English and Portuguese) for the messages of Silinx HLS's checks (core/c-check.js, #1524), in the
// form of core/hints.js's HINTS, which lists them: what the message means and how to fix it.

export const C_HINTS = [
  {
    id: 'c-recursion', re: /^recursion is not possible in hardware/,
    en: { explain: 'A function calls itself, directly or through others. Hardware has a fixed number of copies of each function: it cannot make a new copy for every call, so Vitis HLS and Silinx HLS refuse recursion.',
      fix: 'Write it as a loop with a fixed bound (a for from a constant to a constant), keeping in variables what the recursive calls kept.' },
    pt: { explain: 'Uma função chama-se a si própria, diretamente ou através de outras. O hardware tem um número fixo de cópias de cada função: não pode fazer uma cópia nova a cada chamada, por isso o Vitis HLS e o Silinx HLS recusam a recursão.',
      fix: 'Escreva-a como um ciclo com limite fixo (um for de uma constante a uma constante), guardando em variáveis o que as chamadas recursivas guardavam.' },
  },
  {
    id: 'c-dynamic-memory', re: /^(malloc|calloc|realloc|free): dynamic memory/,
    en: { explain: '$1 asks for memory while the program runs. A circuit has all its memory from the start: its size must be known when it is made.',
      fix: 'Declare an array of the largest size needed (a constant), and use part of it.' },
    pt: { explain: '$1 pede memória enquanto o programa corre. Um circuito tem toda a sua memória desde o início: o tamanho tem de ser conhecido quando é feito.',
      fix: 'Declare um array com o maior tamanho necessário (uma constante) e use só parte dele.' },
  },
  {
    id: 'c-system-call', re: /^(\w+) is a system call/,
    en: { explain: '$1 asks the operating system for something. There is no operating system inside the circuit: the whole behaviour must be in the function and the functions it calls.',
      fix: 'Remove the call from the synthesized function; if it is needed for testing, call it in main() (the test bench).' },
    pt: { explain: '$1 pede algo ao sistema operativo. Dentro do circuito não há sistema operativo: todo o comportamento tem de estar na função e nas funções que ela chama.',
      fix: 'Retire a chamada da função sintetizada; se for precisa para testar, chame-a em main() (o test bench).' },
  },
  {
    id: 'c-pointer-variable', re: /a pointer variable is not possible|^the pointer '\w+': /,
    en: { explain: 'Inside the circuit there is no memory with addresses: Silinx HLS (as Vitis HLS) makes a local pointer into the arrays or variables it is set to (an array, &x, &a[i], a + i) and an offset in them, read as *p or p[i] and moved with p += n or p++.',
      fix: 'Set the pointer only to arrays or variables of its own type, and use it only as *p, p[i], p = …, p += n or p++; or use an array and an index (a[i]) instead.' },
    pt: { explain: 'Dentro do circuito não há uma memória com endereços: o Silinx HLS (como o Vitis HLS) faz de um apontador local os arrays ou variáveis para onde aponta (um array, &x, &a[i], a + i) e um deslocamento neles, lido como *p ou p[i] e movido com p += n ou p++.',
      fix: 'Aponte o apontador só para arrays ou variáveis do seu tipo e use-o só como *p, p[i], p = …, p += n ou p++; ou use um array e um índice (a[i]).' },
  },
  {
    id: 'c-pointer-arithmetic', re: /^pointer arithmetic is not possible/,
    en: { explain: 'p + 1 moves a pointer to the next element: Silinx HLS reads arrays by their index only.',
      fix: 'Write p[1] instead of *(p + 1).' },
    pt: { explain: 'p + 1 move um apontador para o elemento seguinte: o Silinx HLS só lê arrays pelo índice.',
      fix: 'Escreva p[1] em vez de *(p + 1).' },
  },
  {
    id: 'c-float', re: /^(\w+): floating point is not supported in Silinx HLS yet|floating point \((.+)\) is not supported in Silinx HLS yet/,
    en: { explain: 'Silinx HLS makes float and double in hardware (IEEE-754: + - * /, the comparisons and the conversions, each a circuit of its own, as Vitis HLS\'s cores), sqrt, fabs, floor, ceil, trunc, round, fmin, fmax, copysign, exp, log, sin, cos and pow too (#1761); $1 (math.h) only of constants (a table, computed at synthesis), not yet of other values.',
      fix: 'Compute it with + - * (a polynomial, a table), or keep it in the test bench (main and what only it calls).' },
    pt: { explain: 'O Silinx HLS faz float e double em hardware (IEEE-754: + - * /, as comparações e as conversões, cada uma um circuito, como os cores do Vitis HLS), sqrt, fabs, floor, ceil, trunc, round, fmin, fmax, copysign, exp, log, sin, cos e pow também (#1761); $1 (math.h) só de constantes (uma tabela, calculada na síntese), ainda não de outros valores.',
      fix: 'Calcule-o com + - * (um polinómio, uma tabela), ou deixe-o no test bench (o main e o que só ele chama).' },
  },
  {
    id: 'c-loop-bound', re: /^the number of iterations of this loop is not known/,
    en: { explain: 'Silinx HLS, as Vitis HLS, makes such a loop a state machine that runs until its condition is false: it works, but how many clock cycles a call takes is not known before it runs, so the report gives no latency.',
      fix: "Nothing is needed. To give the report a bound, add #pragma HLS LOOP_TRIPCOUNT max=N as the loop's first line (N the most times it runs); a 'for (int i = 0; i < N; i++)' with N a constant has its count known." },
    pt: { explain: 'O Silinx HLS, como o Vitis HLS, faz deste ciclo uma máquina de estados que corre até a condição ser falsa: funciona, mas quantos ciclos de relógio demora uma chamada não se sabe antes de correr, por isso o relatório não dá a latência.',
      fix: "Não é preciso nada. Para dar um limite ao relatório, acrescente #pragma HLS LOOP_TRIPCOUNT max=N na primeira linha do ciclo (N o número máximo de vezes que corre); um 'for (int i = 0; i < N; i++)' com N uma constante tem o número conhecido." },
  },
  {
    id: 'c-header', re: /^the header '(.+)' is not one of Silinx HLS's/,
    en: { explain: "$1 is a header of the C library for programs on a computer; its functions do not exist in a circuit.",
      fix: 'Keep the headers Silinx HLS knows: ap_int.h (ap_int<W>, ap_uint<W>), stdint.h, stdbool.h and stdio.h (printf, for the test bench).' },
    pt: { explain: '$1 é um ficheiro da biblioteca de C para programas num computador; as suas funções não existem num circuito.',
      fix: 'Fique pelos ficheiros que o Silinx HLS conhece: ap_int.h (ap_int<W>, ap_uint<W>), stdint.h, stdbool.h e stdio.h (printf, para o test bench).' },
  },
  {
    id: 'c-printf', re: /^(printf|fprintf|puts|putchar) is ignored by synthesis/,
    en: { explain: '$1 prints on the computer: in C simulation it works, but the circuit has no screen, so synthesis leaves it out.',
      fix: 'Nothing to do if it is only for testing; to see a value in hardware, give it a port (a pointer argument).' },
    pt: { explain: '$1 escreve no computador: na simulação de C funciona, mas o circuito não tem ecrã, por isso a síntese deixa-o de fora.',
      fix: 'Nada a fazer se for só para testar; para ver um valor no hardware, dê-lhe um porto (um argumento apontador).' },
  },
];
