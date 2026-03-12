import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  list,
  getOne,
  create,
  update,
  remove,
  getNextNumber,
  convertToOpen,
  markAsDelivered,
  markAsReturned,
} from "../controllers/delivery-challan.controller";

const router = Router();
router.use(authenticate);

router.get("/next-number", getNextNumber);
router.get("/", list);
router.post("/", create);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

router.post("/:id/convert-to-open", convertToOpen);
router.post("/:id/mark-delivered", markAsDelivered);
router.post("/:id/mark-returned", markAsReturned);

export default router;
