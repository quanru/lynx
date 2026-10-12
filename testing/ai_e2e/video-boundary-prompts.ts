// Public aiAct descriptions for the unchanged fixture's crowded seek row.
// iOS clips several suffixes to identical text; use visible local neighbors.
// No saved image coordinates or native/DOM selectors are used.
const seekRow = ['Seek 0s', 'Seek 2s', 'Near End', 'Seek Bad', 'Seek Missing', 'Seek Null', 'Seek Text', 'Seek NaN', 'Seek Inf', 'Seek Huge'];
const seekOrdinals = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH', 'NINTH', 'TENTH'];
const iosVisibleAnchors: Record<string, string> = {
  'Seek Bad': 'Tap once on the white "Seek" text immediately to the RIGHT of "Near" and immediately to the '
    + 'LEFT of the two-line "See / Mis" text. This is the Seek Bad control; the rest of its label is '
    + 'intrinsically clipped. These controls are in the blue seek row directly below Clear / Play / '
    + 'Play Null / Pause / Stop and above Src A / Src B. Click within the white text itself, not in a '
    + 'neighboring control. If this row is visible, do not scroll; scrolling cannot unclip these '
    + 'labels. Stop after that single tap.',
  'Seek Null': 'Tap once on the FIRST white "Seek" text immediately to the RIGHT of the two-line "See / Mis" '
    + 'text. This is the Seek Null control; its distinguishing suffix is intrinsically clipped. Do '
    + 'not skip to the second or third "Seek" on that side. These controls are in the blue seek row '
    + 'directly below Clear / Play / Play Null / Pause / Stop and above Src A / Src B. Click within '
    + 'the white text itself, not in a neighboring control. If this row is visible, do not scroll; '
    + 'scrolling cannot unclip these labels. Stop after that single tap.',
  'Seek Text': 'Tap once on the white "Seek" text TWO controls to the LEFT of the narrow label that looks like '
    + '"Seel". The "Seel" label is immediately to the left of the rightmost two-line "Seek Huge" '
    + 'control. There is exactly one other "Seek" control between your target and "Seel". Your target '
    + 'is Seek Text, whose suffix is intrinsically clipped. These controls are in the blue seek row '
    + 'directly below Clear / Play / Play Null / Pause / Stop and above Src A / Src B. Click within '
    + 'the white text itself, not in a neighboring control. If this row is visible, do not scroll; '
    + 'scrolling cannot unclip these labels. Stop after that single tap.',
  'Seek NaN': 'Tap once on the white "Seek" text immediately to the LEFT of the narrow label that looks like '
    + '"Seel". The "Seel" label is immediately to the left of the rightmost two-line "Seek Huge" '
    + 'control. Your target is Seek NaN, whose suffix is intrinsically clipped. These controls are in '
    + 'the blue seek row directly below Clear / Play / Play Null / Pause / Stop and above Src A / Src '
    + 'B. Click within the white text itself, not in a neighboring control. If this row is visible, '
    + 'do not scroll; scrolling cannot unclip these labels. Stop after that single tap.',
};

export function videoBoundarySeekPrompts(platform: 'android' | 'ios'): Record<string, string> {
  return Object.fromEntries(seekRow.slice(3).map((label, index) => {
    const seekIndex = index + 3;
    const neighbors = seekIndex === seekRow.length - 1
      ? 'It is the rightmost control, immediately after Seek Inf.'
      : 'It is between ' + seekRow[seekIndex - 1] + ' and ' + seekRow[seekIndex + 1] + '.';
    const rowPrompt = 'Click the single ' + JSON.stringify(label) + ' button once: it is the '
      + seekOrdinals[seekIndex] + ' control from the LEFT in the blue seek row directly below Clear / Play / Play Null / Pause / Stop and above the Src A / Src B row. That row contains ten controls, ordered '
      + seekRow.join(', ') + '. ' + neighbors
      + " Labels overlap or are clipped; use this row and its order. Click inside that control's blue body. If the row is already on screen, do not scroll; scrolling cannot unclip text. Do not click any other control. Stop after the single click.";
    return ['videoBoundary' + label.replaceAll(' ', ''),
      platform === 'ios' ? iosVisibleAnchors[label] ?? rowPrompt : rowPrompt];
  }));
}
