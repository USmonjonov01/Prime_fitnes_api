import crypto from "node:crypto"
import { env } from "../config.js"

/* ------------------------------------------------------------------------------------------
   KIRISH QR KODI: mijozning telefonida ko'rinadigan, qisqa muddatli imzolangan kod.

   Nega statik emas: doimiy QR (yoki "001" kabi kod) skrinshot qilib birovga yuborilishi mumkin va taxmin qilinadi.
   Bu kod esa 45 soniyada eskiradi va uni faqat mijozning o'z akkauntiga kirgan telefoni yangilab turadi.
   Skrinshot yoki surat bir daqiqadan keyin hech narsaga yaramaydi.

   Shakl:  PF1.<mijoz id>.<tugash vaqti, base36>.<imzo>      (taxminan 60 belgi, QR yengil o'qiladi)
   Imzo:   HMAC-SHA256, kalit JWT_ACCESS_SECRET dan alohida olinadi: shuning uchun bu kod
           kirish (access) tokeni sifatida ishlamaydi va aksincha. Yangi .env o'zgaruvchisi kerak emas.
------------------------------------------------------------------------------------------ */

export const QR_TTL_SEC = 45
const PREFIX = "PF1"

const key = crypto.createHmac("sha256", env.JWT_ACCESS_SECRET).update("prime-fit:checkin:v1").digest()
const sign = (body) => crypto.createHmac("sha256", key).update(body).digest().subarray(0, 16).toString("base64url")

export function createCheckinToken(userId, now = Date.now()) {
  const exp = Math.floor(now / 1000) + QR_TTL_SEC
  const body = `${PREFIX}.${userId}.${exp.toString(36)}`
  return { token: `${body}.${sign(body)}`, exp }
}

// { ok: true, userId } | { ok: false, reason: "invalid" } | { ok: false, reason: "expired", userId }
export function verifyCheckinToken(token, now = Date.now()) {
  const parts = String(token ?? "").split(".")
  if (parts.length !== 4 || parts[0] !== PREFIX) return { ok: false, reason: "invalid" }

  const [, userId, expB36, signature] = parts
  const given = Buffer.from(signature)
  const expected = Buffer.from(sign(`${PREFIX}.${userId}.${expB36}`))
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, reason: "invalid" }

  const exp = parseInt(expB36, 36)
  if (!Number.isFinite(exp)) return { ok: false, reason: "invalid" }
  if (Math.floor(now / 1000) > exp) return { ok: false, reason: "expired", userId } // imzo to'g'ri, faqat eskirgan: kimniki ekani ma'lum
  return { ok: true, userId }
}
