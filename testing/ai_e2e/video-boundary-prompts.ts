// The approved fixture layout exposes each original seek label in full.
// Use public visual actions without platform-specific clipped-text guesses.
export function videoBoundarySeekPrompts(): Record<string, string> {
  return { videoBoundarySeekEmpty:
    'Click the single button labeled exactly "Seek Empty" once. It is the RIGHTMOST button in the blue source-controls row, immediately to the RIGHT of "Play Pause Empty". '
    + 'The label may wrap onto two lines: Seek above Empty. Do not click "Src Empty" near the middle of that row, "Play Empty", or "Play Pause Empty". '
    + 'Keep the complete label and its rightmost position in the locating instruction. If fully visible, do not scroll; otherwise scroll inside the video demo panel. '
    + 'Tap the center of the "Seek Empty" label once, then stop. A change to src=empty alone does not prove that the correct button was tapped.',
    ...Object.fromEntries(['Seek Bad', 'Seek Missing', 'Seek Null', 'Seek Text', 'Seek NaN', 'Seek Inf', 'Seek Huge'].map(label => [
    'videoBoundary' + label.replaceAll(' ', ''),
    'Click the single button labeled exactly ' + JSON.stringify(label) + ' once in the video demo\'s blue seek controls. '
      + 'Match the complete label, including its suffix. If the button is already fully on screen, do not scroll. '
      + 'Otherwise scroll inside the light-gray video demo panel until the button is fully visible. '
      + 'Click inside that button, not another seek control or status text. Stop after the single tap.',
  ])) };
}
