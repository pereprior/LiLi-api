-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'SCHEDULED', 'IN_PROGRESS', 'PAUSED', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Task" (
    "uuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMPTZ(3),
    "startHasTime" BOOLEAN NOT NULL DEFAULT false,
    "endDate" TIMESTAMPTZ(3),
    "endHasTime" BOOLEAN NOT NULL DEFAULT false,
    "reminderDate" TIMESTAMPTZ(3),
    "reminderHasTime" BOOLEAN NOT NULL DEFAULT false,
    "parentUuid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "Task_userUuid_deletedAt_idx" ON "Task"("userUuid", "deletedAt");

-- CreateIndex
CREATE INDEX "Task_parentUuid_idx" ON "Task"("parentUuid");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentUuid_fkey" FOREIGN KEY ("parentUuid") REFERENCES "Task"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userUuid_fkey" FOREIGN KEY ("userUuid") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
