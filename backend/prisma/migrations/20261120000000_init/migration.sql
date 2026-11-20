-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'EDUCATOR', 'INSTITUTION_ADMIN');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('INITIAL_BLURTING', 'SPACED_REVIEW');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('FOCUS_ACTIVE', 'AWAITING_JOL', 'AWAITING_SCAN', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "institutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "tier" "Tier" NOT NULL DEFAULT 'FREE',
    "institution_id" UUID,
    "daily_scan_count" INTEGER NOT NULL DEFAULT 0,
    "last_scan_reset_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "family_id" UUID NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID,
    "educator_id" UUID NOT NULL,
    "class_code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "uploader_id" UUID NOT NULL,
    "class_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "storage_key" TEXT,
    "extracted_rubric_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "class_id" UUID,
    "session_type" "SessionType" NOT NULL,
    "planned_duration_sec" INTEGER NOT NULL,
    "actual_duration_sec" INTEGER,
    "predicted_jol_score" INTEGER,
    "status" "SessionStatus" NOT NULL DEFAULT 'FOCUS_ACTIVE',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "image_storage_key" TEXT NOT NULL,
    "predicted_jol_score" INTEGER NOT NULL,
    "actual_ai_score" INTEGER NOT NULL,
    "accurate_concepts_json" JSONB NOT NULL,
    "blind_spots_json" JSONB NOT NULL,
    "logic_corrections_json" JSONB NOT NULL,
    "ledger_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "essay_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spaced_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "origin_submission_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "target_blind_spots_json" JSONB NOT NULL,
    "interval_day" INTEGER NOT NULL,
    "next_review_at" TIMESTAMPTZ(6) NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "spaced_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_family" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_refresh_tokens_hash" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_classes_educator" ON "classes"("educator_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_classes_code" ON "classes"("class_code");

-- CreateIndex
CREATE INDEX "idx_class_members_student" ON "class_members"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_class_members_class_student" ON "class_members"("class_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_materials_content_hash" ON "study_materials"("content_hash");

-- CreateIndex
CREATE INDEX "idx_materials_uploader_created" ON "study_materials"("uploader_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_sessions_user_started" ON "study_sessions"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "idx_submissions_user_created" ON "essay_submissions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "idx_submissions_session" ON "essay_submissions"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_spaced_origin_interval" ON "spaced_schedules"("origin_submission_id", "interval_day");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_educator_id_fkey" FOREIGN KEY ("educator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "study_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_submissions" ADD CONSTRAINT "essay_submissions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_submissions" ADD CONSTRAINT "essay_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaced_schedules" ADD CONSTRAINT "spaced_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaced_schedules" ADD CONSTRAINT "spaced_schedules_origin_submission_id_fkey" FOREIGN KEY ("origin_submission_id") REFERENCES "essay_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaced_schedules" ADD CONSTRAINT "spaced_schedules_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "study_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

