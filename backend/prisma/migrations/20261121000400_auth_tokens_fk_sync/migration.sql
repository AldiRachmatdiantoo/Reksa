-- Menyamakan FK auth_tokens.user_id dengan schema.prisma (ON UPDATE CASCADE, seperti
-- FK user_id lain). Migrasi 20261121000100 membuatnya tanpa ON UPDATE, sehingga
-- `prisma migrate diff` melaporkan drift.
ALTER TABLE "auth_tokens" DROP CONSTRAINT "auth_tokens_user_id_fkey";
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
