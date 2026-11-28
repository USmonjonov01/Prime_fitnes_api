import crypto from "node:crypto"
import { AppError, badRequest, conflict } from "./errors.js"

// Telefon raqamini SMS kod bilan tasdiqlash qoidalari. Bu fayl Express va bazaning o'zini bilmaydi:
// db, send (SMS yuboruvchi) tashqaridan beriladi, shuning uchun mantiq alohida sinab ko'riladi.

export const CODE_TTL_SEC = 300 // kod 5 daqiqa yaroqli
export const RESEND_SEC = 60 // yangi kod kamida 60 soniyadan keyin
export const MAX_ATTEMPTS = 5 // bitta kodni 5 marta tekshirish mumkin
export const MAX_SENDS_PER_HOUR = 5 // bitta mijozga soatiga ko'pi bilan 5 ta SMS

const tooMany = (code, message, details) => new AppError(429, code, message, details)

// "+998901234567" -> "+998 90 *** ** 67"
export const maskPhone = (phone) => {
  const d = String(phone).replace(/\D/g, "")
  return `+${d.slice(0, 3)} ${d.slice(3, 5)} *** ** ${d.slice(-2)}`
}

export function createPhoneVerification({ db, send, secret, template, dailyLimit, startOfDay, now = () => new Date() }) {
  // Kodning o'zi bazada saqlanmaydi: faqat HMAC hashi. Hash mijoz va raqamga bog'langan.
  const hash = (userId, phone, code) => crypto.createHmac("sha256", secret).update(`${userId}:${phone}:${code}`).digest("hex")
  const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

  async function sendCode(customer) {
    if (customer.phoneVerifiedAt) throw conflict("Bu raqam allaqachon tasdiqlangan", "ALREADY_VERIFIED")

    const t = now()
    const last = await db.phoneVerification.findFirst({ where: { userId: customer.id }, orderBy: { createdAt: "desc" } })
    if (last) {
      const wait = Math.ceil((last.createdAt.getTime() + RESEND_SEC * 1000 - t.getTime()) / 1000)
      if (wait > 0) throw tooMany("CODE_COOLDOWN", `Yangi kodni ${wait} soniyadan keyin yuborish mumkin`, { retry_after: wait })
    }

    const hourAgo = new Date(t.getTime() - 3600 * 1000)
    if ((await db.phoneVerification.count({ where: { userId: customer.id, createdAt: { gte: hourAgo } } })) >= MAX_SENDS_PER_HOUR) {
      throw tooMany("CODE_LIMIT", "Bu mijozga soatiga 5 tadan ko'p SMS yuborib bo'lmaydi. Keyinroq urinib ko'ring.")
    }
    // Pullik SMS suiiste'mol qilinsa (yoki xato tufayli ko'p yuborilsa) umumiy kunlik chegara to'xtatadi
    if ((await db.phoneVerification.count({ where: { createdAt: { gte: startOfDay(t) } } })) >= dailyLimit) {
      throw tooMany("SMS_DAILY_LIMIT", "Bugungi SMS limiti tugadi. Ertaga urinib ko'ring yoki egaga ayting.")
    }

    const code = String(crypto.randomInt(100000, 1000000))
    const record = await db.phoneVerification.create({
      data: {
        userId: customer.id,
        phone: customer.phone,
        codeHash: hash(customer.id, customer.phone, code),
        expiresAt: new Date(t.getTime() + CODE_TTL_SEC * 1000),
      },
    })

    try {
      await send(customer.phone, template.replace("{code}", code))
    } catch (err) {
      await db.phoneVerification.delete({ where: { id: record.id } }) // yuborilmagan urinish hisobga kirmaydi
      throw err
    }

    // Faqat eng yangi kod yaroqli: eskilari yopiladi
    await db.phoneVerification.updateMany({ where: { userId: customer.id, consumedAt: null, id: { not: record.id } }, data: { consumedAt: t } })
    return { sent_to: maskPhone(customer.phone), expires_in: CODE_TTL_SEC, resend_in: RESEND_SEC }
  }

  async function verify(customer, code) {
    if (customer.phoneVerifiedAt) return { phone_verified: true, phone_verified_at: customer.phoneVerifiedAt }

    const t = now()
    // Faqat shu raqamga yuborilgan kod: raqam keyin o'zgargan bo'lsa eski kod ishlamaydi
    const record = await db.phoneVerification.findFirst({
      where: { userId: customer.id, phone: customer.phone, consumedAt: null, expiresAt: { gt: t } },
      orderBy: { createdAt: "desc" },
    })
    if (!record) throw badRequest("Kod muddati tugagan yoki yuborilmagan. Yangi kod yuboring.", "CODE_EXPIRED")

    if (!same(record.codeHash, hash(customer.id, customer.phone, code))) {
      const updated = await db.phoneVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } })
      const left = MAX_ATTEMPTS - updated.attempts
      if (left <= 0) {
        await db.phoneVerification.updateMany({ where: { id: record.id, consumedAt: null }, data: { consumedAt: t } })
        throw tooMany("TOO_MANY_ATTEMPTS", "Urinishlar tugadi. Yangi kod yuboring.")
      }
      throw badRequest("Kod noto'g'ri", "CODE_INVALID", { attempts_left: left })
    }

    // Bitta kod faqat bir marta ishlaydi (ikkita bir vaqtdagi so'rov ikkalasi ham o'tib ketmasin)
    const { count } = await db.phoneVerification.updateMany({ where: { id: record.id, consumedAt: null }, data: { consumedAt: t } })
    if (count !== 1) throw badRequest("Kod allaqachon ishlatilgan. Yangi kod yuboring.", "CODE_EXPIRED")

    await db.user.update({ where: { id: customer.id }, data: { phoneVerifiedAt: t } })
    return { phone_verified: true, phone_verified_at: t }
  }

  return { sendCode, verify }
}
