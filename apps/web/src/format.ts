/** Hours -> a compact Japanese duration ("45分", "3.2時間", "2.5日"). */
export function fmtHours(h: number | null | undefined): string {
  if (h == null) return '–';
  if (h < 1) return `${Math.round(h * 60)}分`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)}時間`;
  return `${(h / 24).toFixed(1)}日`;
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null) return '–';
  return n.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtPct(n: number | null | undefined): string {
  return n == null ? '–' : `${(n * 100).toFixed(0)}%`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}
