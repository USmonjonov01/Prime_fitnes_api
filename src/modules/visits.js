import { Router } from "express"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "../db.js"
import { authenticate, staffOnly } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"
import { AppError, conflict } from "../utils/errors.js"
import { dayKey } from "../utils/time.js"
import { stateOf, visitsLeftOf } from "../utils/subscription.js"

const router = Router()
router.use(authenticate, staffOnly)

// Frontend DENIED_TEXT dagi sabablar: not_found | expired | finished | blocked (+ yangisi: already_today)
const denied = (status, reason, client) =>
  new AppError(status, "CHECKIN_DENIED", "Kirishga ruxsat berilmadi", { reason, client })

/* POST /visits/check-in { code }: kirishni belgilash.
   Qoidalar: mijoz faol bo'lsin; muddati tugamagan va tashrifi qolgan abonement bo'lsin (eng yaqin tugaydigani ishlatiladi);
   bir kunda bir marta. Hammasi bitta tranzaksiyada: ikki xodim bir vaqtda belgilasa ham tashrif ikki marta ayirilmaydi. */
router.post("/check-in", validate({ body: z.object({ code: z.string().trim().min(1).max(40) }) }), async (req, res) => {
  const { code } = req.valid.body
  const client = await prisma.user.findFirst({ where: { code, role: "CUSTOMER" } })
  if (!client) throw denied(404, "not_found")

  const info = { id: client.id, full_name: client.fullName, code: client.code }
  if (client.status !== "ACTIVE") throw denied(409, "blocked", info)

  const now = new Date()
  const subs = await prisma.subscription.findMany({ where: { userId: client.id, status: "ACTIVE" }, orderBy: { endDate: "asc" } })
  const usable = subs.find((s) => stateOf(s, now) === "active")
  if (!usable) throw denied(409, subs.some((s) => stateOf(s, now) === "finished") ? "finished" : "expired", info)

  try {
    await prisma.$transaction(async (tx) => {
      await tx.visit.create({
        data: { userId: client.id, subscriptionId: usable.id, checkedInById: req.user.id, visitDay: dayKey(now), createdAt: now },
      })
      // visitUsed hali o'qiganimizday bo'lsagina oshiriladi (optimistik qulf)
      const updated = await tx.subscription.updateMany({
        where: { id: usable.id, visitUsed: usable.visitUsed, status: "ACTIVE" },
        data: { visitUsed: { increment: 1 } },
      })
      if (updated.count !== 1) throw conflict("Bir vaqtda o'zgarish bo'ldi. Qayta urinib ko'ring.", "RETRY")
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw denied(409, "already_today", info)
    throw err
  }

  res.status(201).json({ client: info, visitsLeft: visitsLeftOf(usable) - 1, method: "code" })
})

export default router
