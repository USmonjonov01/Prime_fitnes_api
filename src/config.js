import "dotenv/config"
import { z } from "zod"

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET kamida 32 belgi bo'lsin"),
  ACCESS_TTL_MIN: z.coerce.number().default(15),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
    // Telefon raqamini SMS kod bilan tasdiqlash. console: faqat serverga yozadi (lokal), eskiz: haqiqiy SMS
  SMS_PROVIDER: z.enum(["console", "eskiz"]).default("console"),
  ESKIZ_EMAIL: z.string().optional(),
  ESKIZ_PASSWORD: z.string().optional(),
  ESKIZ_FROM: z.string().default("4546"),
  ESKIZ_BASE_URL: z.string().default("https://notify.eskiz.uz/api"),
  SMS_TEMPLATE: z.string().includes("{code}", { message: "SMS_TEMPLATE ichida {code} bo'lishi kerak" })
    .default("Gym Prime Fit: tasdiqlash kodi {code}. Uni hech kimga bermang."),
  SMS_DAILY_LIMIT: z.coerce.number().int().positive().default(200),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error("❌ .env noto'g'ri:")
  for (const i of parsed.error.issues) console.error(`  - ${i.path.join(".")}: ${i.message}`)
  process.exit(1)
}

export const env = parsed.data
export const isProd = env.NODE_ENV === "production"
export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
