import { Router } from "express"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "../db.js"
import { authenticate, staffOnly } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"
import { AppError, conflict } from "../utils/errors.js"
import { dayKey } from "../utils/time.js"
import { stateOf, visitsLeftOf } from "../utils/subscription.js"
import { logActivity } from "../utils/activity.js"
import { verifyCheckinToken } from "../utils/checkinToken.js"

const router = Router()
router.use(authenticate, staffOnly)

// Frontend DENIED_TEXT dagi sabablar: not_found | expired | finished | blocked | already_today | qr_expired | qr_invalid
const denied = (status, reason, client) =>
  new AppError(status, "CHECKIN_DENIED", "Kirishga ruxsat berilmadi", { reason, client })

/* POST /visits/check-in { code } yoki { qr }: kirishni belgilash.
   code: qo'lda yozilgan mijoz kodi (zaxira yo'l). qr: mijoz telefonidagi QR kod matni (asosiy yo'l, USB skaner ham shuni yozadi).
   Qoidalar: mijoz faol bo'lsin; muddati tugamagan va tashrifi qolgan abonement bo'lsin (eng yaqin tugaydigani ishlatiladi);
   bir kunda bir marta. Hammasi bitta tranzaksiyada: ikki xodim bir vaqtda belgilasa ham tashrif ikki marta ayirilmaydi. */
// Rad etilgan urinish ham jurnalga yoziladi: boshqa xodim ham "nima bo'ldi" deb ko'ra oladi
const deny = async (req, code, status, reason, client, method = "code") => {
  await logActivity({ type: "CHECK_IN_DENIED", actorId: req.user.id, customerId: client?.id ?? null, data: { reason, code, method } })
  return denied(status, reason, client)
}

const body = z.object({
  code: z.string().trim().min(1).max(40).optional(),
  qr: z.string().trim().min(1).max(200).optional(),
}).refine((b) => Boolean(b.code) !== Boolean(b.qr), { message: "code yoki qr yuboring (ikkalasi emas)" })

router.post("/check-in", validate({ body }), async (req, res) => {
  const { code, qr } = req.valid.body
  const method = qr ? "qr" : "code"

  let client
  if (qr) {
    // Imzo va muddat tekshiriladi. Mijozni topish id bo'yicha: QR da kod emas, imzolangan id bor
    const checked = verifyCheckinToken(qr)
    if (!checked.ok) {
      const expired = checked.reason === "expired"
      const owner = expired ? await prisma.user.findFirst({ where: { id: checked.userId, role: "CUSTOMER" } }) : null
      const info = owner ? { id: owner.id, full_name: owner.fullName, code: owner.code } : undefined // kimning QR i eskirgani ko'rinsin
      throw await deny(req, undefined, expired ? 409 : 400, expired ? "qr_expired" : "qr_invalid", info, method)
    }
    client = await prisma.user.findFirst({ where: { id: checked.userId, role: "CUSTOMER" } })
    if (!client) throw await deny(req, undefined, 400, "qr_invalid", undefined, method)
  } else {
    client = await prisma.user.findFirst({ where: { code, role: "CUSTOMER" } })
    if (!client) throw await deny(req, code, 404, "not_found", undefined, method)
  }

  const info = { id: client.id, full_name: client.fullName, code: client.code }
  if (client.status !== "ACTIVE") throw await deny(req, code, 409, "blocked", info, method)

  const now = new Date()
  const subs = await prisma.subscription.findMany({ where: { userId: client.id, status: "ACTIVE" }, orderBy: { endDate: "asc" } })
  const usable = subs.find((s) => stateOf(s, now) === "active")
  if (!usable) throw await deny(req, code, 409, subs.some((s) => stateOf(s, now) === "finished") ? "finished" : "expired", info, method)

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
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw await deny(req, code, 409, "already_today", info, method)
    throw err
  }

  const visitsLeft = visitsLeftOf(usable) - 1
  await logActivity({ type: "CHECK_IN", actorId: req.user.id, customerId: client.id, data: { visitsLeft, method } })
  res.status(201).json({ client: info, visitsLeft, method })
})

export default router