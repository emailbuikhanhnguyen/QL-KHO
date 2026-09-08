import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class RegisterMealDto {
  @IsDateString()
  mealDate: string;

  @IsOptional()
  @IsBoolean()
  hasLunch?: boolean;

  @IsOptional()
  @IsBoolean()
  hasOvertimeMeal?: boolean;
}
