import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db.js"
import { authenticate, ownerOnly, staffOnly } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"
import { AppError, conflict, forbidden, notFound } from "../utils/errors.js"
import { DAY_MS, endOfDay } from "../utils/time.js"

const router = Router()
router.use(authenticate)

/* POST /subscriptions: abonement sotish (xodim yoki ega).
   Mijoz customer_id yoki karta kodi (code) bilan topiladi. Narx va qoidalar serverdagi Plan dan olinadi:
   brauzerdan kelgan narxga ishonilmaydi. Narxni faqat ega o'zgartira oladi (chegirma uchun). */
router.post(
  "/",
  staffOnly,
  validate({
    body: z.object({
      customer_id: z.string().min(1).optional(),
      code: z.string().trim().min(1).optional(),
      plan_id: z.string().min(1),
      price: z.number().int().min(0).max(100_000_000).optional(),
    }).refine((b) => b.customer_id || b.code, { message: "customer_id yoki code kerak" }),
  }),
  async (req, res) => {
    const { customer_id, code, plan_id, price } = req.valid.body

    const customer = await prisma.user.findFirst({
      where: { role: "CUSTOMER", ...(customer_id ? { id: customer_id } : { code }) },
    })
    if (!customer) throw notFound("Mijoz topilmadi")
    if (customer.status !== "ACTIVE") throw conflict("Mijoz faol emas. Avval faollashtiring.", "CUSTOMER_INACTIVE")

    const plan = await prisma.plan.findFirst({ where: { id: plan_id, active: true } })
    if (!plan) throw new AppError(400, "BAD_PLAN", "Bunday abonement turi yo'q")

    if (price !== undefined && price !== plan.price && req.user.role !== "OWNER") {
      throw forbidden("Narxni faqat zal egasi o'zgartira oladi")
    }

    const now = new Date()
    const endDate = plan.id === "day" ? endOfDay(now) : new Date(now.getTime() + plan.validDays * DAY_MS)

    const sub = await prisma.subscription.create({
      data: {
        userId: customer.id,
        planId: plan.id,
        startDate: now,
        endDate,
        price: price ?? plan.price,
        visitTotal: plan.visitTotal,
        soldById: req.user.id,
      },
    })
    res.status(201).json({
      id: sub.id,
      client: { id: customer.id, full_name: customer.fullName, code: customer.code },
      visitTotal: sub.visitTotal,
      endDate: sub.endDate,
    })
  },
)

/* POST /subscriptions/:id/cancel: faqat ega. Pul qaytarish/jurnal keyin kerak bo'lsa alohida qo'shiladi. */
router.post("/:id/cancel", ownerOnly, validate({ params: z.object({ id: z.string().min(1) }) }), async (req, res) => {
  const sub = await prisma.subscription.findUnique({ where: { id: req.valid.params.id } })
  if (!sub) throw notFound("Abonement topilmadi")
  await prisma.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED" } })
  res.status(204).end()
})

export default router
