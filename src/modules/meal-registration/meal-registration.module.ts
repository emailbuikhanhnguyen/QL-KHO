import { Module } from '@nestjs/common';
import { MealRegistrationController } from './meal-registration.controller';
import { MealRegistrationService } from './meal-registration.service';

@Module({
  controllers: [MealRegistrationController],
  providers: [MealRegistrationService],
})
export class MealRegistrationModule {}
