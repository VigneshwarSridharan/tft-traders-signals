import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ScopesGuard } from './scopes.guard';

function buildContext(
  apiKeyScopes: string[] | undefined,
  requiredScopes: string[] | undefined,
): ExecutionContext {
  const request = { apiKeyScopes };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
    __requiredScopes: requiredScopes,
  } as unknown as ExecutionContext;
}

describe('ScopesGuard', () => {
  function buildGuard(requiredScopes: string[] | undefined): ScopesGuard {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredScopes),
    } as unknown as Reflector;
    return new ScopesGuard(reflector);
  }

  it('allows the request through when no scopes are required', () => {
    const guard = buildGuard(undefined);
    const context = buildContext([], undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows the request through when the key has all required scopes', () => {
    const guard = buildGuard(['send']);
    const context = buildContext(['send', 'read:messages'], ['send']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when a required scope is missing', () => {
    const guard = buildGuard(['send']);
    const context = buildContext(['read:messages'], ['send']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when the request has no scopes at all', () => {
    const guard = buildGuard(['send']);
    const context = buildContext(undefined, ['send']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('requires ALL scopes, not just one, when several are declared', () => {
    const guard = buildGuard(['send', 'read:messages']);
    const context = buildContext(['send'], ['send', 'read:messages']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
