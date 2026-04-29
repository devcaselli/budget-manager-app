export interface Bullet {
  readonly id: string;
  readonly description: string;
  readonly budget: number;
  readonly remaining: number;
  readonly walletId: string;
}

export interface CreateBulletRequest {
  readonly description: string;
  readonly budget: number;
  readonly walletId: string;
}
