import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Organization from "../../models/organization.model";
import Account from "../../models/account.model";
import FixedAssetType from "../../models/fixed-asset-type.model";
import {
  seedTemplate,
  downloadSampleTemplate,
  downloadBlankTemplate,
  previewImport,
  executeImport,
} from "../../controllers/account.controller";
import * as XLSX from "xlsx";

let replSet: MongoMemoryReplSet;

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });

  await mongoose.connect(replSet.getUri(), {
    dbName: "integration-tests-account-import",
  });
});

after(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

function mockResponse() {
  const res: any = {};
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    if (res.resolve) res.resolve();
    return res;
  };
  res.send = (data: any) => {
    res.body = data;
    if (res.resolve) res.resolve();
    return res;
  };
  res.setHeader = (name: string, value: string) => {
    res.headers = res.headers || {};
    res.headers[name] = value;
    return res;
  };
  res.download = (path: string, filename: string) => {
    res.downloadPath = path;
    res.downloadFilename = filename;
    if (res.resolve) res.resolve();
    return res;
  };
  return res;
}

function runMiddleware(handler: any, req: any, res: any): Promise<void> {
  return new Promise((resolve, reject) => {
    res.resolve = resolve;
    handler(req, res, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

test("Chart of Accounts templates download", async () => {
  const reqSample: any = {
    query: { format: "csv" },
  };
  const resSample = mockResponse();
  await runMiddleware(downloadSampleTemplate, reqSample, resSample);
  assert.ok(resSample.downloadPath.includes("sample_chart_of_accounts.csv"));
  assert.equal(resSample.downloadFilename, "sample_chart_of_accounts.csv");

  const reqBlank: any = {
    query: { format: "csv" },
  };
  const resBlank = mockResponse();
  await runMiddleware(downloadBlankTemplate, reqBlank, resBlank);
  assert.ok(resBlank.downloadPath.includes("blank_chart_of_accounts.csv"));
  assert.equal(resBlank.downloadFilename, "blank_chart_of_accounts.csv");
});

test("previewImport parses CSV/Excel buffer and maps columns", async () => {
  const org = await Organization.create({ name: "Import Test Org" });
  
  // Seed Fixed Asset Type
  await FixedAssetType.create({
    organizationId: org._id,
    name: "Furniture",
    depreciationMethod: "Straight Line",
    depreciationFrequency: "Monthly",
    assetLifeValue: 60,
    assetLifeUnit: "Months",
    computationType: "Non Pro Rata",
    fixedAssetAccountId: new Types.ObjectId(),
    accumulatedDepreciationAccountId: new Types.ObjectId(),
    depreciationExpenseAccountId: new Types.ObjectId(),
  });

  // Create CSV buffer manually using XLSX
  const data = [
    { "Name": "Sub Bank", "Type": "Bank", "Parent": "Main Bank", "OB": "100" },
    { "Name": "Delivery Van", "Type": "Fixed Asset", "Parent": "", "OB": "25000", "FixedAsset": "Furniture" }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Accounts");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const mapping = {
    name: "Name",
    accountType: "Type",
    parentAccount: "Parent",
    openingBalance: "OB",
    createItemAsFixedAsset: "FixedAsset",
    fixedAssetType: "FixedAsset"
  };

  const req: any = {
    user: { activeOrganization: org._id },
    file: { buffer },
    body: {
      mapping: JSON.stringify(mapping),
      duplicateHandling: "skip"
    }
  };

  const res = mockResponse();
  
  // Create Main Bank first in DB so parent reference resolves
  await Account.create({
    organizationId: org._id,
    name: "Main Bank",
    rootType: "Asset",
    accountType: "Bank"
  });

  await runMiddleware(previewImport, req, res);
  
  assert.equal(res.body.success, true);
  const info = res.body.data;
  assert.equal(info.totalRows, 2);
  assert.equal(info.readyCount, 2);
  assert.equal(info.invalidCount, 0);

  const subBank = info.previewItems.find((item: any) => item.name === "Sub Bank");
  assert.ok(subBank);
  assert.equal(subBank.accountType, "Bank");
  assert.equal(subBank.openingBalance, 100);
  assert.equal(subBank.isValid, true);
  assert.equal(subBank.status, "Ready");
});

test("executeImport inserts new accounts, resolves parents in two passes, and adjusts OB adjustment account", async () => {
  const org = await Organization.create({ name: "Import Test Org" });
  
  // Seed the standard Opening Balance Adjustment account
  const obAdjAccount = await Account.create({
    organizationId: org._id,
    name: "Opening Balance Adjustments",
    rootType: "Liability",
    accountType: "Other Current Liability",
    openingBalance: 0,
    balance: 0,
  });

  // Create CSV buffer where Parent (Main Bank) is defined AFTER child (Sub Bank) in the sheet!
  // This verifies the two-pass parent resolution algorithm works correctly!
  const data = [
    { "Name": "Sub Bank", "Type": "Bank", "Parent": "Main Bank", "OB": "200" },
    { "Name": "Main Bank", "Type": "Bank", "Parent": "", "OB": "1000" }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Accounts");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const mapping = {
    name: "Name",
    accountType: "Type",
    parentAccount: "Parent",
    openingBalance: "OB"
  };

  const req: any = {
    user: { activeOrganization: org._id },
    file: { buffer },
    body: {
      mapping: JSON.stringify(mapping),
      duplicateHandling: "skip"
    }
  };

  const res = mockResponse();
  await runMiddleware(executeImport, req, res);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.successCount, 2);
  assert.equal(res.body.data.failCount, 0);

  // Assertions in Database
  const mainBank = await Account.findOne({ organizationId: org._id, name: "Main Bank" });
  assert.ok(mainBank);
  assert.equal(mainBank.openingBalance, 1000);
  assert.equal(mainBank.balance, 1000);
  assert.equal(mainBank.parentId, null);

  const subBank = await Account.findOne({ organizationId: org._id, name: "Sub Bank" });
  assert.ok(subBank);
  assert.equal(subBank.openingBalance, 200);
  assert.equal(subBank.balance, 200);
  // Verify two-pass resolved parentId
  assert.equal(String(subBank.parentId), String(mainBank._id));

  // Verify Opening Balance Adjustment account auto-sync
  // manualNetSum = 1000 + 200 = 1200. OB Adjustment should be -1200
  const updatedAdj = await Account.findById(obAdjAccount._id);
  assert.ok(updatedAdj);
  assert.equal(updatedAdj.openingBalance, -1200);
  assert.equal(updatedAdj.balance, -1200);
});

test("previewImport and executeImport duplicate checking, code range check, overwrite, and code preservation", async () => {
  const org = await Organization.create({ name: "Duplicate Test Org" });

  // 1. Create existing accounts in DB
  const accountA = await Account.create({
    organizationId: org._id,
    name: "Cash Account",
    code: "1005",
    rootType: "Asset",
    accountType: "Cash",
    openingBalance: 100,
    balance: 100,
  });

  const accountB = await Account.create({
    organizationId: org._id,
    name: "Bank Account",
    code: "1006",
    rootType: "Asset",
    accountType: "Bank",
    openingBalance: 200,
    balance: 200,
  });

  // 2. CSV rows to test preview with duplicateHandling = "skip"
  const dataSkip = [
    { "Name": "Cash Account", "Code": "1005", "Type": "Cash" },
    { "Name": "New Cash Account", "Code": "1005", "Type": "Cash" }
  ];
  const wsSkip = XLSX.utils.json_to_sheet(dataSkip);
  const wbSkip = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbSkip, wsSkip, "Accounts");
  const bufferSkip = XLSX.write(wbSkip, { type: "buffer", bookType: "xlsx" });

  const mapping = {
    name: "Name",
    code: "Code",
    accountType: "Type"
  };

  const reqSkip: any = {
    user: { activeOrganization: org._id },
    file: { buffer: bufferSkip },
    body: {
      mapping: JSON.stringify(mapping),
      duplicateHandling: "skip"
    }
  };

  const resSkip = mockResponse();
  await runMiddleware(previewImport, reqSkip, resSkip);

  assert.equal(resSkip.body.success, true);
  assert.equal(resSkip.body.data.skipCount, 2);
  assert.equal(resSkip.body.data.previewItems[0].status, "Skip");
  assert.equal(resSkip.body.data.previewItems[1].status, "Skip");

  // 3. CSV rows to test preview with duplicateHandling = "overwrite"
  const dataOverwrite = [
    { "Name": "Cash Account", "Code": "1005", "Type": "Cash", "Desc": "Updated Cash Description" },
    { "Name": "New Name For Bank", "Code": "1006", "Type": "Bank", "Desc": "Updated Bank Description" },
    { "Name": "Cash Account", "Code": "1006", "Type": "Cash" },
    { "Name": "Invalid Code Acc", "Code": "9999", "Type": "Bank" }
  ];
  const wsOverwrite = XLSX.utils.json_to_sheet(dataOverwrite);
  const wbOverwrite = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOverwrite, wsOverwrite, "Accounts");
  const bufferOverwrite = XLSX.write(wbOverwrite, { type: "buffer", bookType: "xlsx" });

  const reqOverwrite: any = {
    user: { activeOrganization: org._id },
    file: { buffer: bufferOverwrite },
    body: {
      mapping: JSON.stringify({ ...mapping, description: "Desc" }),
      duplicateHandling: "overwrite"
    }
  };

  const resOverwrite = mockResponse();
  await runMiddleware(previewImport, reqOverwrite, resOverwrite);

  assert.equal(resOverwrite.body.success, true);
  assert.equal(resOverwrite.body.data.overwriteCount, 2);
  assert.equal(resOverwrite.body.data.invalidCount, 2);
  assert.equal(resOverwrite.body.data.previewItems[0].status, "Overwrite");
  assert.equal(resOverwrite.body.data.previewItems[1].status, "Overwrite");
  assert.equal(resOverwrite.body.data.previewItems[2].status, "Error");
  assert.ok(resOverwrite.body.data.previewItems[2].error.includes("already exists"));
  assert.equal(resOverwrite.body.data.previewItems[3].status, "Error");
  assert.ok(resOverwrite.body.data.previewItems[3].error.includes("must be between"));

  // 4. Test executeImport with overwrite and code preservation
  const dataExec = [
    { "Name": "Cash Account", "Code": "", "Type": "Cash", "Desc": "Description preserves code" },
    { "Name": "New Name For Bank", "Code": "1006", "Type": "Bank", "Desc": "Name is updated" }
  ];
  const wsExec = XLSX.utils.json_to_sheet(dataExec);
  const wbExec = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbExec, wsExec, "Accounts");
  const bufferExec = XLSX.write(wbExec, { type: "buffer", bookType: "xlsx" });

  const reqExec: any = {
    user: { activeOrganization: org._id },
    file: { buffer: bufferExec },
    body: {
      mapping: JSON.stringify({ ...mapping, description: "Desc" }),
      duplicateHandling: "overwrite"
    }
  };

  const resExec = mockResponse();
  await runMiddleware(executeImport, reqExec, resExec);

  assert.equal(resExec.body.success, true);
  assert.equal(resExec.body.data.successCount, 2);
  assert.equal(resExec.body.data.failCount, 0);

  // Assertions in Database
  const updatedA = await Account.findById(accountA._id);
  assert.ok(updatedA);
  assert.equal(updatedA.name, "Cash Account");
  assert.equal(updatedA.code, "1005"); // Code preserved!
  assert.equal(updatedA.description, "Description preserves code");

  const updatedB = await Account.findById(accountB._id);
  assert.ok(updatedB);
  assert.equal(updatedB.name, "New Name For Bank"); // Name updated!
  assert.equal(updatedB.code, "1006");
  assert.equal(updatedB.description, "Name is updated");

  // 5. Test executeImport with duplicateHandling="skip" but selective override on row 2
  await Account.updateOne({ _id: accountA._id }, { $set: { description: "Before Override A" } });
  await Account.updateOne({ _id: accountB._id }, { $set: { description: "Before Override B" } });
  
  const reqExecSelective: any = {
    user: { activeOrganization: org._id },
    file: { buffer: bufferExec },
    body: {
      mapping: JSON.stringify({ ...mapping, description: "Desc" }),
      duplicateHandling: "skip",
      overrides: JSON.stringify([2]) // Row 2 corresponds to "Cash Account" row
    }
  };

  const resExecSelective = mockResponse();
  await runMiddleware(executeImport, reqExecSelective, resExecSelective);

  assert.equal(resExecSelective.body.success, true);
  assert.equal(resExecSelective.body.data.successCount, 2);
  
  const finalA = await Account.findById(accountA._id);
  assert.ok(finalA);
  assert.equal(finalA.description, "Description preserves code"); // Overwritten!
  
  const finalB = await Account.findById(accountB._id);
  assert.ok(finalB);
  assert.equal(finalB.description, "Before Override B"); // Skipped!
});
