import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { list, getOne, create, update, remove, seed } from "../controllers/tds-tax.controller";

const router = Router();
router.use(authenticate);

router.get("/", list);
router.post("/", create);
router.post("/seed", seed);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

export default router;
