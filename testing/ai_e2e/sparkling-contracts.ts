import { findTaggedNode, readNativeText } from './native-dom.ts';
import { expectNativeValue } from './native-expectation.ts';
import type { createVisibleNativeSessions } from './native-visible-sessions.ts';
import type { createOwnedDeviceVisibilityReader } from './native-wda.ts';

type VisibleSessions = ReturnType<typeof createVisibleNativeSessions>;
type BoundView = Awaited<ReturnType<VisibleSessions['observe']>>;
type Reader = ReturnType<typeof createOwnedDeviceVisibilityReader>;
type Observe = (tag: string, expectedText?: string, timeoutMs?: number) => Promise<BoundView>;
export type SparklingContract = { contract: 'home' | 'parent' | 'role' | 'legacy' | 'sparkling' | 'mapped' }
  | { contract: 'runtime'; runtime: 'lynx' | 'sparkling' };

export const sparklingCapabilities = {
  'nav-container-type': 'sparkling', 'nav-sparkling-navigation': '1', 'nav-spk-pipe': 'available',
} as const;
export const nonemptyCapabilities = {
  'nav-container-id': ['absent'], 'nav-lynx-sdk-version': ['absent', 'unknown', 'unavailable'],
} as const;
export const sparklingRoutes = {
  rawParentUrl: 'file://lynx?local://automation/nav-basic/main.lynx.bundle?nav_role=parent',
  canonicalParentUrl: 'hybrid://lynxview_page?bundle=automation%2Fnav-basic%2Fmain.lynx.bundle&nav_role=parent',
  mappedLegacyUrl: 'file://lynx?local://automation/nav-basic/main.lynx.bundle?nav_role=parent&title=Mapped%20Title&hidden_nav=yes&fullscreen=no&back_button_style=dark&initial_page=details&custom_flag=preserved&theme=page-theme',
} as const;
export const mappedProperties = {
  'nav-title': 'Mapped Title', 'nav-hidden-nav': 'yes', 'nav-fullscreen': 'no',
  'nav-back-button-style': 'dark', 'nav-initial-page': 'details',
  'nav-custom-flag': 'preserved', 'nav-theme': 'page-theme',
} as const;
const legacyTags = ['nav-container-type', 'nav-container-id', 'nav-sparkling-navigation', 'nav-spk-pipe'];

// One instance per case attempt. All user actions remain standard aiAct nodes;
// this module preserves only the original routing/capability acceptance checks.
export function createSparklingContracts(observe: Observe, reader: Reader) {
  let home: BoundView | undefined, parent: BoundView | undefined;
  async function text(view: BoundView, tag: string) {
    return readNativeText(findTaggedNode(await view.readDocument(), tag));
  }
  async function exact(tag: string, expected: string) {
    const view = await observe(tag, expected, 15_000);
    const actual = await text(view, tag); // Original assert_tag_text rereads after binding.
    if (actual !== expected) throw new Error(`Sparkling ${tag} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
  async function nonempty(tag: string, forbidden: readonly string[]) {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const view = await observe(tag, undefined, Math.min(2000, deadline - Date.now()));
      const actual = await text(view, tag);
      if (Date.now() <= deadline && actual && !forbidden.includes(actual)) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`Sparkling ${tag} must be nonempty and not forbidden.`);
      await new Promise(resolve => setTimeout(resolve, Math.min(200, remaining)));
    }
  }
  return async (input: SparklingContract) => {
    if (!input || typeof input !== 'object') throw new Error('Invalid Sparkling contract.');
    switch (input.contract) {
      case 'home': home = await observe('bundle-url-input'); return;
      case 'parent': parent = await observe('nav-role', 'parent'); return;
      case 'role': await exact('nav-role', 'parent'); return;
      case 'runtime': {
        if (!home || !['lynx', 'sparkling'].includes(input.runtime)) throw new Error('Sparkling runtime check requires its original homepage binding.');
        await expectNativeValue(home.readDocument, { tag: 'bundle-runtime-label', text: input.runtime === 'lynx' ? 'Open with Lynx' : 'Open with Sparkling', timeoutMs: 10_000 });
        return;
      }
      case 'legacy': {
        if (!parent) throw new Error('Legacy capabilities require the original parent binding.');
        for (const tag of legacyTags) await expectNativeValue(parent.readDocument, { tag, text: 'absent', timeoutMs: 10_000 });
        return;
      }
      case 'sparkling': {
        await exact('nav-container-type', sparklingCapabilities['nav-container-type']);
        await nonempty('nav-container-id', nonemptyCapabilities['nav-container-id']);
        await nonempty('nav-lynx-sdk-version', nonemptyCapabilities['nav-lynx-sdk-version']);
        await exact('nav-sparkling-navigation', sparklingCapabilities['nav-sparkling-navigation']);
        await exact('nav-spk-pipe', sparklingCapabilities['nav-spk-pipe']);
        await observe('nav-xelement-input', undefined, 15_000);
        const deadline = Date.now() + 15_000;
        for (;;) {
          const types = await reader.displayedTypes('nav-xelement-input', deadline - Date.now());
          if (Date.now() <= deadline && types.length === 1 && types[0] === 'XCUIElementTypeTextField') return;
          const remaining = deadline - Date.now();
          if (remaining <= 0) throw new Error('Sparkling requires exactly one displayed native XElement text field.');
          await new Promise(resolve => setTimeout(resolve, Math.min(200, remaining)));
        }
      }
      case 'mapped':
        for (const [tag, expected] of Object.entries(mappedProperties)) await exact(tag, expected);
        await nonempty('nav-is-notch-screen', ['absent']);
        return;
      default: throw new Error('Invalid Sparkling contract.');
    }
  };
}
