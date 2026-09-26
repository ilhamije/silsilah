-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RelType" AS ENUM ('PARENT_CHILD', 'SPOUSE');

-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'EXTRACTED', 'REJECTED', 'BORDERLINE', 'FAILED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('OPEN', 'CONFIRMED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REVIEWING', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ScoreBand" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EditStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "deleteOriginalsAfterConfirm" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "FamilyTree" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hideLivingFromViewers" BOOLEAN NOT NULL DEFAULT true,
    "allowCrossFamilyMatch" BOOLEAN NOT NULL DEFAULT false,
    "structureVersion" INTEGER NOT NULL DEFAULT 0,
    "lastEditedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyTree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreeMember" (
    "treeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreeMember_pkey" PRIMARY KEY ("treeId","userId")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "email" TEXT,
    "tokenHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "singleUse" BOOLEAN NOT NULL DEFAULT true,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "givenName" TEXT,
    "familyName" TEXT,
    "nicknames" TEXT[],
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "birthDate" TEXT,
    "birthYear" INTEGER,
    "deathDate" TEXT,
    "deathYear" INTEGER,
    "birthPlace" TEXT,
    "notes" TEXT,
    "isLiving" BOOLEAN,
    "livingIsManual" BOOLEAN NOT NULL DEFAULT false,
    "sourceImageId" TEXT,
    "sourceBox" JSONB,
    "nameKey" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "type" "RelType" NOT NULL,
    "personAId" TEXT NOT NULL,
    "personBId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceImage" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "draftId" TEXT,
    "pageIndex" INTEGER NOT NULL DEFAULT 0,
    "blobPathname" TEXT,
    "status" "ImageStatus" NOT NULL DEFAULT 'UPLOADED',
    "extraction" JSONB,
    "model" TEXT,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportDraft" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'OPEN',
    "combined" JSONB,
    "edited" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RejectionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "reason" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MergeSuggestion" (
    "id" TEXT NOT NULL,
    "treeAId" TEXT NOT NULL,
    "treeBId" TEXT NOT NULL,
    "matchedPairs" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "band" "ScoreBand" NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "crossFamily" BOOLEAN NOT NULL DEFAULT false,
    "fingerprint" TEXT NOT NULL,
    "treeAVersion" INTEGER NOT NULL,
    "treeBVersion" INTEGER NOT NULL,
    "configSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,

    CONSTRAINT "MergeSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MergeOutcome" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "band" "ScoreBand" NOT NULL,
    "similarities" JSONB NOT NULL,
    "matchKinds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MergeOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonLink" (
    "id" TEXT NOT NULL,
    "treeAId" TEXT NOT NULL,
    "treeBId" TEXT NOT NULL,
    "personAId" TEXT NOT NULL,
    "personBId" TEXT NOT NULL,
    "suggestionId" TEXT,
    "operationId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "PersonLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MergeOperation" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT,
    "performedById" TEXT NOT NULL,
    "fieldChoices" JSONB NOT NULL,
    "before" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    "undoneById" TEXT,

    CONSTRAINT "MergeOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectionRequest" (
    "id" TEXT NOT NULL,
    "fromTreeId" TEXT NOT NULL,
    "toTreeId" TEXT NOT NULL,
    "mergeSuggestionId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "respondedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "ConnectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestedEdit" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "proposedChanges" JSONB NOT NULL,
    "submittedById" TEXT NOT NULL,
    "status" "EditStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "SuggestedEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "TreeMember_userId_idx" ON "TreeMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_treeId_idx" ON "Invitation"("treeId");

-- CreateIndex
CREATE INDEX "Person_treeId_deletedAt_idx" ON "Person"("treeId", "deletedAt");

-- CreateIndex
CREATE INDEX "Person_nameKey_idx" ON "Person"("nameKey");

-- CreateIndex
CREATE INDEX "Relationship_personBId_idx" ON "Relationship"("personBId");

-- CreateIndex
CREATE UNIQUE INDEX "Relationship_treeId_type_personAId_personBId_key" ON "Relationship"("treeId", "type", "personAId", "personBId");

-- CreateIndex
CREATE INDEX "SourceImage_treeId_idx" ON "SourceImage"("treeId");

-- CreateIndex
CREATE INDEX "MergeSuggestion_treeAId_treeBId_status_idx" ON "MergeSuggestion"("treeAId", "treeBId", "status");

-- CreateIndex
CREATE INDEX "PersonLink_personBId_idx" ON "PersonLink"("personBId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonLink_personAId_personBId_key" ON "PersonLink"("personAId", "personBId");

-- CreateIndex
CREATE INDEX "ConnectionRequest_toTreeId_status_idx" ON "ConnectionRequest"("toTreeId", "status");

-- CreateIndex
CREATE INDEX "SuggestedEdit_treeId_status_idx" ON "SuggestedEdit"("treeId", "status");

-- CreateIndex
CREATE INDEX "ActivityLog_treeId_createdAt_idx" ON "ActivityLog"("treeId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreeMember" ADD CONSTRAINT "TreeMember_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreeMember" ADD CONSTRAINT "TreeMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_sourceImageId_fkey" FOREIGN KEY ("sourceImageId") REFERENCES "SourceImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_personAId_fkey" FOREIGN KEY ("personAId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_personBId_fkey" FOREIGN KEY ("personBId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceImage" ADD CONSTRAINT "SourceImage_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceImage" ADD CONSTRAINT "SourceImage_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ImportDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportDraft" ADD CONSTRAINT "ImportDraft_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeSuggestion" ADD CONSTRAINT "MergeSuggestion_treeAId_fkey" FOREIGN KEY ("treeAId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeSuggestion" ADD CONSTRAINT "MergeSuggestion_treeBId_fkey" FOREIGN KEY ("treeBId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeOutcome" ADD CONSTRAINT "MergeOutcome_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "MergeSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLink" ADD CONSTRAINT "PersonLink_treeAId_fkey" FOREIGN KEY ("treeAId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLink" ADD CONSTRAINT "PersonLink_treeBId_fkey" FOREIGN KEY ("treeBId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLink" ADD CONSTRAINT "PersonLink_personAId_fkey" FOREIGN KEY ("personAId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLink" ADD CONSTRAINT "PersonLink_personBId_fkey" FOREIGN KEY ("personBId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLink" ADD CONSTRAINT "PersonLink_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "MergeSuggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLink" ADD CONSTRAINT "PersonLink_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "MergeOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeOperation" ADD CONSTRAINT "MergeOperation_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "MergeSuggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionRequest" ADD CONSTRAINT "ConnectionRequest_fromTreeId_fkey" FOREIGN KEY ("fromTreeId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionRequest" ADD CONSTRAINT "ConnectionRequest_toTreeId_fkey" FOREIGN KEY ("toTreeId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionRequest" ADD CONSTRAINT "ConnectionRequest_mergeSuggestionId_fkey" FOREIGN KEY ("mergeSuggestionId") REFERENCES "MergeSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestedEdit" ADD CONSTRAINT "SuggestedEdit_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestedEdit" ADD CONSTRAINT "SuggestedEdit_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestedEdit" ADD CONSTRAINT "SuggestedEdit_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
