import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db.js"
import { authenticate, ownerOnly } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"
import { lastMonthKeys, monthKey, startOfMonth } from "../utils/time.js"
import { MONTHS, SHORT_MONTHS, capitalize } from "../utils/uz.js"

const router = Router()
router.use(authenticate, ownerOnly)

/* GET /reports?months=6 -> frontend admins/Reports buildReport natijasi shaklida: { rows, ranking, best, totals, customerCount, hasExpenses }
   Hisob-kitob serverda: brauzerga hamma mijoz va abonementlarni yuklab olish kerak emas. */
router.get("/", validate({ query: z.object({ months: z.coerce.number().int().min(1).max(24).default(6) }) }), async (req, res) => {
  const span = req.valid.query.months
  const now = new Date()
  const from = startOfMonth(now, span - 1)

  const [plans, sales, expenses, visits, customerCount, expenseCount] = await Promise.all([
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.subscription.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true, price: true, planId: true } }),
    prisma.expense.findMany({ where: { date: { gte: from } }, select: { date: true, amount: true } }),
    prisma.visit.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.expense.count(),
  ])

  const months = new Map(lastMonthKeys(span, now).map((key) => {
    const [y, m] = key.split("-").map(Number)
    return [key, { key, label: SHORT_MONTHS[m - 1], full: `${capitalize(MONTHS[m - 1])} ${y}`, income: 0, expense: 0, visits: 0 }]
  }))
  const ranking = new Map(plans.map((p) => [p.id, { id: p.id, name: p.name, count: 0, revenue: 0 }]))

  sales.forEach((s) => {
    const m = months.get(monthKey(s.createdAt))
    if (!m) return
    m.income += s.price
    const r = ranking.get(s.planId)
    if (r) { r.count += 1; r.revenue += s.price }
  })
  expenses.forEach((e) => { const m = months.get(monthKey(e.date)); if (m) m.expense += e.amount })
  visits.forEach((v) => { const m = months.get(monthKey(v.createdAt)); if (m) m.visits += 1 })

  const rows = [...months.values()].map((m) => ({
    ...m,
    profit: m.income - m.expense,
    incomePerVisit: m.visits ? Math.round(m.income / m.visits) : null,
    expensePerVisit: m.visits ? Math.round(m.expense / m.visits) : null,
  }))

  const income = rows.reduce((s, m) => s + m.income, 0)
  const expense = rows.reduce((s, m) => s + m.expense, 0)
  const visitCount = rows.reduce((s, m) => s + m.visits, 0)
  const sorted = [...ranking.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue)

  res.json({
    rows,
    ranking: sorted,
    best: sorted[0]?.count ? sorted[0] : null,
    totals: {
      income,
      expense,
      profit: income - expense,
      margin: income ? Math.round(((income - expense) / income) * 100) : null,
      visits: visitCount,
      incomePerVisit: visitCount ? Math.round(income / visitCount) : null,
      expensePerVisit: visitCount ? Math.round(expense / visitCount) : null,
    },
    customerCount,
    hasExpenses: expenseCount > 0,
  })
})

export default router
