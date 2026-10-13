import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = process.cwd() + '/source';
const { platform, CONTROL_DIR: directory, PRODUCER_HEAD: producer } = process.env;
assert.equal(producer, 'a47143b4c95a51ff3b27eb07ad0a7b320e8c4208');
assert.ok(['android', 'ios'].includes(platform));
execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', producer, 'HEAD']);
const checkout = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const { verifyBuild } = await import(pathToFileURL(root + '/testing/ai_e2e/scripts/verify-build.mjs'));
await verifyBuild(directory + '/source-build', platform, checkout);
// Frozen before the user-approved layout change. No original test is patched.
const expected = {
  'VideoBasic.py': '48f0ce11440cc734366a8912ef2abcc15bde9c9ec625f78038662c59834d792f',
  'VideoAttributes.py': 'ff7dae8f9dee30144f11a0a0f699cc8510bba3d7cb3aca9a1fd2e266fd0cca1c',
  'VideoBoundary.py': 'a371d01bcf8025a1a024ba43330099fe128454c537998b378de2b2b74d29f5df',
  'VideoModes.py': '169ca48bf094011ff70a452c636ff75e791abd3bcdb5835ca9425438d301a3d5',
  'video_utils.py': 'eaa422f66c10a45a75b2d63ba0c623f2661f6a1ed85a796ad5475561881a2d70',
};
for (const [file, sha] of Object.entries(expected)) {
  const path = root + '/testing/integration_test/test_script/case_sets/xelement/' + file;
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), sha, file);
}
const fixture = readFileSync(root + '/testing/integration_test/demo_pages/video/index.tsx', 'utf8');
assert.equal(fixture.match(/className="controls seek-controls"/g)?.length, 2);
writeFileSync(directory + '/original-source-checksums.json', JSON.stringify({ checkout, originalFiles: expected }, null, 2));
console.log('Verified original Python sources, approved two-row fixture and exact app archive:', checkout);
