-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TaskReminder" (
    "uuid" TEXT NOT NULL,
    "taskUuid" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL,
    "leaseUntil" TIMESTAMPTZ(3),
    "claimToken" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "messageId" TEXT,
    "lastError" TEXT,

    CONSTRAINT "TaskReminder_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskReminder_taskUuid_key" ON "TaskReminder"("taskUuid");

-- CreateIndex
CREATE INDEX "TaskReminder_status_nextAttemptAt_idx" ON "TaskReminder"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_taskUuid_fkey" FOREIGN KEY ("taskUuid") REFERENCES "Task"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
