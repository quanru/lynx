import assert from 'node:assert/strict';
import test from 'node:test';

// Test the pinned SDK, not a reimplementation of its crop behavior. These are
// model-free search-area checks; they do not claim correct model/device taps.
const { default: Service } = await import('../node_modules/@midscene/core/dist/es/service/index.mjs');
const { expandSearchArea, mergeSearchAreaResults } = await import('../node_modules/@midscene/core/dist/es/ai-model/workflows/grounding/search-area.mjs');

test('run 39897067173 Boundary planner crops exclude the actual Stop and Seek Missing buttons', () => {
  // Attempt 2 agent traces and original 1206x2622 screenshots. Coordinates are
  // diagnostic evidence only; production actions never use these constants.
  for (const sample of [
    { point: [905, 1290], crop: { left: 706, top: 1091, width: 400, height: 400 }, target: [1056, 1625] },
    { point: [920, 1363], crop: { left: 721, top: 1164, width: 400, height: 400 }, target: [1056, 1750] },
  ]) {
    const crop = expandSearchArea(mergeSearchAreaResults({ center: sample.point }), { width: 1206, height: 2622 });
    assert.deepEqual(crop, sample.crop);
    assert.ok(sample.target[1] > crop.top + crop.height,
      'Refinement cannot recover a target that is absent from its input image');
  }
});

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

test('current iOS video bounds put the evidenced Play and Mute controls inside SDK refinement crops', () => {
  // Run 38137942374: both full-frame model points fell below the blue button.
  // These are diagnostic test coordinates, never production action targets.
  for (const { point, button } of [
    { point: [374, 1678], button: { top: 1586, bottom: 1663, center: [374, 1625] } },
    { point: [719, 2105], button: { top: 2024, bottom: 2101, center: [719, 2062] } },
  ]) {
    assert.ok(point[1] > button.bottom, 'The original full-frame point missed the button.');
    const crop = expandSearchArea(mergeSearchAreaResults({ center: point }), { width: 1206, height: 2622 });
    assert.ok(button.center[0] >= crop.left && button.center[0] < crop.left + crop.width);
    assert.ok(button.top >= crop.top && button.bottom < crop.top + crop.height);
  }
});
