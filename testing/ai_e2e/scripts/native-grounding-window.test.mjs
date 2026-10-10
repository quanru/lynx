import assert from 'node:assert/strict';
import test from 'node:test';

// Test the pinned SDK, not a reimplementation of its crop behavior. These are
// model-free search-area checks; they do not claim correct model/device taps.
const { default: Service } = await import('../node_modules/@midscene/core/dist/es/service/index.mjs');
const { expandSearchArea, mergeSearchAreaResults } = await import('../node_modules/@midscene/core/dist/es/ai-model/workflows/grounding/search-area.mjs');

test('full-frame iOS grounding does not inherit the evidenced blank planning crop', async () => {
  const shotSize = { width: 1206, height: 2622 };
  const planLocatedElement = { center: [362, 1573] };
  // Actual run 38028650562 / iOS VideoBoundary Locate task: the 400px crop
  // begins below the visible gray panel and excludes its ready-status row.
  const crop = expandSearchArea(mergeSearchAreaResults(planLocatedElement), shotSize);
  assert.deepEqual(crop, { left: 163, top: 1374, width: 400, height: 400 });
  const visiblePanelPoint = { x: 360, y: 1060 };
  assert.ok(visiblePanelPoint.y < crop.top);
  const service = new Service(() => assert.fail('Search-area selection must not call a device or model'));
  const search = await service.resolveLocateSearchArea({
    query: { prompt: 'the light-gray video demo panel on the left', deepLocate: false },
    queryPrompt: 'the light-gray video demo panel on the left',
    opt: { planLocatedElement }, context: { shotSize }, modelRuntime: { adapter: {} },
  });
  assert.deepEqual(search, { trace: {} });
  assert.equal(search.config, undefined, 'The SDK locator receives the full frame, not the blank search crop');
  assert.ok(visiblePanelPoint.x < shotSize.width && visiblePanelPoint.y < shotSize.height);
});
