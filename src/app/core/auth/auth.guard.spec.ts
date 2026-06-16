import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';

import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  let hasValidSession: ReturnType<typeof vi.fn>;
  let logout: ReturnType<typeof vi.fn>;
  let createUrlTree: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    hasValidSession = vi.fn();
    logout = vi.fn();
    createUrlTree = vi.fn().mockReturnValue({} as UrlTree);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { hasValidSession, logout } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });
  });

  function run(): boolean | UrlTree {
    return TestBed.runInInjectionContext(() => authGuard({} as never, {} as never)) as boolean | UrlTree;
  }

  it('allows activation when the session is valid', () => {
    hasValidSession.mockReturnValue(true);
    expect(run()).toBe(true);
    expect(logout).not.toHaveBeenCalled();
  });

  it('logs out and redirects to /login when the session is invalid', () => {
    hasValidSession.mockReturnValue(false);

    const result = run();

    expect(logout).toHaveBeenCalled();
    expect(createUrlTree).toHaveBeenCalledWith(['/login']);
    expect(result).not.toBe(true);
  });
});
