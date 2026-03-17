import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import * as vendorCreditController from "../controllers/vendor-credit.controller";

const router = Router();
router.use(authenticate);

router.get("/next-number", vendorCreditController.getNextNumber);
router.get("/", vendorCreditController.list);
router.get("/:id", vendorCreditController.getOne);
router.post("/", vendorCreditController.create);
router.patch("/:id", vendorCreditController.update);
router.post("/:id/apply", vendorCreditController.applyToBill);
router.post("/:id/unapply", vendorCreditController.unapplyFromBill);
router.post("/:id/void", vendorCreditController.voidVendorCredit);
router.delete("/:id", vendorCreditController.remove);

export default router;
