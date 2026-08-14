import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AuthService } from '@core/auth/auth.service';
import { AuthShellComponent } from '@core/auth/layout/auth-shell.component';

import { routes } from './app.routes';

const STORAGE_KEY = 'bm_session';

/** Minimal in-memory localStorage — the test env does not provide one (matches auth.service.spec.ts). */
function installLocalStorageStub(): void {
  const store = new Map<string, string>();
  const stub: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
  };
  vi.stubGlobal('localStorage', stub);
}

/** Build a JWT-shaped token whose payload carries the given exp (seconds). */
function makeToken(expSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: expSeconds })).replace(/=+$/, '');
  return `header.${payload}.signature`;
}

function seedValidSession(): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      email: 'jane@mail.com',
      token: makeToken(Date.now() / 1000 + 3600),
      refreshToken: 'refresh-1',
    }),
  );
}

function configureRealRoutes(): void {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
  });
}

/**
 * Regression coverage for the CRITICAL review finding: two sibling routes both
 * claimed `path: ''` (the new AuthShellComponent route and the pre-existing
 * ShellComponent route), and the auth-shell's lack of `pathMatch: 'full'` made
 * it win the sibling-match race on the bare root `/`, rendering a blank outlet
 * with no redirect. Every prior spec in this area used an isolated stub route
 * config via `provideRouter([...])`, which could not have caught this — this
 * suite imports the REAL `routes` array from `app.routes.ts` as its subject.
 */
describe('app routes (real routes array) — root URL resolution', () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects an authenticated user landing on `/` to `/dashboard`, not a blank outlet', async () => {
    seedValidSession();
    configureRealRoutes();

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');

    const router = TestBed.inject(Router);
    expect(router.url).toBe('/dashboard');
  });

  it('bounces an unauthenticated user landing on `/` to `/login` via the existing authGuard', async () => {
    configureRealRoutes();

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');

    const router = TestBed.inject(Router);
    expect(router.url).toBe('/login');
  });

  it('still renders `/login` through AuthShellComponent, unchanged by the root-URL fix', async () => {
    configureRealRoutes();

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/login', AuthShellComponent);
    harness.detectChanges();

    const router = TestBed.inject(Router);
    expect(router.url).toBe('/login');
    expect(harness.routeNativeElement?.querySelector('.ew-auth-form-side')).toBeTruthy();
  });

  it('exposes an AuthService instance reflecting the seeded session (sanity check on test setup)', () => {
    seedValidSession();
    configureRealRoutes();

    const authService = TestBed.inject(AuthService);
    expect(authService.isAuthenticated()).toBe(true);
  });
});
