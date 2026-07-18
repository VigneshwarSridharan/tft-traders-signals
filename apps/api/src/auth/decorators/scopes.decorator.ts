import { SetMetadata } from '@nestjs/common';
import type { ApiKeyScope } from '@tft/shared';

export const SCOPES_KEY = 'scopes';
export const RequireScopes = (
  ...scopes: ApiKeyScope[]
): MethodDecorator & ClassDecorator => SetMetadata(SCOPES_KEY, scopes);
