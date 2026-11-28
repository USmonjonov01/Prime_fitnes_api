# Prime Fit API

Node.js + Express 5 + Prisma + PostgreSQL (Neon). JWT (access) + httpOnly cookie (refresh).

## Ishga tushirish

```bash
npm install
cp .env.example .env        # va ichini to'ldiring (Neon manzillari, JWT_ACCESS_SECRET, SEED_OWNER_*)
npx prisma migrate dev --name init
npm run db:seed             # abonement turlari + zal egasi
npm run dev                 # http://localhost:4000/health
```

## Endpointlar (hammasi /api ostida; xato shakli: `{ error: { code, message, details? } }`)

| Metod | Manzil | Kim | Vazifa |
|---|---|---|---|
| POST | /auth/login `{login, password}` | hamma | telefon yoki kod bilan kirish |
| POST | /auth/refresh | cookie | yangi access token |
| POST | /auth/logout | hamma | chiqish |
| GET | /auth/me | kirgan | joriy foydalanuvchi |
| POST | /auth/change-password `{current_password?, new_password}` | kirgan | parol almashtirish (birinchi kirishda majburiy) |
| GET | /plans | ochiq | abonement turlari va narxlari |
| PATCH | /plans/:id | owner | narx/qoidani o'zgartirish |
| GET | /customers, /customers/:id | staff, owner | mijozlar (abonement va tashriflar bilan) |
| POST | /customers `{full_name, phone_number}` | staff, owner | mijoz qo'shish (vaqtinchalik parol qaytadi) |
| PATCH | /customers/:id/status `{status}` | staff, owner | bloklash / faollashtirish |
| POST | /customers/:id/reset-password | staff, owner | parolni tiklash |
| GET/POST | /staff, /staff/:id/status, /staff/:id/reset-password | owner | xodimlar |
| POST | /subscriptions `{code \| customer_id, plan_id, price?}` | staff, owner | abonement sotish |
| POST | /subscriptions/:id/cancel | owner | bekor qilish |
| POST | /visits/check-in `{qr}` yoki `{code}` | staff, owner | kirishni belgilash: QR (asosiy) yoki qo'lda kod (zaxira) |
| GET | /me/qr | customer | kirish QR kodi: 45 soniyalik imzolangan matn, telefon har ~30 soniyada yangilaydi |
| GET | /dashboard/admin | staff, owner | bosh panel ma'lumoti |
| GET | /reports?months=6 | owner | hisobot |
| GET/POST/PUT/DELETE | /expenses | owner | chiqimlar |
| GET | /me/dashboard | customer | mijoz bosh sahifasi |
| GET | /activity?limit=30 | staff, owner | voqealar lentasi (kirish, rad etilgan kirish, yangi mijoz, sotuv, holat). Narx faqat egaga |
| GET | /me/activity | customer | mijozning o'ziga tegishli voqealar |

## Kirishga ruxsat berilmasa (check-in)
`404` yoki `409`, `error.code = "CHECKIN_DENIED"`, `error.details = { reason, client }`.
reason: `not_found | blocked | expired | finished | already_today | qr_expired | qr_invalid`.

## Deploy
Render / Railway / Fly.io: Build `npm install && npx prisma migrate deploy`, Start `npm start`.
Productionda `NODE_ENV=production`, `CORS_ORIGINS=https://sizning-frontend.uz`.