// Number formatting: Indian grouping for litres (1,80,000) and a lakh short form, plus tanker-loads.
const inGroup = new Intl.NumberFormat("en-IN");

export function litres(n: number): string {
  return `${inGroup.format(Math.round(n))} L`;
}

export function lakh(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(1).replace(/\.0$/, "")} lakh L`;
  return litres(n);
}

export function tankers(n: number): string {
  const loads = n / 10000;
  return `${loads.toFixed(1)} tanker-loads`;
}
