-- AlterTable
ALTER TABLE "Report" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "Report" ADD COLUMN "reviewerUserId" TEXT;
ALTER TABLE "Report" ADD COLUMN "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "Report_reviewerUserId_idx" ON "Report"("reviewerUserId");
