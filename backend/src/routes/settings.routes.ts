import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  taxCRUD, seedTaxes,
  paymentTermsCRUD, seedPaymentTerms, setDefaultPaymentTerm, unsetDefaultPaymentTerm,
  warehouseCRUD,
  salesPersonCRUD,
  paymentModeCRUD, seedPaymentModes,
  expenseCategoryCRUD, seedExpenseCategories,
  reportingTagCRUD,
  priceListCRUD,
  resetOrganizationData,
} from "../controllers/settings.controller";

const router = Router();
router.use(authenticate);

// ── Reset Organization ──
router.post("/reset-organization", resetOrganizationData);

// ── Taxes ──
router.get("/taxes", taxCRUD.list);
router.post("/taxes", taxCRUD.create);
router.post("/taxes/seed", seedTaxes);
router.get("/taxes/:id", taxCRUD.getOne);
router.patch("/taxes/:id", taxCRUD.update);
router.delete("/taxes/:id", taxCRUD.remove);

// ── Payment Terms ──
router.get("/payment-terms", paymentTermsCRUD.list);
router.post("/payment-terms", paymentTermsCRUD.create);
router.post("/payment-terms/seed", seedPaymentTerms);
router.get("/payment-terms/:id", paymentTermsCRUD.getOne);
router.patch("/payment-terms/:id", paymentTermsCRUD.update);
router.delete("/payment-terms/:id", paymentTermsCRUD.remove);
router.post("/payment-terms/:id/set-default", setDefaultPaymentTerm);
router.post("/payment-terms/unset-default", unsetDefaultPaymentTerm);

// ── Warehouses ──
router.get("/warehouses", warehouseCRUD.list);
router.post("/warehouses", warehouseCRUD.create);
router.get("/warehouses/:id", warehouseCRUD.getOne);
router.patch("/warehouses/:id", warehouseCRUD.update);
router.delete("/warehouses/:id", warehouseCRUD.remove);

// ── Sales Persons ──
router.get("/sales-persons", salesPersonCRUD.list);
router.post("/sales-persons", salesPersonCRUD.create);
router.get("/sales-persons/:id", salesPersonCRUD.getOne);
router.patch("/sales-persons/:id", salesPersonCRUD.update);
router.delete("/sales-persons/:id", salesPersonCRUD.remove);

// ── Payment Modes ──
router.get("/payment-modes", paymentModeCRUD.list);
router.post("/payment-modes", paymentModeCRUD.create);
router.post("/payment-modes/seed", seedPaymentModes);
router.get("/payment-modes/:id", paymentModeCRUD.getOne);
router.patch("/payment-modes/:id", paymentModeCRUD.update);
router.delete("/payment-modes/:id", paymentModeCRUD.remove);

// ── Expense Categories ──
router.get("/expense-categories", expenseCategoryCRUD.list);
router.post("/expense-categories", expenseCategoryCRUD.create);
router.post("/expense-categories/seed", seedExpenseCategories);
router.get("/expense-categories/:id", expenseCategoryCRUD.getOne);
router.patch("/expense-categories/:id", expenseCategoryCRUD.update);
router.delete("/expense-categories/:id", expenseCategoryCRUD.remove);

// ── Reporting Tags ──
router.get("/reporting-tags", reportingTagCRUD.list);
router.post("/reporting-tags", reportingTagCRUD.create);
router.get("/reporting-tags/:id", reportingTagCRUD.getOne);
router.patch("/reporting-tags/:id", reportingTagCRUD.update);
router.delete("/reporting-tags/:id", reportingTagCRUD.remove);

// ── Price Lists ──
router.get("/price-lists", priceListCRUD.list);
router.post("/price-lists", priceListCRUD.create);
router.get("/price-lists/:id", priceListCRUD.getOne);
router.patch("/price-lists/:id", priceListCRUD.update);
router.delete("/price-lists/:id", priceListCRUD.remove);

export default router;
