const fixtures = {
  image: { path: 'showcase/image/main', tags: [], texts: ['Image Examples', 'Image AutoSize Examples',
    'Image Basic Examples', 'Image Styled Examples', 'Image Filter Examples', 'Image Event Examples'] },
  layoutLinear: { path: 'showcase/layout/linear', tags: [], texts: ['column item 1', 'column item 2',
    'column item 3', 'row item 1', 'row item 2', 'row item 3'] },
  textEvent: { path: 'showcase/text/text_event', tags: ['container', 'inline-view-text-count',
    'inline-image-count', 'flatten-text', 'non-flatten-text'] },
  event: { path: 'automation/event/main', tags: ['count', 'button0', 'button-text1', 'button2'] },
  domFocus: { path: 'automation/dom-focus/main', tags: ['focus-state', 'blur-state', 'focus-input-a', 'focus-input-b'] },
  insertText: { path: 'automation/input_insert_text/main', tags: [
    'insert-text-input-a', 'insert-text-input-b', 'insert-text-input-c',
    'insert-text-value-a', 'insert-text-value-b', 'insert-text-value-c',
    'insert-text-input-count', 'insert-text-last-input',
  ] },
} as const;

export type NativeFixtureName = keyof typeof fixtures;
export function nativeFixture(name: NativeFixtureName) {
  if (!Object.hasOwn(fixtures, name)) throw new Error('Unknown native fixture.');
  return fixtures[name];
}

// Retain CaseSet(enable_scale=True)'s platform-specific URL parameters. The
// registered wrapper is delivered through Midscene's standard launch node.
export function fixtureUri(platform: 'android' | 'ios', name: NativeFixtureName): string {
  if (platform !== 'android' && platform !== 'ios') throw new Error('Unknown native fixture platform.');
  const scale = platform === 'android'
    ? 'width=1080&height=1664&density=320'
    : 'width=720&height=1200&scale=2';
  return 'lynx://open?url=' + encodeURIComponent(
    `file://lynx?local://${nativeFixture(name).path}.lynx.bundle?${scale}`,
  );
}
