#!/bin/sh
# The ISE runner's job-started hook (#482): the runner runs it before every job it is given
# (ACTIONS_RUNNER_HOOK_JOB_STARTED in the runner's .env, set by install.sh), and a failing hook fails
# the job before any of its steps. The repository is public: a pull request from a fork can bring a
# workflow of its own with runs-on: self-hosted, so only the ISE and Quality workflows of main, run
# on schedule or by hand, may run here. GITHUB_* are set by the runner, a workflow cannot change them.
# The repository by its ID, which its renames keep (pmnmalo/Silinx-ISE, renamed Silinx: #2624), not by its name;
# its name (GITHUB_REPOSITORY, set by the runner as the ID) then names its two workflows.
REPO_ID=1407836659
REPO="${GITHUB_REPOSITORY:-}"
refuse() {
  echo "Silinx runner: refused, $1 (only repository $REPO_ID's ise.yml and quality.yml of main, on schedule or by hand, run here)" >&2
  exit 1
}
[ "${GITHUB_REPOSITORY_ID:-}" = "$REPO_ID" ] && [ -n "$REPO" ] || refuse "repository '${GITHUB_REPOSITORY:-}' (ID '${GITHUB_REPOSITORY_ID:-}')"
case "${GITHUB_EVENT_NAME:-}" in
  schedule|workflow_dispatch) ;;
  *) refuse "event '${GITHUB_EVENT_NAME:-}'" ;;
esac
[ "${GITHUB_REF:-}" = refs/heads/main ] || refuse "ref '${GITHUB_REF:-}'"
case "${GITHUB_WORKFLOW_REF:-}" in
  "$REPO/.github/workflows/ise.yml@refs/heads/main"|"$REPO/.github/workflows/quality.yml@refs/heads/main") ;;
  *) refuse "workflow '${GITHUB_WORKFLOW_REF:-}'" ;;
esac
echo "Silinx runner: ${GITHUB_WORKFLOW_REF} (${GITHUB_EVENT_NAME}) allowed"
