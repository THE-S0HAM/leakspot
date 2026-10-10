// Seeded RNG for the simulator (domain-engine.md §2). mulberry32 for uniforms, a small string hash to
// derive a per-(seed, day, slot, meter, stream) seed, and Box–Muller for normals. Pure and
// deterministic: the same inputs always produce the same sequence, so runs replay identically.

/** mulberry32: a fast 32-bit PRNG. Returns a function yielding uniforms in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 32-bit hash of a string (FNV-1a style), used to seed mulberry32. */
export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Compose a seed from the run seed and context so each stream is independent but reproducible. */
export function streamSeed(
  seed: number,
  day: number,
  slotIndex: number,
  meterId: string,
  stream: string,
): number {
  return hashString(`${seed}|${day}|${slotIndex}|${meterId}|${stream}`);
}

/** A reproducible generator bundling a uniform source and a standard-normal source. */
export type Rng = { uniform: () => number; normal: () => number };

/** Build an Rng seeded by the given integer. normal() uses Box–Muller (one value per call). */
export function makeRng(seed: number): Rng {
  const uniform = mulberry32(seed);
  return {
    uniform,
    normal(): number {
      // Box–Muller; guard u1 away from 0 so log is finite.
      const u1 = Math.max(uniform(), Number.EPSILON);
      const u2 = uniform();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
  };
}

/** A normal(mean, sd) draw clipped to [lo, hi]. */
export function clippedNormal(rng: Rng, mean: number, sd: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, mean + sd * rng.normal()));
}
