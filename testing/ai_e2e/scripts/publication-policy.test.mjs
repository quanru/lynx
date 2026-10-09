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
  assert.match(workflow, /node scripts\/verify-build.mjs source-builds android \./);
  assert.match(workflow, /node scripts\/verify-build.mjs source-builds ios \./);
  const [build] = workflow.split('  contract-check:');
  assert.doesNotMatch(build, /secrets\.MIDSCENE/);
});

test('model-free contracts gate source builds before credentialed device jobs', async () => {
  const workflow = await readFile(new URL('../../../.github/workflows/midscene-ai-e2e.yml', import.meta.url), 'utf8');
  const build = workflow.split('  build-explorer:')[1].split('  contract-check:')[0];
  const contracts = workflow.split('  contract-check:')[1].split('  android-ai-e2e:')[0];
  assert.match(build, /needs: contract-check/);
  assert.doesNotMatch(contracts, /secrets\.|\n    if:/);
  assert.match(contracts, /node --test scripts\/\*\.test\.mjs/);
  assert.match(contracts, /python-version: '3\.13'/);
  assert.match(contracts, /native_pixels_test\.py < testing\/integration_test\/test_script\/lib\/test_runner\/mixin\/img_diff_mixin\.py/);
  assert.equal(workflow.split('node --test scripts/*.test.mjs').length - 1, 1);
  assert.match(workflow, /'testing\/integration_test\/test_script\/\*\*'/);
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

test('DevTool probes are bounded read-only prerequisites, not false migrated cases', async () => {
  const workflow = await readFile(
    new URL('../../../.github/workflows/midscene-ai-e2e.yml', import.meta.url), 'utf8');
  const probe = await readFile(new URL('./devtool-probe.mjs', import.meta.url), 'utf8');
  assert.equal(workflow.split('id: probe-devtool').length - 1, 2);
  assert.equal(workflow.split("steps.probe-devtool.outcome == 'success'").length - 1, 2);
  assert.equal(workflow.split('tee midscene_run/devtool-probe.log').length - 1, 2);
  assert.match(workflow, /forward --remove tcp:18901/);
  assert.match(workflow, /forward --no-rebind tcp:18901 tcp:8901/);
  assert.match(workflow, /if: always\(\) && steps\.native-forward\.outcome == 'success'/);
  assert.ok(workflow.indexOf('id: native-forward') < workflow.indexOf('name: Run Android Midscene cases'));
  assert.ok(workflow.includes("steps.release-native-forward.outcome == 'success'"));
  assert.doesNotMatch(probe, /OpenCard|DOM\.focus|Input\.insertText|execFile|spawn\(/);
  const client = await readFile(new URL('./devtool-client.mjs', import.meta.url), 'utf8');
  assert.match(client, /handshake\/session probe timed out/);
});
