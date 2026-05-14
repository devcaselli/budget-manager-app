export interface AuthUser {
  readonly email: string;
  readonly name: string;
  readonly initials: string;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface RegisterRequest {
  readonly email: string;
  readonly password: string;
}

export interface TokenResponse {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresIn: number;
}

export interface RegisterResponse {
  readonly id: string;
  readonly email: string;
  readonly createdAt: string;
}

export interface StoredSession {
  readonly email: string;
  readonly token: string;
}
