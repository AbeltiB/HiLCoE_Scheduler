-- CreateTable
CREATE TABLE "access_logs" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "request_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_logs_at_idx" ON "access_logs"("at");

-- CreateIndex
CREATE INDEX "access_logs_actor_id_at_idx" ON "access_logs"("actor_id", "at");

-- CreateIndex
CREATE INDEX "access_logs_path_at_idx" ON "access_logs"("path", "at");

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
