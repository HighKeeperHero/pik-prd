/*
  Warnings:

  - A unique constraint covering the columns `[hero_name]` on the table `root_identities` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "root_identities_hero_name_key" ON "root_identities"("hero_name");
