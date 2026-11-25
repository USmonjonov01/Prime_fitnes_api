import { Router } from "express"
import bcrypt from "bcryptjs"
import crypto from "node:crypto"
import rateLimit from "express-rate-limit"
import { z } from "zod"
import { prisma } from "../db.js"
import { env, isProd, corsOrigins } from "../config.js"
import { signAccess, authenticateLoose } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"
import { AppError, forbidden, unauthorized } from "../utils/errors.js"
import { looksLikePhone, normalizePhone } from "../utils/phone.js"
import { publicUser } from "../utils/serialize.js"

const router = Router()

const COOKIE = "pf_refresh"
const MAX_FAILED = 5
const LOCK_MIN = 15
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10) // login topilmasa ham bcrypt vaqti ketadi: foydalanuvchi bor-yo'qligi vaqtdan bilinmaydi

export const hashPassword = (plain) => bcrypt.hash(plain, 12)
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex")

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax", // frontend va API alohida domenda bo'lsa "none" + secure kerak
  path: "/api/auth",
  maxAge: env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
}

const authUser = (u) => ({ ...publicUser(u), must_change_password: u.mustChangePassword })

async function issueTokens(res, user, req) {
  const refresh = crypto.randomBytes(48).toString("base64url")
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: sha256(refresh), expiresAt: new Date(Date.now() + cookieOptions.maxAge) },
  })
  res.cookie(COOKIE, refresh, cookieOptions)
  return { access_token: signAccess(user), expires_in: env.ACCESS_TTL_MIN * 60, user: authUser(user) }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20, // bir IP dan 15 daqiqada 20 urinish
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new AppError(429, "RATE_LIMIT", "Urinishlar juda ko'p. Birozdan keyin urinib ko'ring.")),
})

/* ------------------------------ POST /auth/login ------------------------------ */
// login: telefon raqami YOKI karta kodi. Rol bazadan olinadi, shuning uchun "Men adminman" belgisi kerak emas.
router.post(
  "/login",
  loginLimiter,
  validate({ body: z.object({ login: z.string().trim().min(1).max(40), password: z.string().min(1).max(200) }) }),
  async (req, res) => {
    const { login, password } = req.valid.body

    const where = looksLikePhone(login)
      ? { phone: normalizePhone(login) ?? "-" }
      : { code: login }
    const user = await prisma.user.findUnique({ where })

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(429, "ACCOUNT_LOCKED", "Juda ko'p noto'g'ri urinish. 15 daqiqadan keyin urinib ko'ring.")
    }

    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
    if (!user || !ok) {
      if (user) {
        const failed = user.failedLogins + 1
        await prisma.user.update({
          where: { id: user.id },
          data: failed >= MAX_FAILED
            ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MIN * 60 * 1000) }
            : { failedLogins: failed },
        })
      }
      throw unauthorized("Login yoki parol noto'g'ri", "INVALID_CREDENTIALS")
    }

    // Parol to'g'ri bo'lgandan keyingina holat aytiladi (begona odam hisob borligini bilib olmasin)
    if (user.status !== "ACTIVE") throw forbidden("Hisobingiz faol emas. Administratorga murojaat qiling.", "ACCOUNT_INACTIVE")

    if (user.failedLogins || user.lockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } })
    }
    res.json(await issueTokens(res, user, req))
  },
)

/* ------------------------------ POST /auth/refresh ------------------------------ */
// Cookie dagi refresh token bilan yangi access token. Refresh har safar almashadi (rotation).
// Eski refresh qayta ishlatilsa (o'g'irlangan bo'lishi mumkin) foydalanuvchining hamma sessiyasi yopiladi.
router.post("/refresh", async (req, res) => {
  const origin = req.headers.origin
  if (origin && !corsOrigins.includes(origin)) throw forbidden("Ruxsat etilmagan manba", "BAD_ORIGIN")

  const raw = req.cookies?.[COOKIE]
  if (!raw) throw unauthorized()

  const token = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } })
  if (!token) throw unauthorized()
  if (token.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } })
    res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined })
    throw unauthorized("Sessiya yopildi. Qaytadan kiring", "TOKEN_REUSED")
  }
  if (token.expiresAt < new Date()) throw unauthorized("Sessiya tugadi. Qaytadan kiring", "TOKEN_EXPIRED")
  if (token.user.status !== "ACTIVE") throw forbidden("Hisobingiz faol emas. Administratorga murojaat qiling.", "ACCOUNT_INACTIVE")

  const revoked = await prisma.refreshToken.updateMany({ where: { id: token.id, revokedAt: null }, data: { revokedAt: new Date() } })
  if (revoked.count === 0) throw unauthorized() // ikki so'rov bir vaqtda keldi: ikkinchisi rad etiladi

  res.json(await issueTokens(res, token.user, req))
})

/* ------------------------------ POST /auth/logout ------------------------------ */
router.post("/logout", async (req, res) => {
  const raw = req.cookies?.[COOKIE]
  if (raw) await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } })
  res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined })
  res.status(204).end()
})

/* ------------------------------ GET /auth/me ------------------------------ */
router.get("/me", authenticateLoose, (req, res) => res.json({ user: authUser(req.user) }))

/* ------------------------------ POST /auth/change-password ------------------------------ */
// Vaqtinchalik parol bilan kirgan (must_change_password) foydalanuvchi eski parolni qayta yozmaydi: hozirgina kirgan.
// Qolgan hollarda currentPassword shart. Parol almashganda boshqa qurilmalardagi sessiyalar yopiladi.
export const MIN_PASSWORD = 6
router.post(
  "/change-password",
  authenticateLoose,
  validate({
    body: z.object({
      current_password: z.string().max(200).optional(),
      new_password: z.string().trim().min(MIN_PASSWORD, `Parol kamida ${MIN_PASSWORD} ta belgi bo'lsin`).max(72),
    }),
  }),
  async (req, res) => {
    const { current_password, new_password } = req.valid.body
    const user = req.user

    if (!user.mustChangePassword) {
      if (!current_password || !(await bcrypt.compare(current_password, user.passwordHash))) {
        throw unauthorized("Joriy parol noto'g'ri", "INVALID_CREDENTIALS")
      }
    }
    if (await bcrypt.compare(new_password, user.passwordHash)) {
      throw new AppError(400, "SAME_PASSWORD", "Yangi parol eskisidan farq qilsin")
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(new_password), mustChangePassword: false },
    })
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
    res.json(await issueTokens(res, updated, req))
  },
)

export default router
