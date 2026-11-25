// Frontend NotificationContext status kodiga qarab xabar tanlaydi (400/401/403/404/409/429/5xx), shuning uchun status to'g'ri bo'lishi muhim.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (message, code = "BAD_REQUEST", details) => new AppError(400, code, message, details)
export const unauthorized = (message = "Qaytadan tizimga kiring", code = "UNAUTHORIZED") => new AppError(401, code, message)
export const forbidden = (message = "Bu amal uchun ruxsatingiz yo'q", code = "FORBIDDEN") => new AppError(403, code, message)
export const notFound = (message = "Ma'lumot topilmadi", code = "NOT_FOUND") => new AppError(404, code, message)
export const conflict = (message = "Bunday ma'lumot allaqachon mavjud", code = "CONFLICT") => new AppError(409, code, message)

// Express 5 async xatolarni o'zi ushlaydi, lekin handler yozishda aniqlik uchun wrapper qoldirildi.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
