import { Router } from "express"
import crypto from "node:crypto"
import { z } from "zod"
import { prisma } from "../db.js"
import { authenticate, staffOnly } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"
import { conflict, notFound } from "../utils/errors.js"
import { normalizePhone } from "../utils/phone.js"
import { customerOut, subscriptionOut } from "../utils/serialize.js"
import { hashPassword } from "./auth.js"

const router = Router()
router.use(authenticate, staffOnly)

export const tempPassword = () => String(crypto.randomInt(100000, 1000000)) // 6 raqam, bir marta ko'rsatiladi

export const phoneField = z.string().trim().transform((v, ctx) => {
  const p = normalizePhone(v)
  if (!p) ctx.addIssue({ code: "custom", message: "Telefon raqami noto'g'ri (masalan +998 90 123 45 67)" })
  return p
})

const idParams = z.object({ id: z.string().min(1) })
const STATUSES = { active: "ACTIVE", inactive: "INACTIVE", frozen: "FROZEN", blocked: "BLOCKED" }

// Bitta mijoz qatori: frontend Customers sahifasi kutgan ma'lumot (abonementlar + tashrif xulosasi)
const row = (u, counts, showPrice) => ({
  customer: customerOut(u),
  abonements: u.subscriptions.map((s) => subscriptionOut(s, { showPrice })),
  visits_total: counts.get(u.id)?.count ?? 0,
  last_visit_at: u.visits[0]?.createdAt ?? null,
  recent_visits: u.visits.map((v) => ({ id: v.id, created_at: v.createdAt })),
})

const include = {
  subscriptions: { orderBy: { createdAt: "desc" } },
  visits: { orderBy: { createdAt: "desc" }, take: 8 },
}

async function visitCounts(userIds) {
  const groups = await prisma.visit.groupBy({ by: ["userId"], where: userIds ? { userId: { in: userIds } } : undefined, _count: { _all: true } })
  return new Map(groups.map((g) => [g.userId, { count: g._count._all }]))
}

/* GET /customers: hamma mijozlar (N+1 yo'q: 3 ta so'rov). Mijozlar yuzlab bo'lsa keyin sahifalash qo'shiladi. */
router.get("/", async (req, res) => {
  const [users, counts] = await Promise.all([
    prisma.user.findMany({ where: { role: "CUSTOMER" }, include, orderBy: { createdAt: "desc" } }),
    visitCounts(),
  ])
  res.json(users.map((u) => row(u, counts, req.user.role === "OWNER")))
})

router.get("/:id", validate({ params: idParams }), async (req, res) => {
  const u = await prisma.user.findFirst({ where: { id: req.valid.params.id, role: "CUSTOMER" }, include })
  if (!u) throw notFound("Mijoz topilmadi")
  res.json(row(u, await visitCounts([u.id]), req.user.role === "OWNER"))
})

/* POST /customers: yangi mijoz. Kod avtomatik (001, 002...), vaqtinchalik parol javobda BIR MARTA qaytadi. */
router.post(
  "/",
  validate({ body: z.object({ full_name: z.string().trim().min(2).max(80), phone_number: phoneField }) }),
  async (req, res) => {
    const { full_name, phone_number } = req.valid.body
    if (await prisma.user.findUnique({ where: { phone: phone_number } })) throw conflict("Bu telefon raqami bilan mijoz bor")

    const password = tempPassword()
    const passwordHash = await hashPassword(password)

    const user = await prisma.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { name: "customer_code" },
        update: { value: { increment: 1 } },
        create: { name: "customer_code", value: 1 },
      })
      return tx.user.create({
        data: { role: "CUSTOMER", fullName: full_name, phone: phone_number, code: String(counter.value).padStart(3, "0"), passwordHash, mustChangePassword: true },
      })
    })
    res.status(201).json({ ...customerOut(user), temporary_password: password })
  },
)

/* PATCH /customers/:id/status: bloklash / faollashtirish. Bloklangan mijoz tokeni darhol ishlamay qoladi (auth middleware bazadan tekshiradi). */
router.patch(
  "/:id/status",
  validate({ params: idParams, body: z.object({ status: z.enum(["active", "inactive", "frozen", "blocked"]) }) }),
  async (req, res) => {
    const found = await prisma.user.findFirst({ where: { id: req.valid.params.id, role: "CUSTOMER" } })
    if (!found) throw notFound("Mijoz topilmadi")
    const user = await prisma.user.update({ where: { id: found.id }, data: { status: STATUSES[req.valid.body.status] } })
    res.json(customerOut(user))
  },
)

/* POST /customers/:id/reset-password: "Parolni unutdim" (Login sahifasida administratorga ayting deyilgan) */
router.post("/:id/reset-password", validate({ params: idParams }), async (req, res) => {
  const found = await prisma.user.findFirst({ where: { id: req.valid.params.id, role: "CUSTOMER" } })
  if (!found) throw notFound("Mijoz topilmadi")
  const password = tempPassword()
  await prisma.user.update({
    where: { id: found.id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null },
  })
  await prisma.refreshToken.updateMany({ where: { userId: found.id, revokedAt: null }, data: { revokedAt: new Date() } })
  res.json({ temporary_password: password })
})

export default router
