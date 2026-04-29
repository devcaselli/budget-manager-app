import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@environments/environment';

import { CreateWalletRequest, Wallet } from '../models/wallet';

@Injectable({
  providedIn: 'root',
})
export class WalletService {
  private readonly http = inject(HttpClient);
  private readonly walletsUrl = `${environment.apiUrl}/wallets`;

  findAll(): Observable<Wallet[]> {
    return this.http.get<Wallet[]>(this.walletsUrl);
  }

  findById(id: string): Observable<Wallet> {
    return this.http.get<Wallet>(`${this.walletsUrl}/${id}`);
  }

  create(input: CreateWalletRequest): Observable<Wallet> {
    return this.http.post<Wallet>(this.walletsUrl, input);
  }
}
