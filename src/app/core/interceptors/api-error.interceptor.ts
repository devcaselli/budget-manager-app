import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';

export const apiErrorInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    retry({
      count: 1,
      delay: (error) =>
        error instanceof HttpErrorResponse && error.status === 0
          ? timer(250)
          : throwError(() => error),
    }),
  );
