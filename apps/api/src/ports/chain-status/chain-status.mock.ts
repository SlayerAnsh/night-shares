export function createMockChainStatus(initial = false) {
  let paused = initial;
  return {
    isPaused: (_nightKey?: string) => paused,
    setPaused(value: boolean) {
      paused = value;
    },
  };
}
