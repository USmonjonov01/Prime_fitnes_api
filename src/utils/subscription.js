import { DAY_MS } from "./time.js"

// Abonement holati bazada saqlanmaydi, har safar hisoblanadi (frontend stateOf bilan bir xil qoida)
export const stateOf = (s, now = new Date()) => {
  if (s.status === "CANCELLED") return "cancelled"
  if (s.visitUsed >= s.visitTotal) return "finished"
  if (now > s.endDate) return "expired"
  return "active"
}
export const daysLeftOf = (s, now = new Date()) => Math.max(0, Math.ceil((s.endDate - now) / DAY_MS))
export const visitsLeftOf = (s) => Math.max(0, s.visitTotal - s.visitUsed)
