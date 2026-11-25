import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db.js"
import { authenticate, ownerOnly } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"

// Chiqimlar faqat egaga: ko'rish ham, yozish ham
const router = Router()
router.use(authenticate, ownerOnly)

const out = (e) => ({ id: e.id, amount: e.amount, category: e.category, note: e.note, date: e.date, created_at: e.createdAt })
const idParams = z.object({ id: z.string().min(1) })
const body = z.object({
  amount: z.number().int().positive().max(1_000_000_000),
  category: z.string().trim().max(50).optional(),
  note: z.string().trim().max(300).optional(),
  date: z.coerce.date().optional(),
})

router.get(
  "/",
  validate({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }) }),
  async (req, res) => {
    const { from, to } = req.valid.query
    const list = await prisma.expense.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: "desc" },
      take: 500,
    })
    res.json(list.map(out))
  },
)

router.post("/", validate({ body }), async (req, res) => {
  const { amount, category, note, date } = req.valid.body
  const e = await prisma.expense.create({ data: { amount, category, note, date: date ?? new Date(), createdById: req.user.id } })
  res.status(201).json(out(e))
})

router.put("/:id", validate({ params: idParams, body }), async (req, res) => {
  const { amount, category, note, date } = req.valid.body
  const e = await prisma.expense.update({ where: { id: req.valid.params.id }, data: { amount, category, note, ...(date ? { date } : {}) } })
  res.json(out(e))
})

router.delete("/:id", validate({ params: idParams }), async (req, res) => {
  await prisma.expense.delete({ where: { id: req.valid.params.id } })
  res.status(204).end()
})

export default router
