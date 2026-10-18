CREATE TABLE "ExamDocument" (
 "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "fileName" TEXT NOT NULL,
 "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL, "content" BYTEA NOT NULL,
 "previewHtml" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ExamDocument_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ExamDocument_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ExamDocument_ownerId_createdAt_idx" ON "ExamDocument"("ownerId", "createdAt");
