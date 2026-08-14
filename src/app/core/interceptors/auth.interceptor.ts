import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';

const PUBLIC_AUTH_PATHS = ['/auth/token', '/auth/register', '/auth/refresh'];

function withBearer<T>(req: HttpRequest<T>, token: string): HttpRequest<T> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isPublicAuthPath = PUBLIC_AUTH_PATHS.some((path) => req.url.includes(path));
  if (isPublicAuthPath) {
    return next(req);
  }

  const token = authService.getToken();
  if (!token) {
    router.navigate(['/login']);
    return throwError(() => new Error('Session expired.'));
  }

  return next(withBearer(req, token)).pipe(
    catchError((error) => {
      if (error?.status !== 401) {
        return throwError(() => error);
      }

      return authService.refreshAccessToken().pipe(
        switchMap((newToken) => next(withBearer(req, newToken))),
        catchError((refreshError) => {
          router.navigate(['/login']);
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
