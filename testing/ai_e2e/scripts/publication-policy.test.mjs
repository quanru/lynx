import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('both platforms consume current-source artifacts and verify their revision', async () => {
  const workflow = await readFile(
    new URL('../../../.github/workflows/midscene-ai-e2e.yml', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(workflow, /releases\/download|LYNX_RELEASE_TAG|release_tag:/);
  assert.equal(workflow.split('needs: build-explorer').length - 1, 2);
  assert.match(workflow, /node scripts\/verify-build.mjs \. android/);
  assert.match(workflow, /node scripts\/verify-build.mjs \. ios/);
  const [build] = workflow.split('  fork-contract-check:');
  assert.doesNotMatch(build, /secrets\.MIDSCENE/);
});

test('publication defaults to the default branch and only exposes deployed links', async () => {
  const workflow = await readFile(
    new URL('../../../.github/workflows/midscene-ai-e2e.yml', import.meta.url),
    'utf8',
  );
  const [tests, publication] = workflow.split('  pages-report:');
  assert.doesNotMatch(tests, /--pages-url/);
  assert.ok(
    publication.includes(
      'vars.MIDSCENE_PAGES_BRANCH || github.event.repository.default_branch',
    ),
  );
  assert.ok(publication.includes('id: pages\n        continue-on-error: true'));
  assert.ok(publication.includes('enablement: false'));
  assert.ok(
    publication.includes(
      'Settings > Pages > Build and deployment > Source > GitHub Actions',
    ),
  );
  assert.ok(
    publication.includes('--output "$RUNNER_TEMP/published-summary.md"'),
  );
  assert.ok(
    publication.includes('if: steps.deployment.outcome == \'success\''),
  );
  assert.ok(
    publication.indexOf('Add published report evidence')
      > publication.indexOf('id: deployment'),
  );
  assert.doesNotMatch(publication, /--output "\$GITHUB_STEP_SUMMARY"/);
});
