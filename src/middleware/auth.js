import jwt from "jsonwebtoken"
import { env } from "../config.js"
import { prisma } from "../db.js"
import { forbidden, unauthorized } from "../utils/errors.js"

export const signAccess = (user) =>
  jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, { subject: user.id, expiresIn: `${env.ACCESS_TTL_MIN}m`, algorithm: "HS256" })

const build = ({ allowPasswordChange }) => async (req, _res, next) => {
  try {
    const header = req.headers.authorization ?? ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : null
    if (!token) throw unauthorized()

    let payload
    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] })
    } catch {
      throw unauthorized("Sessiya tugadi. Qaytadan kiring", "TOKEN_EXPIRED")
    }

    // Har so'rovda bazadan tekshiriladi: bloklangan yoki o'chirilgan foydalanuvchi token muddati tugashini kutmasdan darhol to'xtaydi
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) throw unauthorized()
    if (user.status !== "ACTIVE") throw forbidden("Hisobingiz faol emas. Administratorga murojaat qiling.", "ACCOUNT_INACTIVE")
    if (user.mustChangePassword && !allowPasswordChange) throw forbidden("Avval yangi parol o'rnating", "PASSWORD_CHANGE_REQUIRED")

    req.user = user // rol har doim bazadagi qiymat, tokendagi emas
    next()
  } catch (err) {
    next(err)
  }
}

export const authenticate = build({ allowPasswordChange: false })
// Faqat /auth/me va /auth/change-password uchun: vaqtinchalik parol bilan kirgan foydalanuvchi shu ikkitasiga kira oladi
export const authenticateLoose = build({ allowPasswordChange: true })

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(forbidden())

export const staffOnly = requireRole("OWNER", "STAFF")
export const ownerOnly = requireRole("OWNER")
export const customerOnly = requireRole("CUSTOMER")
