import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { originalVisibleElementRect, visibleRectsCorrespond } from '../native-visible-geometry.ts';

test('visible geometry uses native points and retains original divide/multiply order and Python rounding', async () => {
  const view = { x: 10, y: 98, width: 240, height: 302 };
  const body = [0, 98, 240, 98, 240, 400, 0, 400];
  const element = [20, 132, 120, 132, 120, 185, 20, 185];
  assert.deepEqual(await originalVisibleElementRect(view, body, element), { x: 20, y: 132, width: 100, height: 53 });
  assert.deepEqual(await originalVisibleElementRect({ x: 0, y: 0, width: 1, height: 1 },
    [0, 0, 1, 0, 1, 1, 0, 1], [0.125, 0.375, 0.625, 0.375, 0.625, 0.875, 0.125, 0.875]),
    { x: 0.12, y: 0.38, width: 0.5, height: 0.5 });
  await assert.rejects(originalVisibleElementRect(view, body, [0]), /Invalid/);
  await assert.rejects(originalVisibleElementRect(view, [0, 0, 0, 0, 0, 1, 0, 1], element), /Invalid/);
  await assert.rejects(originalVisibleElementRect({ ...view, width: Infinity }, body, element), /Invalid/);
});

test('visible rectangle correspondence matches original Python helper across boundaries and varied geometry', () => {
  const source = readFileSync(new URL('../../integration_test/test_script/case_sets/sparkling/helpers.py', import.meta.url), 'utf8');
  const input = [];
  const small = { x: 0, y: 0, width: 8, height: 8 };
  for (const offset of [0, 12, 12.000001, -12, -12.000001]) input.push([small, { ...small, x: offset }]);
  for (let i = 0; i < 2000; i++) {
    const native = { x: (i * 97) % 700 - 100, y: (i * 71) % 900 - 100, width: (i * 13) % 700 + 0.25, height: (i * 17) % 900 + 0.5 };
    input.push([native, { x: native.x + (i % 61 - 30), y: native.y + (i % 79 - 39), width: native.width * (0.7 + i % 9 / 10), height: native.height * (0.7 + i % 7 / 10) }]);
  }
  const expected = JSON.parse(execFileSync('python3', ['-c', `import ast,json,sys
data=json.load(sys.stdin)
tree=ast.parse(data['source'])
functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('_rect_values','_rects_correspond')]
namespace={}
exec(compile(ast.Module(body=functions,type_ignores=[]),'original-sparkling-geometry','exec'),namespace)
print(json.dumps([namespace['_rects_correspond'](a,b) for a,b in data['pairs']]))`,], { input: JSON.stringify({ source, pairs: input }), encoding: 'utf8' }));
  assert.deepEqual(input.map(([native, cdp]) => visibleRectsCorrespond(native, cdp)), expected);
  assert.deepEqual(expected.slice(0, 5), [true, true, false, true, false]);
  assert.throws(() => visibleRectsCorrespond(small, { ...small, width: 0 }), /Invalid/);
});
