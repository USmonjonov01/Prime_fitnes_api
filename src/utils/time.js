// Zal Toshkentda (UTC+5, yozgi vaqt yo'q). "Bugun", "shu oy" kabi chegaralar shu vaqt bo'yicha hisoblanadi.
const OFFSET = 5 * 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000

export const dayKey = (d = new Date()) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10) // "2026-11-25"
export const startOfDay = (d = new Date()) => new Date(Date.parse(`${dayKey(d)}T00:00:00.000Z`) - OFFSET)
export const endOfDay = (d = new Date()) => new Date(startOfDay(d).getTime() + DAY_MS - 1)
export const monthKey = (d) => dayKey(d).slice(0, 7) // "2026-11"

// `back` oy oldingi oyning 1-kuni (Toshkent vaqti bilan)
export const startOfMonth = (d = new Date(), back = 0) => {
  const [y, m] = dayKey(d).split("-").map(Number)
  return new Date(Date.UTC(y, m - 1 - back, 1) - OFFSET)
}

export const lastMonthKeys = (span, now = new Date()) =>
  Array.from({ length: span }, (_, i) => monthKey(startOfMonth(now, span - 1 - i)))
