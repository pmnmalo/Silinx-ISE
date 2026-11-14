// The text of a GitHub Classroom assignment's template repository (#3193, #3841: moved from server/classroom.js as it
// was): its workflow, which installs a release of Silinx and runs `silinx grade --visible` on each push, and the
// students' README. Isomorphic: server/classroom.js makeTemplate writes them.
import { localize } from './grade-format.js';
import { VERSION } from './version.js';

const RELEASES = 'https://github.com/pmnmalo/Silinx/releases/download';
// (the actions the workflow uses, pinned by their commits as the repository's own workflows pin them)
export const CHECKOUT = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1';
export const SETUP_NODE = 'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0';
export const WORKFLOW = '.github/workflows/silinx-grade.yml';

/** The template's workflow: on each push (and by hand), a release of Silinx installed (its zip checked against the
 *  release's SHA256SUMS) and the exercise's visible tests run on the repository; the report in the job's summary; the
 *  job fails when a visible test is not Accepted. No secret, no write permission. */
export function workflowYaml(exerciseFile, { version = VERSION } = {}) {
  if (!/^[A-Za-z0-9._-]+\.exercise\.json$/.test(exerciseFile)) throw new Error(`the exercise's file: a name of letters, digits, . _ - (${exerciseFile})`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`a release of Silinx: a version x.y.z (${version})`);
  return `# Silinx: the exercise's visible tests on each push (#3193). The verdicts are in the job's summary; the hidden tests
# are the teacher's, run at the deadline. Made by \`silinx classroom template\`: SILINX_VERSION is the release of Silinx
# that grades.
name: Silinx grade
on:
  push:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  grade:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      SILINX_VERSION: ${version}
    steps:
      - uses: ${CHECKOUT}
        with:
          persist-credentials: false
      - uses: ${SETUP_NODE}
        with:
          node-version: 24
      - name: Install Silinx
        run: |
          cd "$RUNNER_TEMP"
          curl -fsSL -o "silinx-$SILINX_VERSION.zip" "${RELEASES}/v$SILINX_VERSION/silinx-$SILINX_VERSION.zip"
          curl -fsSL -o SHA256SUMS "${RELEASES}/v$SILINX_VERSION/SHA256SUMS"
          grep " silinx-$SILINX_VERSION.zip\$" SHA256SUMS | sha256sum -c -
          unzip -q "silinx-$SILINX_VERSION.zip"
      - name: Run the visible tests
        run: |
          set +e
          node "$RUNNER_TEMP/silinx/bin/silinx.js" grade ${exerciseFile} . --visible --json "$RUNNER_TEMP/grade.json" > "$RUNNER_TEMP/report.txt"
          status=$?
          cat "$RUNNER_TEMP/report.txt"
          { echo '## Silinx: the visible tests'; echo; echo '\`\`\`'; cat "$RUNNER_TEMP/report.txt"; echo '\`\`\`'; } >> "$GITHUB_STEP_SUMMARY"
          exit $status
`;
}

/** The students' README of the template (English and Portuguese): the statement, what runs on each push. */
export function readmeText(ex, exerciseFile) {
  const ports = ex.ports.map(p => `\`${p.name}\``).join(', ');
  const part = lang => [
    `## ${localize(ex.title, lang)}`, '', localize(ex.statement, lang), '',
    ...(lang === 'pt'
      ? [`O módulo de topo é \`${ex.top}\`, com os portos ${ports}. Abra este projeto no Silinx: Project ▸ Exercise… executa os testes visíveis de \`${exerciseFile}\` (ou \`silinx grade ${exerciseFile} . --visible\`).`,
        '', 'Em cada push, o GitHub executa os testes visíveis: os vereditos estão no resumo da execução (Actions). Os testes escondidos são executados pelo professor no fim do prazo.']
      : [`The top module is \`${ex.top}\`, with the ports ${ports}. Open this project in Silinx: Project ▸ Exercise… runs the visible tests of \`${exerciseFile}\` (or \`silinx grade ${exerciseFile} . --visible\`).`,
        '', 'On each push, GitHub runs the visible tests: their verdicts are in the run\'s summary (Actions). The hidden tests are run by the teacher at the deadline.']),
  ].join('\n');
  return `# ${localize(ex.title, 'en')}\n\n${part('en')}\n\n${part('pt')}\n`;
}
