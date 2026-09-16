import { Module } from '@nestjs/common';
import { GuestRegistrationController } from './guest-registration.controller';
import { GuestRegistrationService } from './guest-registration.service';
import { NotificationModule } from '../../common/notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [GuestRegistrationController],
  providers: [GuestRegistrationService],
})
export class GuestRegistrationModule {}
