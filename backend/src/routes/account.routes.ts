import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { list, listForItem, create, update, remove, seedTemplate } from "../controllers/account.controller";

const router = Router();
router.use(authenticate);

router.get("/", list);
router.get("/for-item", listForItem);   // must be before /:id
router.post("/", create);
router.post("/seed-template", seedTemplate);
router.patch("/:id", update);
router.delete("/:id", remove);

export default router;
