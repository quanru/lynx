import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../../.github/workflows/midscene-ai-e2e.yml', import.meta.url), 'utf8');
test('model credentials are step-scoped, variables retain secret fallback, and official verification precedes expensive setup', () => {
  assert.doesNotMatch(workflow, /\n {6}MIDSCENE_MODEL_API_KEY:/);
  assert.match(workflow, /vars.MIDSCENE_MODEL_NAME \|\| secrets.MIDSCENE_MODEL_NAME/);
  assert.match(workflow, /vars.MIDSCENE_MODEL_BASE_URL \|\| secrets.MIDSCENE_MODEL_BASE_URL/);
  assert.match(workflow, /vars.MIDSCENE_MODEL_FAMILY \|\| secrets.MIDSCENE_MODEL_FAMILY/);
  for (const name of ["android-ai-e2e","ios-ai-e2e"]) {
    const job = workflow.split('  ' + name + ':')[1].split(/\n {2}(?=\S)/)[0];
    const verification = job.indexOf('name: Verify Midscene model compatibility');
    const setup = job.search(/name: (Install Rust toolchain|Start headless Android emulator|Build and start WebDriverAgent)/);
    assert.ok(verification > job.indexOf('name: Install Midscene test dependencies'));
    assert.ok(setup > verification);
    const preflight = job.split('name: Preflight model endpoint')[1].split('\n      - ')[0];
    const verify = job.slice(verification).split('\n      - ')[0];
    const run = job.split(/name: Run (?:Web|Android|iOS) Midscene cases/)[1].split('\n      - ')[0];
    for (const step of [preflight, verify, run]) assert.match(step, /env: (?:&midscene-model-env|\*midscene-model-env)/);
    assert.match(verify, /npm run check:model/);
  }
});

test('all Midscene packages and the lockfile use the same Rome-aligned stable SDK', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
  for (const name of ["android","core","ios","test"]) {
    const key = '@midscene/' + name;
    assert.equal(pkg.devDependencies[key], '1.15.3');
    assert.equal(lock.packages[''].devDependencies[key], '1.15.3');
    assert.equal(lock.packages['node_modules/' + key].version, '1.15.3');
  }
  assert.equal(pkg.scripts['check:model'], 'node scripts/verify-model.mjs');
});
