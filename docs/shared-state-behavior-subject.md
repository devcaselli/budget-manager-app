# Padrão de Estado Compartilhado com BehaviorSubject

## Contexto

Quando um mesmo dado (ex: `Wallet`) é necessário em múltiplos componentes do app, chamar o endpoint repetidamente gera requisições HTTP desnecessárias. A solução é centralizar o estado no Service usando um `BehaviorSubject`, que emite o valor atual para qualquer novo subscriber sem nova chamada à API.

---

## Quando Usar

- Dados globais consumidos por múltiplos componentes (`Wallet`, `User`, `Preferences`)
- Estado que precisa ser atualizado reativamente após ações (ex: pagamento → atualiza saldo)
- Qualquer dado onde "carregar 1x, consumir N vezes" seja o comportamento desejado

---

## Por que `BehaviorSubject` e não `Subject`?

| | `Subject` | `BehaviorSubject` | `ReplaySubject(1)` |
|---|---|---|---|
| Emite para novos subscribers | ❌ Não | ✅ Sim (valor atual) | ✅ Sim (último valor) |
| Valor inicial | ❌ Não tem | ✅ Obrigatório | ❌ Não tem |
| `.getValue()` síncrono | ❌ | ✅ | ❌ |
| Caso de uso | Eventos pontuais | **Estado compartilhado** | Cache sem valor inicial |

---

## Estrutura do Service

```typescript
// wallet.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, tap, catchError, EMPTY } from 'rxjs';

export interface Wallet {
  id: string;
  balance: number;
  currency: string;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/wallet';

  // ✅ Subjects são SEMPRE privados — o service é o único dono do estado
  private readonly walletSubject = new BehaviorSubject<Wallet | null>(null);
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  // Exposição pública apenas como Observable (readonly, sem acesso ao .next())
  readonly wallet$ = this.walletSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  loadWallet(): void {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    this.http.get<Wallet>(this.apiUrl).pipe(
      tap(wallet => this.walletSubject.next(wallet)),
      catchError(err => {
        this.errorSubject.next('Erro ao carregar carteira');
        return EMPTY;
      }),
      tap({ complete: () => this.loadingSubject.next(false) })
    ).subscribe();
  }

  refreshWallet(): void {
    this.loadWallet();
  }

  // Atualização otimista — reflete a mudança localmente sem nova chamada HTTP
  updateBalanceLocally(newBalance: number): void {
    const current = this.walletSubject.getValue();
    if (current) {
      this.walletSubject.next({ ...current, balance: newBalance });
    }
  }
}
```

---

## Inicialização: Um único ponto de entrada

O dado deve ser carregado **uma vez** na inicialização do app. Nunca em cada componente.

```typescript
// app.component.ts
@Component({ selector: 'app-root', ... })
export class AppComponent implements OnInit {
  private readonly walletService = inject(WalletService);

  ngOnInit(): void {
    this.walletService.loadWallet(); // ← inicializa o Subject, alimenta todos
  }
}
```

> Alternativa: usar um **Route Resolver** ou **APP_INITIALIZER** se o dado for pré-requisito de rota.

---

## Consumo nos Componentes

Todos os componentes consomem o **mesmo stream** — zero chamadas HTTP extras.

```typescript
// header.component.ts
@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush, // ✅ sempre OnPush com async pipe
  template: `
    @if (wallet$ | async; as wallet) {
      <span>Saldo: {{ wallet.balance | currency:'BRL' }}</span>
    }
    @if (loading$ | async) {
      <app-spinner />
    }
  `
})
export class HeaderComponent {
  private readonly walletService = inject(WalletService);

  readonly wallet$ = this.walletService.wallet$;
  readonly loading$ = this.walletService.loading$;
}

// dashboard.component.ts — consome sem nova requisição
@Component({ ... })
export class DashboardComponent {
  private readonly walletService = inject(WalletService);
  readonly wallet$ = this.walletService.wallet$; // ← dado já no Subject
}
```

---

## Invalidação de Cache

Após ações que alteram o estado, recarregue o Subject através do service responsável pela ação.

```typescript
// payment.service.ts
@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly walletService = inject(WalletService);

  makePayment(payload: PaymentPayload): Observable<void> {
    return this.http.post<void>('/api/payment', payload).pipe(
      tap(() => this.walletService.refreshWallet()) // ← invalida e recarrega
    );
  }
}
```

---

## Regras do Padrão

| Regra | Razão |
|---|---|
| `Subject` é sempre `private` | Só o service muta o estado |
| Exposição via `.asObservable()` | Componentes não podem chamar `.next()` diretamente |
| `loadWallet()` chamado uma única vez | Evita múltiplas requisições paralelas |
| `ChangeDetectionStrategy.OnPush` nos consumers | Performance — Angular só verifica quando o stream emite |
| `async` pipe no template | Faz unsubscribe automático, evita memory leak |

---

## Evolução: Angular 17+ com Signals

Para projetos em Angular 17+, o `BehaviorSubject` pode ser substituído por `signal`:

```typescript
// Substitui BehaviorSubject
private readonly _wallet = signal<Wallet | null>(null);
readonly wallet = this._wallet.asReadonly();

// No método de carga
tap(wallet => this._wallet.set(wallet))

// No template — sem async pipe
{{ wallet()?.balance | currency:'BRL' }}
```

Signals eliminam a necessidade do `async` pipe e têm integração nativa com o change detection do Angular.

---

## Anti-patterns a Evitar

```typescript
// ❌ Subject público — qualquer componente pode mutar o estado
walletSubject = new BehaviorSubject<Wallet | null>(null);

// ❌ Chamar loadWallet() no ngOnInit de cada componente
ngOnInit() { this.walletService.loadWallet(); } // gera N chamadas HTTP

// ❌ Subscribe manual sem gerenciar o ciclo de vida
this.wallet$.subscribe(w => this.wallet = w); // memory leak

// ✅ Correto: async pipe ou takeUntilDestroyed()
readonly wallet$ = this.walletService.wallet$; // + async pipe no template
// ou
this.wallet$.pipe(takeUntilDestroyed()).subscribe(w => this.wallet = w);
```
