import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

// Vi du dung: @Roles(Role.ADMIN, Role.WAREHOUSE_STAFF)
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
