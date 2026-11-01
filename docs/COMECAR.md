# Começar a usar o Silinx ISE (passo a passo)

Não precisa de ferramentas de programação nem de git. **A Forma 1, no browser, faz tudo**: a Forma 2 é
outra maneira de correr o mesmo Silinx, no seu computador.

| Quero… | Use |
|---|---|
| escrever VHDL/Verilog, desenhar esquemáticos e máquinas de estados, simular, **sintetizar** e **programar uma placa Basys2 / Nexys2** | **Forma 1**: no browser, nada a instalar |
| trabalhar sem Internet, guardar os projetos em pastas com qualquer browser, programar com as ferramentas instaladas (Adept, openFPGALoader…), ou usar o **Xilinx ISE 14.7** para outras placas | **Forma 2**: correr o Silinx localmente (instala o Node.js uma vez) |

> English: [GETTING-STARTED.md](GETTING-STARTED.md)

---

## Forma 1: no browser (a mais simples)

O mais rápido: abra **https://pmnmalo.github.io/Silinx-ISE/** no browser (a última versão lançada; os seus
projetos ficam nesse browser. A versão em desenvolvimento, com as alterações ainda não lançadas, está em
https://pmnmalo.github.io/Silinx-ISE/dev/, com os projetos à parte) e passe ao passo 4. Ou descarregue-o, para trabalhar sem Internet:

1. Abra a **[última versão](https://github.com/pmnmalo/Silinx-ISE/releases/latest)**.
2. Em **Assets**, clique em **`Silinx-ISE.html`** para o descarregar.
3. Faça duplo clique no ficheiro descarregado. Abre no browser (Chrome, Edge, Firefox ou Safari).
4. Na página inicial clique em **New Project…** e escolha em *Start from* **Example: gates** (portas lógicas desenhadas num esquemático: um bom primeiro exemplo), **Example: traffic** (uma passadeira para peões: um diagrama de estados e uma tabela de verdade), **Example: blinky** (ou *pong*, um jogo para dois, *stopwatch*, *clock*, *vga*, uma imagem num monitor VGA, ou *isqrt*, uma função em C feita em hardware) ou **Empty project**. Depois dos exemplos vêm os **Test design: …**: projetos com que o próprio Silinx é testado (esquemáticos, diagramas de estados, programas em C para o Silinx HLS), cada um com o seu teste (uma bancada de teste, ou o `main()` do programa em C), para ver o que o Silinx faz com cada tipo de fonte.

É tudo. A saber:

- Os projetos ficam guardados **dentro deste browser**, neste computador. Para guardar uma cópia
  ou passar para outro computador use **File ▸ Download Project Bundle** (e **File ▸ Open Project
  Bundle** para o voltar a abrir). Apagar os dados do browser apaga os projetos.
- **Ou guarde-os numa pasta do seu disco** (Chrome ou Edge): **File ▸ Open Workspace Folder…**
  (também na página inicial) e escolha uma pasta, por exemplo uma nova pasta `Silinx-projects` nos
  Documentos. Cada projeto passa a ser uma pasta normal lá dentro (`silinx.json`, `src/`, `sim/`,
  `constraints/`, e `build/` com o bitstream), igual às do Silinx a correr localmente (Forma 2): a pasta
  também abre lá, e a pasta de um projeto pode ser comprimida em zip e entregue. O browser lembra-se
  da pasta; quando voltar a pedir autorização, clique em **Reopen Silinx-projects** na página
  inicial. **File ▸ Copy Browser Projects to the Folder** copia os projetos que já tinha no browser,
  e **File ▸ Use Browser Storage** volta ao browser. A barra de estado mostra onde ficam os
  projetos. O Firefox e o Safari não abrem pastas: aí os projetos ficam no browser.
- **Implement Design** e **Generate Programming File** correm a cadeia de ferramentas Silinx no
  browser (placas Basys2 e Nexys2; a primeira vez descarrega as ferramentas do site, cerca de 100 MB,
  que o browser guarda; também no `Silinx-ISE.html` descarregado): o bitstream (`top.bit`) é
  descarregado.
- **Programar a placa a partir do browser** (Chrome ou Edge, ou o Chrome num tablet Android; o
  Firefox e o Safari não acedem a dispositivos USB; com a página aberta a partir do endereço do site,
  não a partir do ficheiro descarregado): ligue o cabo USB da placa, ligue-a, e depois **Configure Target Device ▸ Program
  FPGA** e escolha a placa na lista que o browser mostra (só na primeira vez). No Windows, se o
  Digilent Adept estiver instalado, o controlador dele ocupa a placa: dê-lhe o controlador WinUSB com
  o [Zadig](https://zadig.akeo.ie) para a usar a partir do browser. No Linux, permita o acesso à placa
  com uma regra udev (`SUBSYSTEM=="usb", ATTR{idVendor}=="1443", MODE="0666"`). Para guardar o desenho
  na flash da placa (PROM), para que arranque ao ligar, selecione a PROM (XCF02S / XCF04S) na cadeia e
  clique em **Program PROM**, com o jumper de modo em ROM (Basys2: JP3).
- **Num iPad ou num tablet** (Safari, ou o browser do tablet): editar, desenhar, simular e
  **Generate Programming File** funcionam. **O Chrome num tablet Android também programa a placa**,
  como num computador (verificado num tablet Samsung; a placa na porta USB do tablet); o Safari num iPad não acede a dispositivos USB
  (programe o `.bit` descarregado a partir de um computador ou de um tablet Android). Os projetos ficam no browser, que o iPadOS pode apagar ao fim de algumas
  semanas sem uso: guarde uma cópia com **File ▸ Export Silinx ISE Project (.zip)…**. Um tablet tem
  menos memória, por isso um desenho grande pode falhar na síntese. Os menus do botão direito abrem
  com um **toque longo** (o dedo parado meio segundo); dois dedos movem um desenho e o gesto de pinça faz zoom. Na vertical o painel Projeto é uma gaveta (o botão à esquerda do
  cabeçalho) e as propriedades dos editores abrem por cima do desenho (**Propriedades**).
- A interface pode ser posta em português em **View ▸ Language**.

---

## Forma 2: correr o Silinx localmente (Node.js)

O mesmo Silinx, a correr no seu computador em vez do site: os projetos como pastas em
`Silinx-projects` com qualquer browser, a síntese sem Internet, a placa programada também com as
ferramentas instaladas (Digilent Adept, openFPGALoader, xc3sprog, adepttool) ou a partir do Firefox e
do Safari, e o Xilinx ISE 14.7 para as placas que a cadeia de ferramentas Silinx ainda não suporta.

### Passo 1: instalar o Node.js (uma vez)

O Silinx corre no **Node.js**, um programa gratuito.

1. Vá a **https://nodejs.org** e descarregue a versão marcada **LTS**.
2. Execute o instalador e aceite as opções por omissão (Next, Next, Install).
   - **Windows:** mantenha a opção *Add to PATH* selecionada (já vem assim). **Não** precisa das
     "Tools for native modules".
   - **macOS:** abra o `.pkg` descarregado e siga os passos.
   - **Linux:** use o gestor de pacotes (Ubuntu/Debian: `sudo apt install nodejs npm`) ou o
     instalador do nodejs.org. É preciso a versão 18 ou mais recente.

### Passo 2: descarregar o Silinx

1. Abra a **[última versão](https://github.com/pmnmalo/Silinx-ISE/releases/latest)**.
2. Em **Assets**, descarregue **`silinx-ise-<versão>.zip`** (por exemplo `silinx-ise-15.10.21.zip`).
   - Não use o botão verde **Code ▸ Download ZIP** nem o "Source code": essa versão não traz tudo
     o que o Silinx precisa (funciona na mesma, mas o primeiro arranque precisa de Internet para
     descarregar o que falta).
3. **Descompacte-o** (extraia-o) para uma pasta que volte a encontrar, por exemplo *Documentos*:
   - **Windows:** botão direito no zip ▸ **Extrair Tudo…** ▸ Extrair. Não o execute de dentro do zip.
   - **macOS:** duplo clique no zip.
   - Fica com uma pasta chamada **`silinx-ise`**.

*Opcional, para confirmar que o ficheiro é o da versão (por exemplo um que veio da página de uma
cadeira):* a versão lista o checksum SHA-256 de cada ficheiro nas suas notas e no ficheiro
**`SHA256SUMS`**. Descarregue o `SHA256SUMS` para a mesma pasta e, num terminal aí, corra
`sha256sum -c SHA256SUMS --ignore-missing` (Linux) ou `shasum -a 256 -c SHA256SUMS --ignore-missing`
(macOS): o ficheiro tem de dizer `OK`. No Windows, `Get-FileHash silinx-ise-<versão>.zip` no PowerShell
mostra o checksum, a comparar com o das notas. Cada ficheiro tem também a atestação de proveniência do
GitHub (foi construído pelo workflow Release do repositório a partir da tag da versão): com o
[GitHub CLI](https://cli.github.com), `gh attestation verify silinx-ise-<versão>.zip --repo pmnmalo/Silinx-ISE`.

### Passo 3: arrancar o Silinx

Abra a pasta `silinx-ise` e faça duplo clique no ficheiro do seu sistema:

| Sistema | Duplo clique em |
|---|---|
| Windows | **`Start Silinx-ISE.bat`** |
| macOS | **`Start Silinx-ISE.command`** |
| Linux | **`start-silinx-ise.sh`** (ou `./start-silinx-ise.sh` num terminal) |

Abre-se uma janela preta (o servidor do Silinx) e depois o browser mostra o Silinx em
**http://127.0.0.1:8642**.

- **Mantenha a janela preta aberta** enquanto trabalha. Fechá-la desliga o Silinx.
- Fechou o separador do browser sem querer? Volte a http://127.0.0.1:8642 enquanto a janela está aberta.
- Fazer duplo clique no ficheiro com o Silinx já a correr só volta a abrir o browser.

**Só da primeira vez pode aparecer:**

- **Windows: "O Windows protegeu o seu PC"**: clique em **Mais informações ▸ Executar mesmo assim**.
- **Firewall do Windows** pergunta pelo Node.js: clique em **Permitir** (o Silinx só aceita
  ligações do próprio computador).
- **macOS: "não pode ser aberto porque é de um programador não identificado"**: botão direito
  (ou Ctrl-clique) em `Start Silinx-ISE.command` ▸ **Abrir** ▸ **Abrir**. Das vezes seguintes basta
  o duplo clique.

### Passo 4: usar

- Página inicial ▸ **New Project…**, *Start from* **Example: gates** para começar (portas AND, OR, NOT e NAND
  num esquemático: um detetor de números primos de 4 bits nos interruptores e em dois LEDs), **Example: traffic**
  a seguir (uma passadeira para peões: o controlador é um diagrama de estados, as luzes uma tabela de
  verdade), **Example: blinky** para explorar um projeto completo, ou **Empty project**.
- Os projetos ficam em pastas normais em **`Silinx-projects`**, na sua pasta de utilizador
  (Windows: `C:\Users\<você>\Silinx-projects`, macOS: `/Users/<você>/Silinx-projects`).
  Pode copiá-los, fazer cópias de segurança, ou comprimi-los para entregar.
- **File ▸ Export Xilinx ISE Project (.zip)** cria um zip que abre no Xilinx ISE 14.7; **File ▸ Export Silinx ISE Project (.zip)** guarda o projeto Silinx completo (com os diagramas ASM e esquemáticos), que se reabre com **Import Silinx ISE Project**.
- A interface pode ser posta em português em **View ▸ Language**.

### Atualizar o Silinx

Descarregue o novo `silinx-ise-<versão>.zip`, descompacte-o e use a nova pasta (pode apagar a
antiga). **Os seus projetos não estão dentro dessa pasta**, por isso mantêm-se.

---

## Síntese e programação de uma placa com o Silinx a correr localmente (opcional)

No browser (Forma 1) não é preciso mais nada para as Basys2 e Nexys2. Com o Silinx a correr
localmente (Forma 2), precisam de até mais duas coisas. O seu professor pode já as ter preparadas.

1. **Para as placas Basys2 e Nexys2, nada:** a *toolchain Silinx*, o modo por omissão, sintetiza e
   gera o bitstream sem nenhuma ferramenta Xilinx. **As placas Spartan-6, a Nexys3 e a Atlys,
   também**, no browser e com o Silinx a correr localmente; a Atlys não tem display de sete
   segmentos nem VGA próprios, e o Silinx põe-nos no seu conector VHDCI (como os liga uma Digilent
   VmodBB). Para as outras placas (ou os processos que
   precisam do ISE), o **Xilinx ISE 14.7** (licença WebPACK gratuita); em qualquer computador corre
   dentro do **Docker**, e depois escolha um modo ISE em *Tools ▸ Toolchain Settings*:
   - instale o [Docker Desktop](https://www.docker.com/products/docker-desktop/) (nos Mac com
     Apple Silicon, o OrbStack é uma alternativa mais rápida);
   - descarregue `silinx-ise-docker-kit-<versão>.zip` da mesma página e siga o seu
     `ise/README.md`: descarrega o instalador do ISE e a licença com a sua conta AMD gratuita e
     corre um script (demora 20–60 minutos, uma vez). O ISE não pode ser partilhado, por isso cada
     pessoa cria a sua cópia.
2. **O controlador USB da placa** para a programar:
   - **Windows:** instale o Digilent **Adept 2** (Runtime + Utilities) a partir de digilent.com.
   - **macOS (Basys2):** num Terminal, dentro da pasta `silinx-ise`, execute
     `brew install libusb python` e `./scripts/install-adepttool.sh` (precisa do [Homebrew](https://brew.sh)).
   - **Linux:** Digilent Adept, ou o openFPGALoader do gestor de pacotes.

No Silinx, **Tools ▸ Toolchain Settings** mostra o que foi encontrado.

---

## Problemas?

| O que aparece | O que fazer |
|---|---|
| O arranque diz **Node.js is not installed** | Instale-o (Passo 1). Feche a janela e faça duplo clique outra vez. |
| Browser: **"Não é possível aceder a este site"** | A janela do Silinx foi fechada: faça duplo clique outra vez no ficheiro de arranque. |
| **"Port 8642 is used by another program"** | Outro programa usa essa porta. Abra um terminal na pasta `silinx-ise` e execute `node bin/silinx-ise.js serve --port 8643 --open`. |
| Consola: **"the Silinx server is not running"** | O mesmo: volte a arrancar o Silinx. As alterações por guardar são guardadas assim que ele voltar. |
| macOS: o ficheiro `.command` **abre num editor de texto** | Botão direito ▸ Abrir com ▸ Terminal. |
| A janela abre e fecha logo | Abra um terminal na pasta `silinx-ise` e execute `node bin/silinx-ise.js serve --open` para ler a mensagem. |

**Abrir um terminal numa pasta:** Windows: abra a pasta, clique na barra de endereço, escreva
`cmd` e carregue em Enter. macOS: botão direito na pasta ▸ *Novo Terminal na Pasta* (ou abra o
Terminal, escreva `cd `, arraste a pasta para a janela e carregue em Enter).

---

## Para quem usa git

```bash
git clone https://github.com/pmnmalo/Silinx-ISE.git
cd Silinx-ISE
npm install
npm start            # http://127.0.0.1:8642
```
