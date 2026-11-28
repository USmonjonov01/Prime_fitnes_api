import { Router } from "express"
import { prisma } from "../db.js"
import { activityOut } from "../utils/activity.js"
import { authenticate, customerOnly } from "../middleware/auth.js"
import { daysLeftOf, stateOf } from "../utils/subscription.js"
import { QR_TTL_SEC, createCheckinToken } from "../utils/checkinToken.js"
import { dateOf, timeOf } from "../utils/uz.js"

const router = Router()
router.use(authenticate, customerOnly)

/* GET /me/dashboard -> frontend clients/Dashboard `data` shakli: { abonement, history }
   Mijoz faqat o'zini ko'radi: id tokendan olinadi, URL dan emas, shuning uchun boshqa mijozning ma'lumotini so'rab bo'lmaydi. */
router.get("/dashboard", async (req, res) => {
  const now = new Date()
  const [subs, visits] = await Promise.all([
    prisma.subscription.findMany({ where: { userId: req.user.id }, include: { plan: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.visit.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ])

  const current =
    subs.filter((s) => stateOf(s, now) === "active").sort((a, b) => a.endDate - b.endDate)[0] ?? subs[0] ?? null

  res.json({
    abonement: current
      ? {
          name: current.plan.name,
          visitTotal: current.visitTotal,
          visitUsed: current.visitUsed,
          daysLeft: daysLeftOf(current, now),
          endDate: current.endDate,
          state: stateOf(current, now),
        }
      : null,
    history: visits.map((v) => ({ id: v.id, date: dateOf(v.createdAt), time: timeOf(v.createdAt) })),
  })
})

/* GET /me/qr: kirish uchun QR kod matni. Qisqa muddatli (45 soniya), telefon uni har ~30 soniyada yangilab turadi.
   Faqat shu mijozning o'z sessiyasi oladi (id tokendan), shuning uchun boshqa birov bu kodni ola olmaydi. */
router.get("/qr", (req, res) => {
  const { token, exp } = createCheckinToken(req.user.id)
  res.set("Cache-Control", "no-store")
  res.json({ token, expires_in: QR_TTL_SEC, expires_at: new Date(exp * 1000).toISOString() })
})

/* GET /me/activity: mijozning o'ziga tegishli voqealar (kirish, abonement, holat). Xodim ismi yashiriladi. */
router.get("/activity", async (req, res) => {
  const items = await prisma.activity.findMany({
    where: { customerId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { customer: { select: { id: true, fullName: true, code: true } } },
  })
  res.json(items.map((a) => activityOut(a, { showPrice: true, showActor: false })))
})

export default router