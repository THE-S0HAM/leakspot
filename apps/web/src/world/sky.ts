// Sim-time → lighting and sky. The run clock is an "HH:MM" label (05:45 pre-dawn … 19:45 night).
// We map the minutes-of-day to a phase and return the sun colour/angle/intensity, hemisphere tints and
// a CSS sky gradient. Pure; used by City3D (lighting) and the sky layer behind the transparent canvas.

export type SkyState = {
  /** CSS linear-gradient for the sky layer behind the canvas. */
  gradient: string;
  /** directional "sun" */
  sun: { color: string; intensity: number; position: [number, number, number] };
  /** hemisphere fill */
  hemi: { sky: string; ground: string; intensity: number };
  /** show drei <Stars> */
  night: boolean;
};

/** Minutes since midnight from an "HH:MM" label; defaults to mid-morning if unparseable. */
export function minutesOfDay(label: string | undefined): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(label ?? "");
  if (!m) return 7 * 60;
  return Number(m[1]) * 60 + Number(m[2]);
}

type Stop = {
  min: number;
  gradient: [string, string, string];
  sun: { color: string; intensity: number; elevation: number };
  hemi: { sky: string; ground: string; intensity: number };
  night: boolean;
};

// Keyframes across the simulated day; values are interpolated between the nearest two.
const STOPS: Stop[] = [
  {
    min: 5 * 60 + 45, // pre-dawn: dim and blue, but the city must still read (not near-black)
    gradient: ["#0b1526", "#13213a", "#1b2d4a"],
    sun: { color: "#8fa6d8", intensity: 1.5, elevation: 8 },
    hemi: { sky: "#3a4a72", ground: "#1a2236", intensity: 1.4 },
    night: true,
  },
  {
    min: 6 * 60 + 30, // sunrise, warm low light
    gradient: ["#243a63", "#c9743f", "#f0a861"],
    sun: { color: "#ffb066", intensity: 2.4, elevation: 12 },
    hemi: { sky: "#5a6a8a", ground: "#3a2e22", intensity: 1.2 },
    night: false,
  },
  {
    min: 12 * 60, // midday, white high sun
    gradient: ["#2d5a9e", "#5a8fd6", "#a9cdf0"],
    sun: { color: "#fff6e8", intensity: 2.8, elevation: 60 },
    hemi: { sky: "#bcd6f2", ground: "#55503f", intensity: 1.3 },
    night: false,
  },
  {
    min: 18 * 60 + 45, // dusk violet/orange
    gradient: ["#2a2347", "#7a4a6a", "#e08a4a"],
    sun: { color: "#ff8a4a", intensity: 2.0, elevation: 10 },
    hemi: { sky: "#4a3f66", ground: "#2e2436", intensity: 1.1 },
    night: false,
  },
  {
    min: 20 * 60, // night: blue moonlight, still legible
    gradient: ["#0a1120", "#0e1828", "#13223a"],
    sun: { color: "#7f93c8", intensity: 1.3, elevation: 45 },
    hemi: { sky: "#2e3c60", ground: "#141c2e", intensity: 1.3 },
    night: true,
  },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHex(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((na >> 16) & 255, (nb >> 16) & 255, t));
  const g = Math.round(lerp((na >> 8) & 255, (nb >> 8) & 255, t));
  const bl = Math.round(lerp(na & 255, nb & 255, t));
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/** Sky + lighting for a given clock label (or minutes directly for the spectator day loop). */
export function skyFor(label: string | undefined, minutesOverride?: number): SkyState {
  const min = minutesOverride ?? minutesOfDay(label);
  let lo = STOPS[0] as Stop;
  let hi = STOPS[STOPS.length - 1] as Stop;
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    const a = STOPS[i] as Stop;
    const b = STOPS[i + 1] as Stop;
    if (min >= a.min && min <= b.min) {
      lo = a;
      hi = b;
      break;
    }
  }
  const span = hi.min - lo.min || 1;
  const t = Math.max(0, Math.min(1, (min - lo.min) / span));

  const elevation = lerp(lo.sun.elevation, hi.sun.elevation, t);
  const rad = (elevation * Math.PI) / 180;
  const dist = 140;
  const sunPos: [number, number, number] = [
    Math.cos(rad) * dist * 0.6,
    Math.max(6, Math.sin(rad) * dist),
    Math.cos(rad) * dist * 0.4 + 40,
  ];

  return {
    gradient: `linear-gradient(180deg, ${lerpHex(lo.gradient[0], hi.gradient[0], t)} 0%, ${lerpHex(
      lo.gradient[1],
      hi.gradient[1],
      t,
    )} 55%, ${lerpHex(lo.gradient[2], hi.gradient[2], t)} 100%)`,
    sun: {
      color: lerpHex(lo.sun.color, hi.sun.color, t),
      intensity: lerp(lo.sun.intensity, hi.sun.intensity, t),
      position: sunPos,
    },
    hemi: {
      sky: lerpHex(lo.hemi.sky, hi.hemi.sky, t),
      ground: lerpHex(lo.hemi.ground, hi.hemi.ground, t),
      intensity: lerp(lo.hemi.intensity, hi.hemi.intensity, t),
    },
    night: t < 0.5 ? lo.night : hi.night,
  };
}

/** Whether warm window glow should show (dawn/dusk/night, not bright midday). */
export function windowsGlow(label: string | undefined): boolean {
  const min = minutesOfDay(label);
  return min <= 7 * 60 || min >= 18 * 60;
}
