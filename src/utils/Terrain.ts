export interface HillSpec {
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

export const WORLD_HILLS: HillSpec[] = [
  { x: -18, z: -14, sx: 3.6, sy: 1.4, sz: 3.1 },
  { x: -21, z: -3, sx: 2.9, sy: 1.2, sz: 2.7 },
  { x: -17, z: 7, sx: 3.2, sy: 1.0, sz: 2.9 },
  { x: -11, z: 15, sx: 2.6, sy: 0.9, sz: 2.3 },
  { x: 19, z: -16, sx: 3.9, sy: 1.4, sz: 3.4 },
  { x: 22, z: -5, sx: 3.1, sy: 1.1, sz: 2.8 },
  { x: 17, z: 6, sx: 2.8, sy: 1.0, sz: 2.5 },
  { x: 10, z: 15, sx: 2.5, sy: 0.9, sz: 2.2 },
  { x: 0, z: -28, sx: 4.2, sy: 1.5, sz: 3.8 },
  { x: -7, z: 20, sx: 2.3, sy: 0.8, sz: 2.0 },
  { x: 7, z: 21, sx: 2.3, sy: 0.8, sz: 2.0 }
];

export function getBaseTerrainHeight(x: number, z: number): number {
  const centerFalloff = 1 - Math.exp(-(x * x) / 120);
  const waveA = Math.sin(x * 0.18) * Math.cos(z * 0.16) * 0.58;
  const waveB = Math.sin((x + z) * 0.11) * 0.34;
  const waveC = Math.cos((x - z) * 0.07) * 0.22;
  return (waveA + waveB + waveC) * centerFalloff;
}

export function getHillVisualBaseY(scaleY: number): number {
  return Math.max(0.45, scaleY * 0.42);
}

export function sampleWorldTerrainHeight(x: number, z: number): number {
  const base = getBaseTerrainHeight(x, z);
  let top = base;

  for (const hill of WORLD_HILLS) {
    const dx = (x - hill.x) / (hill.sx * 0.64);
    const dz = (z - hill.z) / (hill.sz * 0.64);
    const distSq = dx * dx + dz * dz;
    if (distSq >= 1) {
      continue;
    }

    const shape = 1 - distSq;
    const candidate = base + hill.sy * 1.25 * shape * shape;
    if (candidate > top) {
      top = candidate;
    }
  }

  return top;
}
