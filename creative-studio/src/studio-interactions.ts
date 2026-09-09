export function playStudioSound(source: string, volume: number) {
  if (typeof window === "undefined") return;

  const sound = new Audio(source);
  sound.volume = volume;
  void sound.play().catch(() => undefined);
}
