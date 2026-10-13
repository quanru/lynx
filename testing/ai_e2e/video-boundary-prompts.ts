// The approved fixture layout exposes each original seek label in full.
// Use public visual actions without platform-specific clipped-text guesses.
export function videoBoundarySeekPrompts(): Record<string, string> {
  return Object.fromEntries(['Seek Bad', 'Seek Missing', 'Seek Null', 'Seek Text', 'Seek NaN', 'Seek Inf', 'Seek Huge'].map(label => [
    'videoBoundary' + label.replaceAll(' ', ''),
    'Click the single button labeled exactly ' + JSON.stringify(label) + ' once in the video demo\'s blue seek controls. '
      + 'Match the complete label, including its suffix. If the button is already fully on screen, do not scroll. '
      + 'Otherwise scroll inside the light-gray video demo panel until the button is fully visible. '
      + 'Click inside that button, not another seek control or status text. Stop after the single tap.',
  ]));
}
