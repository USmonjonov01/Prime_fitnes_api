import { ZodError } from "zod"
import { Prisma } from "@prisma/client"
import { AppError } from "../utils/errors.js"
import { isProd } from "../config.js"

export const notFoundHandler = (_req, _res, next) => next(new AppError(404, "NOT_FOUND", "Manzil topilmadi"))

// Hamma xato bitta shaklda: { error: { code, message, details? } }
export const errorHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } })
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
    return res.status(400).json({ error: { code: "VALIDATION", message: "Kiritilgan ma'lumot noto'g'ri", details } })
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return res.status(409).json({ error: { code: "CONFLICT", message: "Bunday ma'lumot allaqachon mavjud" } })
    if (err.code === "P2025") return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ma'lumot topilmadi" } })
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "BAD_JSON", message: "So'rov JSON shaklida emas" } })
  }

  console.error(`[${req.method} ${req.originalUrl}]`, err)
  res.status(500).json({ error: { code: "SERVER", message: isProd ? "Serverda xatolik" : String(err?.message ?? err) } })
}
