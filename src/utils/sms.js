import { env } from "../config.js"
import { AppError } from "./errors.js"

// SMS yuborish. Provayder .env dagi SMS_PROVIDER bilan tanlanadi:
//   console  faqat server konsoliga yozadi, hech narsa yuborilmaydi (lokal ishlab chiqish uchun). Productionda ishlamaydi.
//   eskiz    Eskiz.uz (notify.eskiz.uz), ESKIZ_EMAIL va ESKIZ_PASSWORD kerak.

export const smsConfigured = () =>
  env.SMS_PROVIDER === "eskiz" ? Boolean(env.ESKIZ_EMAIL && env.ESKIZ_PASSWORD) : env.NODE_ENV !== "production"

// SMS matnida tasdiqlash kodi bor: xato yozuvlarga matnni hech qachon chiqarmaymiz
const failed = (why) => {
  console.error("[sms]", why)
  return new AppError(502, "SMS_FAILED", "SMS yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring.")
}

/* ------------------------------ Eskiz ------------------------------ */

let token = null // xotirada turadi; muddati tugasa (401) qayta kiriladi
let loginPromise = null // bir vaqtda bir nechta so'rov bo'lsa, kirish bir marta bajariladi

const eskizLogin = () => {
  loginPromise ??= (async () => {
    const res = await fetch(`${env.ESKIZ_BASE_URL}/auth/login`, {
      method: "POST",
      body: new URLSearchParams({ email: env.ESKIZ_EMAIL, password: env.ESKIZ_PASSWORD }),
      signal: AbortSignal.timeout(10_000),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.data?.token) throw failed(`Eskiz kirish rad etdi (${res.status}): ${json?.message ?? "javob yo'q"}`)
    token = json.data.token
  })().finally(() => { loginPromise = null })
  return loginPromise
}

async function eskizSend(phone, text, canRetry = true) {
  if (!token) await eskizLogin()
  const res = await fetch(`${env.ESKIZ_BASE_URL}/message/sms/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    // Eskiz raqamni "+" siz kutadi: 998901234567
    body: new URLSearchParams({ mobile_phone: phone.replace(/\D/g, ""), message: text, from: env.ESKIZ_FROM }),
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 401 && canRetry) { // token eskirgan: bir marta qayta kirib urinamiz
    token = null
    return eskizSend(phone, text, false)
  }
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    throw failed(`Eskiz SMS yubormadi (${res.status}): ${json?.message ?? "javob yo'q"}`)
  }
}

/* ------------------------------ Umumiy kirish nuqtasi ------------------------------ */

export async function sendSms(phone, text) {
  if (env.SMS_PROVIDER === "console") {
    if (env.NODE_ENV === "production") throw failed("SMS_PROVIDER=console productionda ishlamaydi")
    console.log(`[sms:console] ${phone}: ${text}`)
    return
  }
  try {
    await eskizSend(phone, text)
  } catch (err) {
    if (err instanceof AppError) throw err
    throw failed(`Eskiz bilan aloqa xatosi: ${err?.message ?? err}`) // tarmoq yoki vaqt tugashi
  }
}