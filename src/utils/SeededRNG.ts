export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deriveSeed(baseSeed: number, salt: number | string): number {
  let saltNum: number;
  if (typeof salt === 'string') {
    saltNum = 0;
    for (let i = 0; i < salt.length; i++) {
      saltNum = ((saltNum << 5) - saltNum + salt.charCodeAt(i)) | 0;
    }
  } else {
    saltNum = salt | 0;
  }
  return ((baseSeed * 2654435761) ^ (saltNum * 2246822519)) >>> 0;
}

export function createRNGStreams(
  levelSeed: number,
  names: string[] = ['spawn', 'level', 'entity'],
): Record<string, () => number> {
  return Object.fromEntries(
    names.map((name) => [name, mulberry32(deriveSeed(levelSeed, name))]),
  );
}
