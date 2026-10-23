// The approved fixture layout exposes each original seek label in full.
// Use public visual actions without platform-specific clipped-text guesses.
export function videoBoundaryActionPrompts(): Record<string, string> {
  return { videoBoundaryPlayPauseEmpty:
    'Click the single button labeled exactly "Play Pause Empty" once. It is in the blue source-controls row, between "Play Empty" on its LEFT and "Seek Empty" on its RIGHT. '
    + 'The complete label may wrap across lines: Play, Pause, Empty. Keep the complete label and both neighbors in the locating instruction. '
    + 'If fully visible, do not scroll; otherwise scroll inside the video demo panel. '
    + 'This is a non-idempotent action: one tap clears the video source, and a second tap clears and replaces the callback evidence. '
    + 'After the first executed tap, finish immediately based on the action history. Do not tap again to verify success, even if the button stays visible or the screen looks unchanged. '
    + 'Do not restore the source, clear the log, or perform any other action. The following test steps validate the callbacks.',
    videoBoundarySeekEmpty:
    'Click the single button labeled exactly "Seek Empty" once. It is the RIGHTMOST button in the blue source-controls row, immediately to the RIGHT of "Play Pause Empty". '
    + 'The label may wrap onto two lines: Seek above Empty. Do not click "Src Empty" near the middle of that row, "Play Empty", or "Play Pause Empty". '
    + 'Keep the complete label and its rightmost position in the locating instruction. If fully visible, do not scroll; otherwise scroll inside the video demo panel. '
    + 'Tap the center of the "Seek Empty" label once, then stop. A change to src=empty alone does not prove that the correct button was tapped.',
    ...Object.fromEntries(['Seek Bad', 'Seek Missing', 'Seek Null', 'Seek Text', 'Seek NaN', 'Seek Inf', 'Seek Huge'].map(label => [
    'videoBoundary' + label.replaceAll(' ', ''),
    'Click the single button labeled exactly ' + JSON.stringify(label) + ' once in the video demo\'s blue seek controls. '
      + (label === 'Seek Null'
        ? 'It is the LEFTMOST button in the LOWER seek-controls row, immediately LEFT of "Seek Text" and BELOW the row containing "Seek 0s", "Seek 2s", "Near End", "Seek Bad", and "Seek Missing". '
          + 'The source-controls row starting with "Src A" is immediately BELOW it. Do not click "Clear" in the playback row above both seek rows. '
          + 'Keep this row and neighbor context in the locating instruction; a first-column button alone is not a match. '
        : '')
      + 'Match the complete label, including its suffix. If the button is already fully on screen, do not scroll. '
      + 'Otherwise scroll inside the light-gray video demo panel until the button is fully visible. '
      + 'Click inside that button, not another seek control or status text. Stop after the single tap.',
  ])) };
}
