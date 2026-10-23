import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('CI fetch can use a second DNS address without retrying the HTTP request', { timeout: 15_000 }, () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/midscene-ai-e2e.yml', import.meta.url), 'utf8');
  const options = /^env:\n(?:  #.*\n)*  NODE_OPTIONS: (.+)$/m.exec(workflow)?.[1];
  assert.ok(options, 'Read the actual workflow options, not a test-only setting');
  const script = `
    const dns = require('node:dns'), net = require('node:net');
    const { createServer } = require('node:http');
    let requests = 0, lookupAll;
    const server = createServer((req, res) => { requests++; res.end('connected'); });
    server.listen(0, '127.0.0.1', async () => {
      const lookup = dns.lookup;
      dns.lookup = (name, options, callback) => {
        if (name !== 'model-network.test') throw new Error('Unexpected DNS request');
        lookupAll = options.all === true;
        const addresses = [{ address: '::1', family: 6 }, { address: '127.0.0.1', family: 4 }];
        process.nextTick(() => lookupAll ? callback(null, addresses) : callback(null, addresses[0].address, 6));
      };
      const result = { autoSelectFamily: net.getDefaultAutoSelectFamily(),
        attemptTimeout: net.getDefaultAutoSelectFamilyAttemptTimeout(), dnsOrder: dns.getDefaultResultOrder() };
      try {
        const response = await fetch('http://model-network.test:' + server.address().port, { signal: AbortSignal.timeout(5000) });
        result.body = await response.text();
      } catch { result.failed = true; }
      finally {
        dns.lookup = lookup;
        server.closeAllConnections(); server.close();
      }
      console.log(JSON.stringify({ ...result, requests, lookupAll }));
    });
  `;
  for (const enabled of [false, true]) {
    const child = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8', timeout: 6500,
      env: { ...process.env, NODE_USE_ENV_PROXY: '0',
        NODE_OPTIONS: enabled ? options : '--dns-result-order=ipv4first --no-network-family-autoselection' },
    });
    assert.equal(child.status, 0, JSON.stringify({ stderr: child.stderr, stdout: child.stdout, error: child.error?.message }));
    const result = JSON.parse(child.stdout);
    assert.equal(result.autoSelectFamily, enabled);
    assert.equal(result.lookupAll, enabled);
    assert.equal(result.requests, enabled ? 1 : 0);
    if (enabled) {
      assert.equal(result.dnsOrder, 'ipv4first');
      assert.equal(result.attemptTimeout, 1000);
      assert.equal(result.body, 'connected');
    } else assert.equal(result.failed, true);
  }
});
