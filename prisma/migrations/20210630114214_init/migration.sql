-- CreateTable
CREATE TABLE "Directory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR NOT NULL,
    "directoryId" UUID,
    "userId" UUID NOT NULL
);

-- CreateTable
CREATE TABLE "File" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR NOT NULL,
    "directoryId" UUID NOT NULL,
    "metadata" JSON NOT NULL DEFAULT E'{}',
    "userId" UUID NOT NULL,
    "telegramFileId" VARCHAR
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "telegramId" VARCHAR,
    "settings" JSON NOT NULL DEFAULT E'{}'
);

-- CreateIndex
CREATE UNIQUE INDEX "Directory.id_unique" ON "Directory"("id");

-- CreateIndex
CREATE UNIQUE INDEX "File.id_unique" ON "File"("id");

-- CreateIndex
CREATE UNIQUE INDEX "User.id_unique" ON "User"("id");

-- AddForeignKey
ALTER TABLE "Directory" ADD FOREIGN KEY ("directoryId") REFERENCES "Directory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Directory" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD FOREIGN KEY ("directoryId") REFERENCES "Directory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
