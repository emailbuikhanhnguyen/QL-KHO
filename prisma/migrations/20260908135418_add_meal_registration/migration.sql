-- CreateTable
CREATE TABLE "meal_registrations" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,
    "meal_date" DATE NOT NULL,
    "has_lunch" BOOLEAN NOT NULL DEFAULT true,
    "has_overtime_meal" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_registrations_meal_date_idx" ON "meal_registrations"("meal_date");

-- CreateIndex
CREATE INDEX "meal_registrations_department_id_idx" ON "meal_registrations"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_registrations_user_id_meal_date_key" ON "meal_registrations"("user_id", "meal_date");

-- AddForeignKey
ALTER TABLE "meal_registrations" ADD CONSTRAINT "meal_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_registrations" ADD CONSTRAINT "meal_registrations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
