-- CreateTable
CREATE TABLE "ExportLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "filtersJson" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "fileName" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExportLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExportLog_operatorId_idx" ON "ExportLog"("operatorId");
