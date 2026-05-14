import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';

const PUBLIC_AUTH_PATHS = ['/auth/token', '/auth/register'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isPublicAuthPath = PUBLIC_AUTH_PATHS.some((path) => req.url.includes(path));
  if (isPublicAuthPath) {
    return next(req);
  }

  const token = authService.getToken();
  if (!token) {
    // getToken() already called logout() if token was expired
    router.navigate(['/login']);
    return throwError(() => new Error('Sessão expirada.'));
  }

  const authedReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });

  return next(authedReq).pipe(
    catchError((error) => {
      if (error?.status === 401) {
        authService.logout();
        router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};
