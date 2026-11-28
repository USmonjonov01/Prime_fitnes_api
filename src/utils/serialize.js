// API javobi frontend hozir kutayotgan maydon nomlari bilan qaytadi (full_name, phone_number, visit_used ...),
// shuning uchun frontendni ulashda nomlarni o'zgartirish shart emas.
const ROLE = { OWNER: "owner", STAFF: "staff", CUSTOMER: "customer" }
const STATUS = { ACTIVE: "active", INACTIVE: "inactive", FROZEN: "frozen", BLOCKED: "blocked" }

export const roleOut = (r) => ROLE[r]
export const statusOut = (s) => STATUS[s]

export const publicUser = (u) => ({
  id: u.id,
  full_name: u.fullName,
  phone_number: u.phone,
  role: ROLE[u.role],
  ...(u.code ? { code: u.code } : {}),
})

export const customerOut = (u) => ({
  ...publicUser(u),
  status: STATUS[u.status],
  phone_verified: Boolean(u.phoneVerifiedAt),
  created_at: u.createdAt,
})

// Narx faqat egaga ko'rinadi (frontend ham shunday qiladi, lekin haqiqiy yashirish serverda)
export const subscriptionOut = (s, { showPrice }) => ({
  id: s.id,
  plan_id: s.planId,
  start_date: s.startDate,
  end_date: s.endDate,
  visit_total: s.visitTotal,
  visit_used: s.visitUsed,
  status: s.status === "CANCELLED" ? "cancelled" : "active",
  created_at: s.createdAt,
  ...(showPrice ? { price: s.price } : {}),
})
