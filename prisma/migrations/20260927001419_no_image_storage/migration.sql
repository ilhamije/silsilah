-- CreateEnum
CREATE TYPE "ExtractionOutcome" AS ENUM ('OK', 'REJECTED', 'BORDERLINE', 'FAILED');

-- DropForeignKey
ALTER TABLE "ImportDraft" DROP CONSTRAINT "ImportDraft_treeId_fkey";

-- DropForeignKey
ALTER TABLE "Person" DROP CONSTRAINT "Person_sourceImageId_fkey";

-- DropForeignKey
ALTER TABLE "SourceImage" DROP CONSTRAINT "SourceImage_draftId_fkey";

-- DropForeignKey
ALTER TABLE "SourceImage" DROP CONSTRAINT "SourceImage_treeId_fkey";

-- AlterTable
ALTER TABLE "Person" DROP COLUMN "sourceImageId",
ADD COLUMN     "sourcePageId" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "deleteOriginalsAfterConfirm";

-- DropTable
DROP TABLE "ImportDraft";

-- DropTable
DROP TABLE "RejectionLog";

-- DropTable
DROP TABLE "SourceImage";

-- DropEnum
DROP TYPE "DraftStatus";

-- DropEnum
DROP TYPE "ImageStatus";

-- CreateTable
CREATE TABLE "SourcePage" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL DEFAULT 0,
    "extraction" JSONB NOT NULL,
    "model" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "treeId" TEXT,
    "outcome" "ExtractionOutcome" NOT NULL,
    "reason" TEXT,
    "confidence" DOUBLE PRECISION,
    "language" TEXT,
    "peopleCount" INTEGER,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourcePage_treeId_idx" ON "SourcePage"("treeId");

-- CreateIndex
CREATE INDEX "ExtractionLog_userId_createdAt_idx" ON "ExtractionLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionLog_outcome_createdAt_idx" ON "ExtractionLog"("outcome", "createdAt");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "SourcePage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePage" ADD CONSTRAINT "SourcePage_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionLog" ADD CONSTRAINT "ExtractionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionLog" ADD CONSTRAINT "ExtractionLog_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "FamilyTree"("id") ON DELETE SET NULL ON UPDATE CASCADE;

