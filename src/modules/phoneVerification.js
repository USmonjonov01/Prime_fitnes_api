import { Router } from "express"
import { z } from "zod"
import { env } from "../config.js"
import { prisma } from "../db.js"
import { authenticate, staffOnly } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"
import { AppError, notFound } from "../utils/errors.js"
import { createPhoneVerification } from "../utils/phoneVerification.js"
import { sendSms, smsConfigured } from "../utils/sms.js"
import { startOfDay } from "../utils/time.js"

// Mijozning telefon raqamini SMS kod bilan tasdiqlash. Tasdiqlash majburiy emas: tasdiqlanmagan mijoz ham ishlayveradi,
// faqat ro'yxatda "tasdiqlanmagan" belgisi turadi (User.phoneVerifiedAt = null).
const router = Router()
router.use(authenticate, staffOnly)

const service = createPhoneVerification({
  db: prisma,
  send: sendSms,
  secret: env.JWT_ACCESS_SECRET,
  template: env.SMS_TEMPLATE,
  dailyLimit: env.SMS_DAILY_LIMIT,
  startOfDay,
})

const idParams = z.object({ id: z.string().min(1) })

const findCustomer = async (id) => {
  const customer = await prisma.user.findFirst({ where: { id, role: "CUSTOMER" } })
  if (!customer) throw notFound("Mijoz topilmadi")
  return customer
}

/* POST /phone/customers/:id/send-code: mijozning raqamiga 6 xonali kod yuboradi */
router.post("/customers/:id/send-code", validate({ params: idParams }), async (req, res) => {
  if (!smsConfigured()) throw new AppError(503, "SMS_NOT_CONFIGURED", "SMS xizmati hali sozlanmagan. Administratorga murojaat qiling.")
  res.json(await service.sendCode(await findCustomer(req.valid.params.id)))
})

/* POST /phone/customers/:id/verify { code }: mijoz aytgan kodni tekshiradi */
router.post(
  "/customers/:id/verify",
  validate({ params: idParams, body: z.object({ code: z.string().trim().regex(/^\d{6}$/, "Kod 6 ta raqamdan iborat") }) }),
  async (req, res) => {
    res.json(await service.verify(await findCustomer(req.valid.params.id), req.valid.body.code))
  },
)

export default router
