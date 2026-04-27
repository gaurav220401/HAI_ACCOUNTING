import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  list,
  getOne,
  create,
  update,
  remove,
  convertToInvoice,
  instantInvoice,
  sendEmail,
  downloadPdf,
  updateShipment,
  markShipmentFulfilled,
  dropship,
  cancelItems,
  voidOrder,
  cloneOrder,
  convertToPurchaseOrder,
} from "../controllers/sales-order.controller";

const router = Router();
router.use(authenticate);

router.get("/", list);
router.post("/", create);
router.post("/:id/convert-to-invoice", convertToInvoice);
router.post("/:id/instant-invoice", instantInvoice);
router.post("/:id/convert-to-purchase-order", convertToPurchaseOrder);
router.post("/:id/send-email", sendEmail);
router.get("/:id/pdf", downloadPdf);
router.post("/:id/update-shipment", updateShipment);
router.post("/:id/mark-shipment-fulfilled", markShipmentFulfilled);
router.post("/:id/dropship", dropship);
router.post("/:id/cancel-items", cancelItems);
router.post("/:id/void", voidOrder);
router.post("/:id/clone", cloneOrder);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

export default router;
