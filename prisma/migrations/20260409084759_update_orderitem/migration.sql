-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "manufacturer" DROP NOT NULL,
ALTER COLUMN "medicineName" DROP NOT NULL,
ALTER COLUMN "medicineSlug" DROP NOT NULL;
