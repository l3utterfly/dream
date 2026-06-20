
export function humaniseDuration(seconds: number): string {
  try {
    if (seconds < 60) {
      return `${seconds.toFixed(0)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes.toFixed(0)} minutes`;
    } else if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `${hours.toFixed(0)} hours`;
    } else {
      const days = Math.floor(seconds / 86400);
      return `${days.toFixed(0)} days`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to humanise duration";
    console.warn(message + " - " + seconds.toString());
    return seconds.toString();
  }
}