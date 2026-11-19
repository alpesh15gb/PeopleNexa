ALTER TABLE "Shift" ADD COLUMN "weeklyOffDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

UPDATE "Shift" SET "weeklyOffDays" = ARRAY[0] WHERE "sundayWeeklyOff" = true;
