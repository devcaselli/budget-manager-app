import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { apiErrorInterceptor } from '@core/interceptors/api-error.interceptor';
import { authInterceptor } from '@core/interceptors/auth.interceptor';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor, apiErrorInterceptor])),
    provideAnimationsAsync(),
    // Enabled by F-C6 (Sword & Shield plan doc, decision 3) — lets a routed,
    // standalone component receive a matching query/route param as a plain
    // `@Input()`, bound automatically by the router. F-C4's confirm-email-page
    // deliberately deferred this exact call to F-C6 (see that component's own
    // doc comment, now updated) rather than guessing at a router-wide config
    // change outside its scope. Global effect is opt-in per component: only
    // components that declare an `@Input()` matching a route/query param name
    // are affected; every other routed component (the vast majority of this
    // app) is unaffected because it declares no such inputs. Both of this
    // epic's "consume a token from the URL" screens (ConfirmEmailPage,
    // ResetPasswordPage) now use the same `token` input-binding mechanism
    // instead of one reading `ActivatedRoute.snapshot` and the other using
    // `@Input()` — avoids two different patterns for the same screen shape.
    provideRouter(routes, withComponentInputBinding()),
  ],
};
