import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db.js"
import { authenticate, ownerOnly } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"
import { conflict, forbidden, notFound } from "../utils/errors.js"
import { customerOut } from "../utils/serialize.js"
import { hashPassword } from "./auth.js"
import { phoneField, tempPassword } from "./customers.js"

// Xodim hisoblarini faqat zal egasi boshqaradi (Login sahifasida shunday yozilgan)
const router = Router()
router.use(authenticate, ownerOnly)
const idParams = z.object({ id: z.string().min(1) })

router.get("/", async (_req, res) => {
  const staff = await prisma.user.findMany({ where: { role: "STAFF" }, orderBy: { createdAt: "desc" } })
  res.json(staff.map(customerOut))
})

router.post(
  "/",
  validate({ body: z.object({ full_name: z.string().trim().min(2).max(80), phone_number: phoneField }) }),
  async (req, res) => {
    const { full_name, phone_number } = req.valid.body
    if (await prisma.user.findUnique({ where: { phone: phone_number } })) throw conflict("Bu telefon raqami bilan hisob bor")
    const password = tempPassword()
    const user = await prisma.user.create({
      data: { role: "STAFF", fullName: full_name, phone: phone_number, passwordHash: await hashPassword(password), mustChangePassword: true },
    })
    res.status(201).json({ ...customerOut(user), temporary_password: password })
  },
)

router.patch(
  "/:id/status",
  validate({ params: idParams, body: z.object({ status: z.enum(["active", "blocked"]) }) }),
  async (req, res) => {
    const found = await prisma.user.findFirst({ where: { id: req.valid.params.id, role: "STAFF" } })
    if (!found) throw notFound("Xodim topilmadi")
    const user = await prisma.user.update({ where: { id: found.id }, data: { status: req.valid.body.status === "active" ? "ACTIVE" : "BLOCKED" } })
    res.json(customerOut(user))
  },
)

router.post("/:id/reset-password", validate({ params: idParams }), async (req, res) => {
  const found = await prisma.user.findFirst({ where: { id: req.valid.params.id, role: "STAFF" } })
  if (!found) throw notFound("Xodim topilmadi")
  if (found.id === req.user.id) throw forbidden()
  const password = tempPassword()
  await prisma.user.update({ where: { id: found.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null } })
  await prisma.refreshToken.updateMany({ where: { userId: found.id, revokedAt: null }, data: { revokedAt: new Date() } })
  res.json({ temporary_password: password })
})

export default router
