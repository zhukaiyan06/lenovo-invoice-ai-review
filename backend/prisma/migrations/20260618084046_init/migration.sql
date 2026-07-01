-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "region" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerUserId" TEXT NOT NULL,
    "invoiceFileId" TEXT,
    "status" TEXT NOT NULL DEFAULT '待 L2 确认',
    "aiLabel" TEXT NOT NULL DEFAULT '未打标',
    "anomalyCodes" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "submittedAt" DATETIME,
    CONSTRAINT "Report_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Report_invoiceFileId_fkey" FOREIGN KEY ("invoiceFileId") REFERENCES "UploadedFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportFields" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "invoiceDate" TEXT,
    "shipmentDate" TEXT,
    "buyerName" TEXT,
    "buyerCreditCode" TEXT,
    "sellerName" TEXT,
    "sellerCreditCode" TEXT,
    "province" TEXT,
    "prefectureCity" TEXT,
    "city" TEXT,
    "totalTaxIncludedAmount" TEXT,
    "totalAmount" TEXT,
    "totalTaxAmount" TEXT,
    "remarks" TEXT,
    CONSTRAINT "ReportFields_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "invoiceItemName" TEXT,
    "invoiceSpecModel" TEXT,
    "productSpecificModel" TEXT,
    "unit" TEXT,
    "purchaseQuantity" TEXT,
    "lineAmount" TEXT,
    "lineTaxAmount" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ReportItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OcrResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "rawJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OcrResult_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "fieldName" TEXT,
    "beforeValue" TEXT,
    "afterValue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportLog_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Report_ownerUserId_idx" ON "Report"("ownerUserId");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReportFields_reportId_key" ON "ReportFields"("reportId");

-- CreateIndex
CREATE INDEX "ReportItem_reportId_idx" ON "ReportItem"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "OcrResult_reportId_key" ON "OcrResult"("reportId");

-- CreateIndex
CREATE INDEX "ReportLog_reportId_idx" ON "ReportLog"("reportId");

-- CreateIndex
CREATE INDEX "ReportLog_operatorId_idx" ON "ReportLog"("operatorId");
