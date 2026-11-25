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
