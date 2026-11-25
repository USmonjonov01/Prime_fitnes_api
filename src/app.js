import express from "express"
import helmet from "helmet"
import cors from "cors"
import cookieParser from "cookie-parser"
import rateLimit from "express-rate-limit"
import { corsOrigins } from "./config.js"
import { errorHandler, notFoundHandler } from "./middleware/error.js"
import { prisma } from "./db.js"
import auth from "./modules/auth.js"
import plans from "./modules/plans.js"
import customers from "./modules/customers.js"
import staff from "./modules/staff.js"
import subscriptions from "./modules/subscriptions.js"
import visits from "./modules/visits.js"
import dashboard from "./modules/dashboard.js"
import reports from "./modules/reports.js"
import expenses from "./modules/expenses.js"
import me from "./modules/me.js"

export const app = express()

app.set("trust proxy", 1) // Render/Railway/Fly proxy orqasida: rate limit haqiqiy IP bo'yicha ishlaydi
app.disable("x-powered-by")
app.use(helmet())
app.use(cors({
  origin: (origin, cb) => (!origin || corsOrigins.includes(origin) ? cb(null, true) : cb(null, false)),
  credentials: true, // refresh cookie uchun
}))
app.use(express.json({ limit: "50kb" }))
app.use(cookieParser())
app.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false })) // umumiy: daqiqada 120 so'rov

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ ok: true })
})

app.use("/api/auth", auth)
app.use("/api/plans", plans)
app.use("/api/customers", customers)
app.use("/api/staff", staff)
app.use("/api/subscriptions", subscriptions)
app.use("/api/visits", visits)
app.use("/api/dashboard", dashboard)
app.use("/api/reports", reports)
app.use("/api/expenses", expenses)
app.use("/api/me", me)

app.use(notFoundHandler)
app.use(errorHandler)
