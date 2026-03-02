import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { list, getOne, create, update, remove } from "../controllers/sales-order.controller";

const router = Router();
router.use(authenticate);

router.get("/", list);
router.post("/", create);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

export default router;
