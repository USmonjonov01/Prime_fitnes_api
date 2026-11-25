// "+998 90 123-45-67", "901234567", "998901234567" -> "+998901234567". Noto'g'ri bo'lsa null.
export const normalizePhone = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "")
  const nine = digits.length === 9 ? digits : digits.length === 12 && digits.startsWith("998") ? digits.slice(3) : null
  return nine ? `+998${nine}` : null
}
export const looksLikePhone = (value) => String(value ?? "").replace(/\D/g, "").length >= 9
