// The route of automatic grading (#3192) for the interface of the server editions: a synthesis test of a project's
// exercise graded on the project as it is saved (#3216), in a grading process as silinx grade grades it (server/grade.js:
// its limits, the device's chip database got first, #3215), where the page has no open synthesis of its own (the
// browser editions run it in the flow's worker, web/js/grade-synth-browser.js). Answers the test's result.
import { isExerciseFile } from '../core/grade-format.js';
import { exerciseUnitNames } from '../core/grade-design.js';

export function registerGradeRoutes(api, { wrap, projects: P }) {
  api.post('/projects/:name/grade/synthesis', wrap(async req => {
    const { exercise: rel, test: id } = req.body && typeof req.body === 'object' ? req.body : {};
    if (!isExerciseFile(rel)) throw new P.HttpError(400, 'exercise: the project\'s .exercise.json');
    const dir = P.projectDir(req.params.name);
    const { loadExercise, gradeSubmission, readSubmission } = await import('./grade.js');
    const { exercise: ex, problems } = loadExercise(P.safeJoin(dir, rel));
    if (!ex) throw new P.HttpError(400, problems.join('\n'));
    const test = ex.tests.find(t => t.id === id);
    if (test?.kind !== 'synthesis') throw new P.HttpError(400, `${rel} has no synthesis test '${id}'`);
    const r = await gradeSubmission({ ...ex, tests: [test] }, { ...await readSubmission(dir), name: req.params.name }, { exerciseUnits: [...exerciseUnitNames(ex)] });
    return { result: r.tests[0] };
  }));
}
