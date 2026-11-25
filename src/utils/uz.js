import { dayKey } from "./time.js"

export const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"]
export const SHORT_MONTHS = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"]
export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const TZ = 5 * 60 * 60 * 1000
const pad = (n) => String(n).padStart(2, "0")

// Toshkent vaqti bilan "14:30" va "25-noyabr"
export const timeOf = (d) => { const t = new Date(d.getTime() + TZ); return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}` }
export const dateOf = (d) => { const [, m, day] = dayKey(d).split("-").map(Number); return `${day}-${MONTHS[m - 1]}` }
