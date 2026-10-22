import { defineNode } from '@midscene/test';
import { defineTestProject } from '@midscene/test/config';

export default defineTestProject({
  projects: [{ name: 'signal-proof', files: { include: ['ci-interruption.yaml'] }, nodes: [
    defineNode({ name: 'ci.waitForCancellation', async execute({ signal }) {
      console.log('CI_SIGNAL_READY');
      await new Promise((_resolve, reject) => {
        signal.throwIfAborted();
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    } }),
    defineNode({ name: 'ci.mustNotRun', execute() { throw new Error('Interrupted suite executed a later case.'); } }),
  ] }],
  test: { maxConcurrentProjects: 1, maxConcurrentFiles: 1, testTimeout: 10_000 },
  output: { reportDir: process.env.CI_SIGNAL_REPORT_DIR },
});
