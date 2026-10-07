# Começar a usar o XAIlinx (passo a passo)

Não precisa de ferramentas de programação nem de git. Escolha **uma** das duas formas abaixo.

| Quero… | Use |
|---|---|
| escrever VHDL/Verilog, desenhar esquemáticos e máquinas de estados, **simular** | **Forma 1**: um só ficheiro, nada a instalar |
| também **sintetizar** e **programar uma placa real** (Basys2, Nexys, …) | **Forma 2**: a aplicação completa (instala o Node.js uma vez) |

> English: [GETTING-STARTED.md](GETTING-STARTED.md)

---

## Forma 1: um só ficheiro (a mais simples)

1. Abra a **[última versão](https://github.com/pmnmalo/XAIlinx/releases/latest)**.
2. Em **Assets**, clique em **`XAIlinx.html`** para o descarregar.
3. Faça duplo clique no ficheiro descarregado. Abre no browser (Chrome, Edge, Firefox ou Safari).
4. Na página inicial clique em **Open Example (blinky)** ou **New Project…**.

É tudo. A saber:

- Os projetos ficam guardados **dentro deste browser**, neste computador. Para guardar uma cópia
  ou passar para outro computador use **File ▸ Download Project Bundle** (e **File ▸ Open Project
  Bundle** para o voltar a abrir). Apagar os dados do browser apaga os projetos.
- A síntese e a programação da placa não estão disponíveis nesta edição (precisam da Forma 2).
- A interface pode ser posta em português em **View ▸ Language**.

---

## Forma 2: a aplicação completa

### Passo 1: instalar o Node.js (uma vez)

O XAIlinx corre no **Node.js**, um programa gratuito.

1. Vá a **https://nodejs.org** e descarregue a versão marcada **LTS**.
2. Execute o instalador e aceite as opções por omissão (Next, Next, Install).
   - **Windows:** mantenha a opção *Add to PATH* selecionada (já vem assim). **Não** precisa das
     "Tools for native modules".
   - **macOS:** abra o `.pkg` descarregado e siga os passos.
   - **Linux:** use o gestor de pacotes (Ubuntu/Debian: `sudo apt install nodejs npm`) ou o
     instalador do nodejs.org. É preciso a versão 18 ou mais recente.

### Passo 2: descarregar o XAIlinx

1. Abra a **[última versão](https://github.com/pmnmalo/XAIlinx/releases/latest)**.
2. Em **Assets**, descarregue **`xailinx-<versão>.zip`** (por exemplo `xailinx-0.2.0.zip`).
   - Não use o botão verde **Code ▸ Download ZIP** nem o "Source code": essa versão não traz tudo
     o que o XAIlinx precisa (funciona na mesma, mas o primeiro arranque precisa de Internet para
     descarregar o que falta).
3. **Descompacte-o** (extraia-o) para uma pasta que volte a encontrar, por exemplo *Documentos*:
   - **Windows:** botão direito no zip ▸ **Extrair Tudo…** ▸ Extrair. Não o execute de dentro do zip.
   - **macOS:** duplo clique no zip.
   - Fica com uma pasta chamada **`xailinx`**.

### Passo 3: arrancar o XAIlinx

Abra a pasta `xailinx` e faça duplo clique no ficheiro do seu sistema:

| Sistema | Duplo clique em |
|---|---|
| Windows | **`Start XAIlinx.bat`** |
| macOS | **`Start XAIlinx.command`** |
| Linux | **`start-xailinx.sh`** (ou `./start-xailinx.sh` num terminal) |

Abre-se uma janela preta (o servidor do XAIlinx) e depois o browser mostra o XAIlinx em
**http://127.0.0.1:8642**.

- **Mantenha a janela preta aberta** enquanto trabalha. Fechá-la desliga o XAIlinx.
- Fechou o separador do browser sem querer? Volte a http://127.0.0.1:8642 enquanto a janela está aberta.
- Fazer duplo clique no ficheiro com o XAIlinx já a correr só volta a abrir o browser.

**Só da primeira vez pode aparecer:**

- **Windows: "O Windows protegeu o seu PC"**: clique em **Mais informações ▸ Executar mesmo assim**.
- **Firewall do Windows** pergunta pelo Node.js: clique em **Permitir** (o XAIlinx só aceita
  ligações do próprio computador).
- **macOS: "não pode ser aberto porque é de um programador não identificado"**: botão direito
  (ou Ctrl-clique) em `Start XAIlinx.command` ▸ **Abrir** ▸ **Abrir**. Das vezes seguintes basta
  o duplo clique.

### Passo 4: usar

- Página inicial ▸ **Open Example (blinky)** para explorar um projeto completo, ou **New Project…**.
- Os projetos ficam em pastas normais em **`XAIlinx-projects`**, na sua pasta de utilizador
  (Windows: `C:\Users\<você>\XAIlinx-projects`, macOS: `/Users/<você>/XAIlinx-projects`).
  Pode copiá-los, fazer cópias de segurança, ou comprimi-los para entregar.
- **File ▸ Export ISE Project (.zip)** cria um zip que também abre no Xilinx ISE 14.7.
- A interface pode ser posta em português em **View ▸ Language**.

### Atualizar o XAIlinx

Descarregue o novo `xailinx-<versão>.zip`, descompacte-o e use a nova pasta (pode apagar a
antiga). **Os seus projetos não estão dentro dessa pasta**, por isso mantêm-se.

---

## Síntese e programação de uma placa (opcional)

Precisam de mais duas coisas. O seu professor pode já as ter preparadas.

1. **Xilinx ISE 14.7** (licença WebPACK gratuita) para sintetizar e gerar o bitstream. Em qualquer
   computador corre dentro do **Docker**:
   - instale o [Docker Desktop](https://www.docker.com/products/docker-desktop/) (nos Mac com
     Apple Silicon, o OrbStack é uma alternativa mais rápida);
   - descarregue `xailinx-ise-docker-kit-<versão>.zip` da mesma página e siga o seu
     `ise/README.md`: descarrega o instalador do ISE e a licença com a sua conta AMD gratuita e
     corre um script (demora 20–60 minutos, uma vez). O ISE não pode ser partilhado, por isso cada
     pessoa cria a sua cópia.
2. **O controlador USB da placa** para a programar:
   - **Windows:** instale o Digilent **Adept 2** (Runtime + Utilities) a partir de digilent.com.
   - **macOS (Basys2):** num Terminal, dentro da pasta `xailinx`, execute
     `brew install libusb python` e `./scripts/install-adepttool.sh` (precisa do [Homebrew](https://brew.sh)).
   - **Linux:** Digilent Adept, ou o openFPGALoader do gestor de pacotes.

No XAIlinx, **Tools ▸ Toolchain Settings** mostra o que foi encontrado.

---

## Problemas?

| O que aparece | O que fazer |
|---|---|
| O arranque diz **Node.js is not installed** | Instale-o (Passo 1). Feche a janela e faça duplo clique outra vez. |
| Browser: **"Não é possível aceder a este site"** | A janela do XAIlinx foi fechada: faça duplo clique outra vez no ficheiro de arranque. |
| **"Port 8642 is used by another program"** | Outro programa usa essa porta. Abra um terminal na pasta `xailinx` e execute `node bin/xailinx.js serve --port 8643 --open`. |
| Consola: **"the XAIlinx server is not running"** | O mesmo: volte a arrancar o XAIlinx. As alterações por guardar são guardadas assim que ele voltar. |
| macOS: o ficheiro `.command` **abre num editor de texto** | Botão direito ▸ Abrir com ▸ Terminal. |
| A janela abre e fecha logo | Abra um terminal na pasta `xailinx` e execute `node bin/xailinx.js serve --open` para ler a mensagem. |

**Abrir um terminal numa pasta:** Windows: abra a pasta, clique na barra de endereço, escreva
`cmd` e carregue em Enter. macOS: botão direito na pasta ▸ *Novo Terminal na Pasta* (ou abra o
Terminal, escreva `cd `, arraste a pasta para a janela e carregue em Enter).

---

## Para quem usa git

```bash
git clone https://github.com/pmnmalo/XAIlinx.git
cd XAIlinx
npm install
npm start            # http://127.0.0.1:8642
```
