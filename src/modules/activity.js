import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db.js"
import { authenticate, staffOnly } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"
import { activityOut } from "../utils/activity.js"

const router = Router()
router.use(authenticate, staffOnly)

/* GET /activity?limit=30: oxirgi voqealar (hamma xodim va ega ko'radi). Frontend har 20 soniyada yangilaydi. */
router.get("/", validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }) }), async (req, res) => {
  const items = await prisma.activity.findMany({
    orderBy: { createdAt: "desc" },
    take: req.valid.query.limit,
    include: { customer: { select: { id: true, fullName: true, code: true } }, actor: { select: { fullName: true } } },
  })
  res.json(items.map((a) => activityOut(a, { showPrice: req.user.role === "OWNER", showActor: true })))
})

export default router
