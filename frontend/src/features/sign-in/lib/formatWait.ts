/** The text of a lock's remaining wait: `59 s`, or `4 min 52 s` from a minute on. No padding, no hours. */
export function formatWait(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} s`
  return `${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} s`
}
