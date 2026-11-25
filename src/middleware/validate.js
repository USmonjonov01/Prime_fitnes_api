import { ZodError } from "zod"

// validate({ body, query, params }) - zod sxemalari. Natija req.valid ga yoziladi.
// (Express 5 da req.query o'zgartirib bo'lmaydi, shuning uchun alohida req.valid.)
export const validate = (schemas) => (req, _res, next) => {
  try {
    req.valid = {}
    for (const part of ["params", "query", "body"]) {
      if (schemas[part]) req.valid[part] = schemas[part].parse(req[part] ?? {})
    }
    next()
  } catch (err) {
    next(err instanceof ZodError ? err : err)
  }
}
