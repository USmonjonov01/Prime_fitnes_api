// Birinchi ishga tushirish: abonement turlari va zal egasi. Qayta ishga tushirsa ham xavfsiz (upsert).
// Narxlar frontend utils/gym.js dan. Tashrif soni va muddat esa frontend PLAN_RULES dan (egasi faqat 1 oylikni tasdiqlagan).
import "dotenv/config"
import bcrypt from "bcryptjs"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const PLANS = [
  { id: "day", name: "Bir kunlik", months: null, price: 25000, visitTotal: 1, validDays: 1, sortOrder: 1 },
  { id: "month", name: "1 oylik", months: 1, price: 250000, visitTotal: 15, validDays: 45, sortOrder: 2 },
  { id: "quarter", name: "3 oylik", months: 3, price: 700000, visitTotal: 45, validDays: 135, sortOrder: 3 },
  { id: "half", name: "6 oylik", months: 6, price: 1300000, visitTotal: 90, validDays: 270, sortOrder: 4 },
  { id: "year", name: "1 yillik", months: 12, price: 2500000, visitTotal: 180, validDays: 540, sortOrder: 5 },
]

for (const p of PLANS) {
  // update bo'sh: ega keyin narxni o'zgartirgan bo'lsa seed uni qaytarib yubormaydi
  await prisma.plan.upsert({ where: { id: p.id }, update: {}, create: p })
}

const phone = process.env.SEED_OWNER_PHONE
const password = process.env.SEED_OWNER_PASSWORD
if (!phone || !password || password.length < 8) {
  console.error("SEED_OWNER_PHONE va SEED_OWNER_PASSWORD (kamida 8 belgi) .env da bo'lishi kerak")
  process.exit(1)
}

const owner = await prisma.user.findUnique({ where: { phone } })
if (owner) {
  console.log("Ega allaqachon bor, o'tkazib yuborildi:", phone)
} else {
  await prisma.user.create({
    data: {
      role: "OWNER",
      fullName: process.env.SEED_OWNER_NAME || "Zal egasi",
      phone,
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: true, // birinchi kirishda o'zi yangi parol qo'yadi
    },
  })
  console.log("Zal egasi yaratildi:", phone)
}

await prisma.$disconnect()
