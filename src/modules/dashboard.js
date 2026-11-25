import { Router } from "express"
import { prisma } from "../db.js"
import { authenticate, staffOnly } from "../middleware/auth.js"
import { lastMonthKeys, monthKey, startOfDay, startOfMonth } from "../utils/time.js"
import { daysLeftOf, visitsLeftOf } from "../utils/subscription.js"
import { MONTHS, capitalize, timeOf } from "../utils/uz.js"

const router = Router()
router.use(authenticate, staffOnly)

/* GET /dashboard/admin -> frontend admins/Dashboard `data` shakli: { stats, visits, expiring, cashflow }
   Kirim/chiqim va bugungi tushum faqat egaga qaytadi (staff uchun maydon umuman yo'q). */
router.get("/admin", async (req, res) => {
  const isOwner = req.user.role === "OWNER"
  const now = new Date()
  const today = startOfDay(now)

  const [visitsToday, recentVisits, candidates] = await Promise.all([
    prisma.visit.count({ where: { createdAt: { gte: today } } }),
    prisma.visit.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: { fullName: true, code: true } } } }),
    prisma.subscription.findMany({
      where: { status: "ACTIVE", endDate: { gte: now } },
      include: { user: { select: { id: true, fullName: true } }, plan: { select: { name: true } } },
    }),
  ])

  const active = candidates.filter((s) => s.visitUsed < s.visitTotal) // ustunlarni solishtirish Prisma where da yo'q
  const soon = active.filter((s) => daysLeftOf(s, now) <= 7).sort((a, b) => a.endDate - b.endDate)

  const stats = { visitsToday, activeMembers: new Set(active.map((s) => s.userId)).size, expiringSoon: soon.length }
  let cashflow = []

  if (isOwner) {
    const from = startOfMonth(now, 5)
    const [sales, expenses] = await Promise.all([
      prisma.subscription.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true, price: true } }),
      prisma.expense.findMany({ where: { date: { gte: from } }, select: { date: true, amount: true } }),
    ])
    stats.incomeToday = sales.filter((s) => s.createdAt >= today).reduce((sum, s) => sum + s.price, 0)

    const months = new Map(lastMonthKeys(6, now).map((key) => [key, { label: capitalize(MONTHS[Number(key.slice(5)) - 1]), income: 0, expense: 0 }]))
    sales.forEach((s) => { const m = months.get(monthKey(s.createdAt)); if (m) m.income += s.price })
    expenses.forEach((e) => { const m = months.get(monthKey(e.date)); if (m) m.expense += e.amount })
    cashflow = [...months.values()]
  }

  res.json({
    stats,
    visits: recentVisits.map((v) => ({ id: v.id, name: v.user.fullName, code: v.user.code ?? "", time: timeOf(v.createdAt) })),
    expiring: soon.slice(0, 5).map((s) => ({
      id: s.id,
      name: s.user.fullName,
      plan: s.plan.name,
      note: `${daysLeftOf(s, now)} kun, ${visitsLeftOf(s)} tashrif qoldi`,
    })),
    cashflow,
  })
})

export default router
