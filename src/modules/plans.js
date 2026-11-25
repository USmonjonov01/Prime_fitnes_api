import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db.js"
import { authenticate, ownerOnly } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"

const router = Router()
const out = (p) => ({ id: p.id, name: p.name, months: p.months, price: p.price, visit_total: p.visitTotal, valid_days: p.validDays, active: p.active })

// Ochiq: narxlar sahifasi uchun (Home/Services). Hozir frontenddagi utils/gym.js o'rniga shu ishlatilishi mumkin.
router.get("/", async (_req, res) => {
  const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })
  res.json(plans.map(out))
})

// Ega narx yoki qoidani o'zgartiradi. Sotilgan abonementlarga ta'sir qilmaydi (ular nusxa saqlaydi).
router.patch(
  "/:id",
  authenticate,
  ownerOnly,
  validate({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
      price: z.number().int().min(0).max(100_000_000).optional(),
      visit_total: z.number().int().min(1).max(1000).optional(),
      valid_days: z.number().int().min(1).max(1000).optional(),
      active: z.boolean().optional(),
    }).strict(),
  }),
  async (req, res) => {
    const { price, visit_total, valid_days, active } = req.valid.body
    const plan = await prisma.plan.update({
      where: { id: req.valid.params.id },
      data: { price, visitTotal: visit_total, validDays: valid_days, active },
    })
    res.json(out(plan))
  },
)

export default router
