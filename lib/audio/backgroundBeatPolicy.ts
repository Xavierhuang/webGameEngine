export type GameOutcomeState = 'playing' | 'won' | 'lost';

export function shouldRunBackgroundBeat({
  hasAutoplayBeat,
  showStartSplash,
  outcomeState,
}: {
  hasAutoplayBeat: boolean;
  showStartSplash: boolean;
  outcomeState: GameOutcomeState;
}): boolean {
  return hasAutoplayBeat && !showStartSplash && outcomeState === 'playing';
}
