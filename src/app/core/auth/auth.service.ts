import { computed, inject, Injectable, Signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, catchError, map, Observable, switchMap, throwError } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

import { environment } from '@environments/environment';
import {
  AuthUser,
  LoginRequest,
  RegisterResponse,
  StoredSession,
  TokenResponse,
} from './auth.model';

const STORAGE_KEY_SESSION = 'bm_session';

function deriveUser(email: string): AuthUser {
  const localPart = email.split('@')[0];
  const name = localPart.charAt(0).toUpperCase() + localPart.slice(1);
  const initials = localPart.charAt(0).toUpperCase();
  return { email, name, initials };
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession): void {
  localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
}

function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY_SESSION);
}

/** Decode JWT payload and return exp timestamp (seconds). Returns 0 on error. */
function getTokenExp(token: string): number {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded.exp === 'number' ? decoded.exp : 0;
  } catch {
    return 0;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = getTokenExp(token);
  if (exp === 0) return true;
  return Date.now() / 1000 >= exp;
}

function mapHttpError(error: HttpErrorResponse): Observable<never> {
  if (error.status === 0) {
    return throwError(() => new Error('Servidor indisponível. Tente novamente.'));
  }

  if (error.status === 401) {
    return throwError(() => new Error('Email ou senha inválidos.'));
  }

  const detail: string = (error.error as { detail?: string })?.detail ?? '';
  if (error.status === 409 || detail.toLowerCase().includes('exists')) {
    return throwError(() => new Error('Já existe uma conta com este e-mail.'));
  }

  return throwError(() => new Error('Ocorreu um erro. Tente novamente.'));
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly authUrl = `${environment.apiUrl}/auth`;

  private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  readonly currentUser$ = this.currentUserSubject.asObservable();

  private readonly currentUserSignal: Signal<AuthUser | null | undefined> = toSignal(
    this.currentUser$,
  );

  readonly isAuthenticated = computed(() => this.currentUserSignal() != null);

  constructor() {
    const session = readSession();
    if (session) {
      if (isTokenExpired(session.token)) {
        clearSession();
      } else {
        this.currentUserSubject.next(deriveUser(session.email));
      }
    }
  }

  getToken(): string | null {
    const session = readSession();
    if (!session) return null;
    if (isTokenExpired(session.token)) {
      this.logout();
      return null;
    }
    return session.token;
  }

  /** Returns true if stored token exists and is not expired. */
  hasValidSession(): boolean {
    const session = readSession();
    if (!session) return false;
    return !isTokenExpired(session.token);
  }

  login(email: string, password: string): Observable<void> {
    const body: LoginRequest = { email, password };

    return this.http.post<TokenResponse>(`${this.authUrl}/token`, body).pipe(
      map((response) => {
        writeSession({ email, token: response.accessToken });
        this.currentUserSubject.next(deriveUser(email));
      }),
      catchError((error: HttpErrorResponse) => mapHttpError(error)),
    );
  }

  register(email: string, password: string): Observable<void> {
    return this.http
      .post<RegisterResponse>(`${this.authUrl}/register`, { email, password })
      .pipe(
        switchMap(() => this.login(email, password)),
        catchError((error: HttpErrorResponse) => mapHttpError(error)),
      );
  }

  logout(): void {
    clearSession();
    this.currentUserSubject.next(null);
  }
}
