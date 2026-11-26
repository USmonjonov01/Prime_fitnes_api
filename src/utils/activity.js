import { prisma } from "../db.js"

// Voqeani yozadi. Asosiy amal (kirish, sotuv va h.k.) allaqachon bajarilgan bo'ladi, shuning uchun
// jurnal yozilmasa ham foydalanuvchiga xato qaytarilmaydi: faqat serverga yoziladi.
export async function logActivity({ type, actorId = null, customerId = null, data = {} }) {
  try {
    await prisma.activity.create({ data: { type, actorId, customerId, data } })
  } catch (err) {
    console.error("[activity]", type, err?.message ?? err)
  }
}

const clientOf = (c) => (c ? { id: c.id, full_name: c.fullName, code: c.code } : null)

// Narx faqat egaga ko'rinadi: xodimga yuboriladigan voqeadan olib tashlanadi
export const activityOut = (a, { showPrice, showActor }) => {
  const { price, ...rest } = a.data && typeof a.data === "object" && !Array.isArray(a.data) ? a.data : {}
  return {
    id: a.id,
    type: a.type,
    at: a.createdAt,
    client: clientOf(a.customer),
    ...(showActor ? { by: a.actor?.fullName ?? null } : {}),
    data: showPrice && price !== undefined ? { ...rest, price } : rest,
  }
}
