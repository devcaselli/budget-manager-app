# Code Review — `fix/expense-pagination-visibility` (Frontend)

**Escopo:** `git diff main..HEAD` — 6 commits (`a15426c`..`b683e7c`), 7 arquivos, +243/-14.
**Revisor:** revisão independente, sem participação na implementação.
**Método:** leitura do diff no contexto real dos arquivos + **harness empírico próprio** de RxJS + **teste de mutação** (reintrodução do bug) + 10+ execuções da suíte em HEAD e em `main` (incluindo execução simultânea sob carga).

**Veredito:** **APROVADO com ressalvas.** O fix é correto, os testes **não são vácuos** (provado por mutação) e a alegação de flakiness pré-existente **se confirma** (provada contra `main`). Há **1 achado Maior** (loop infinito real que o cap NÃO cobre) e **3 irmãos do bug não cobertos no escopo**, análogos ao `findByCreditCardId` do backend.

---

## Resumo dos achados

| # | Severidade | Achado |
|---|---|---|
| 1 | **Maior** | Cap de segurança não protege contra backend que não avança `page` → loop infinito real (provado: 501 requisições) |
| 2 | **Maior** | 3 serviços irmãos com a mesma truncação, fora do escopo (`subscription`, `reserved-budget`, `credit-card`) |
| 3 | Menor | Waterfall sequencial: N páginas = N RTTs encadeados; sem paralelismo após a página 0 |
| 4 | Menor | `MAX_PAGES = 50` com `size=100` = teto rígido de 5.000 itens, com falha total (não degradação) |
| 5 | Menor | `Share[]` mutável escapa em API tipada como `ReadonlyMap` |
| 6 | Nit | `map((acc) => acc as readonly T[])` é operador supérfluo |
| 7 | Nit | Comentário de `MAX_PAGES` promete garantia que o código não entrega |

---

## Verificação dos 7 pontos solicitados

### 1. `fetchAllPages`/`expand` está correto? — **Correto, exceto um caso de loop**

Escrevi um harness próprio (`P1`–`P8`, `Q1`–`Q4`) e executei contra o helper real.

**Confirmado correto:**

- **Ordem preservada (P1):** com latências propositalmente invertidas (página 0 em 30ms, demais em 1ms), o resultado saiu `['p0a','p0b','p1a','p1b','p2a','p2b','p3a','p3b']` e as chamadas em `[0,1,2,3]`. Não é paralelo desordenado.
- **Serialização (P2):** `maxConcurrent === 1`. `expand` só dispara a página N+1 depois que a N chega — a ordem não é acidental, é estrutural.
- **Erro propaga (P7):** `err === boom` (identidade), chamadas `[0, 1]` — a cadeia para na falha, não engole nem continua.
- **Cap dispara (P4):** `totalPages=51` → erro após **1** requisição. O cap trip acontece *antes* da segunda chamada.
- **Limite exato (P3):** `totalPages=50` → 50 requisições, sem erro. Fronteira `>` (não `>=`) está coerente com a mensagem.
- **`totalPages` ausente/`undefined` (Q3):** degrada com segurança — 1 requisição, sem erro, retorna a página 0 (`NaN` em comparação numérica é sempre `false`).

**ACHADO 1 (Maior) — o cap NÃO impede o loop infinito que importa.**

O cap valida `response.totalPages`, mas a condição de parada depende de `response.page`, que vem **do servidor**. Se o backend responder sempre `page: 0` com `totalPages: 3` (paginação quebrada, cache mal configurado, proxy que descarta o query param), a recursão nunca avança:

```
nextPage = response.page + 1  // sempre 0 + 1 = 1
1 < 3 → busca de novo → responde page:0 de novo → ∞
```

Probe P5 mediu isso: **501 requisições** até meu próprio circuit breaker artificial cortar. `totalPages=3` jamais excede `MAX_PAGES=50`, então o cap nunca é consultado. O helper contava páginas *declaradas*, não *iterações executadas*.

Isso é exatamente a classe de falha que o cap dizia prevenir. O teste `'errors instead of looping when totalPages is inconsistently/absurdly high'` cobre só o caso trivial (`totalPages` absurdo), não o caso realista de `page` estagnado.

**Solução:** contar iterações, não confiar em campo do servidor:

```ts
let fetched = 0;
return fetchPage(0).pipe(
  expand((response) => {
    if (++fetched >= MAX_PAGES) {
      return throwError(() => new Error(`fetchAllPages: exceeded ${MAX_PAGES} pages`));
    }
    const nextPage = response.page + 1;
    return nextPage < response.totalPages ? fetchPage(nextPage) : EMPTY;
  }),
  ...
);
```

Alternativa complementar: rastrear o `page` esperado localmente em vez de ler `response.page`, ou assertar `response.page === expectedPage` e falhar na divergência.

---

### 2. `switchMap` protege contra troca rápida de wallet? — **Sim, verificado**

Não aceitei por inspeção. Probe P8 montou o pipe real (`Subject → switchMap → fetchAllPages`) e trocou a "wallet" no meio de um loop de 4 páginas:

```
calls:     ['A:0', 'A:1', 'A:2', 'B:0', 'B:1', 'B:2', 'B:3']
emissions: ['B=>B-0,B-1,B-2,B-3']
```

A wallet A parou em `A:2` — **a cadeia `expand` inteira foi cancelada**, não só a página em voo (A:3 nunca foi requisitada). Apenas B emitiu. Isso funciona porque `expand` não é um efeito colateral solto: é um operador dentro do Observable retornado pelo `switchMap`, então o unsubscribe do `switchMap` desmonta a cadeia recursiva inteira. Nenhuma resposta obsoleta chega ao `expensesSubject`.

**`LoadingCounter` também está correto (Q1):** o `finalize` dispara no cancelamento (não só na conclusão), e o estado final foi `isLoading: false` com sequência `[false, true, true, true, false]`. Não vaza contador em troca rápida — mérito do `finalize` estar *dentro* do `switchMap`, na posição certa.

---

### 3. T6 — "primeiro vence" está correto e completo? — **Sim, os 3 Maps verificados**

- **`paymentByExpenseId`** (`expense-page.ts:203-211`): correto. O guard `!map.has(...)` implementa "primeiro vence", preservando a semântica do `.find()` original. O guard `payment.expenseId &&` também é necessário — `expenseId` é `string | null` no modelo, e sem ele um `null` viraria chave do Map. Correto.
- **`bulletById`** (`:213-215`): usa `new Map(this.bullets().map(...))` — o padrão "último vence" que causou o bug no de payment. **Aqui é seguro**, porque a chave é `bullet.id` (identidade da própria entidade), então colisão implica IDs duplicados na mesma lista, o que não é um cenário real. Além disso o código substituído (`.find((c) => c.id === payment.bulletId)`) também assumia unicidade. Sem defeito, mas note que é seguro por *invariante do domínio*, não pela construção.
- **`activeExpenseSharesBySourceId`** (`:217-229`): **semântica correta e diferente de propósito.** Substitui um `.filter()` (que retorna N itens), não um `.find()` (que retorna 1). Acumular via `push` em `Map<sourceId, Share[]>` é o análogo correto — sobrescrever perderia shares. A ordem dentro de cada array segue a ordem de `shares()`, igual ao `.filter()` original. Os predicados (`sourceType === 'EXPENSE'`, `status === 'ACTIVE'`) foram preservados integralmente; o `sourceId === expense.id` virou a chave do Map. Equivalente.

**Melhoria adicional acidentalmente correta:** `payment?.bulletId ? ... : null` substituiu `payment ? ... : null`. Como `bulletId` é `string | null`, a versão antiga chamava `.find(c => c.id === null)` quando o payment não tinha bullet — desperdício de varredura completa. A nova evita isso. Bom.

**ACHADO 5 (Menor):** `activeExpenseSharesBySourceId` é tipado `ReadonlyMap<string, Share[]>` — o `ReadonlyMap` protege o Map, mas os arrays internos são mutáveis e vazam direto para `ExpenseListItem.activeShares` (declarado `readonly Share[]`). Um consumidor pode fazer `(item.activeShares as Share[]).push(...)` e corromper o cache do `computed`. Tipar como `ReadonlyMap<string, readonly Share[]>` e construir com um array local mutável resolve sem custo de runtime.

---

### 4. `PagedResponse<T>` bate com os DTOs reais? — **Sim, sem cast escondido**

Comparação estrutural direta:

| `PagedResponse<T>` | `PagedExpenseResponse` | `PagedPaymentResponse` |
|---|---|---|
| `readonly content: readonly T[]` | `readonly content: readonly Expense[]` | `readonly content: readonly Payment[]` |
| `readonly page: number` | `readonly page: number` | `readonly page: number` |
| `readonly totalPages: number` | `readonly totalPages: number` | `readonly totalPages: number` |
| — | `size`, `totalElements` (extras, OK) | `size`, `totalElements` (extras, OK) |

Compatibilidade estrutural genuína — os DTOs são supersets. **Nenhum `as any`, nenhum cast forçado, nenhum adapter** nos call-sites. `grep` por `as any` no diff: zero ocorrências. O único `as` do helper é o `as readonly T[]` do achado 6, que é widening trivial e não mascara incompatibilidade. `tsconfig` está com `strict: true` + `strictTemplates`, e o build de teste compila limpo.

---

### 5. Existe outro serviço com a mesma truncação? — **SIM, 3 irmãos não cobertos**

**ACHADO 2 (Maior).** Grep amplo por `.content` e `totalPages` em todo `src/app`. Este é o análogo direto do `findByCreditCardId` que o backend deixou passar.

| Arquivo | Linha | Situação |
|---|---|---|
| `subscription.service.ts` | 56 | **TRUNCA** — `findAll()` (page 0, size 100), ignora `totalPages` |
| `reserved-budget.service.ts` | 63 | **TRUNCA** — `findActiveAt()` sem paginação; backend pagina e o default do Spring é 20 |
| `credit-card.service.ts` | 63 | **TRUNCA** — `loadAll()` fixo em page 0, size 100 |
| `installment.service.ts` | 301 | **TRUNCA** — `loadCreditCards()` privado, page 0/size 100 (duplica o de cima) |
| `installment.service.ts` | 96 | OK — paginação real com UI de páginas (`paginationSubject`) |
| `installment-finished-dialog` | 123 | OK — paginação real, é modal com navegação |

O caso mais preocupante é **`reserved-budget.service.ts:63`**: `findActiveAt()` **não envia `page` nem `size`**, então herda o default do Spring (**20 itens**) — teto 5x menor que os outros. Uma wallet com mais de 20 reserved budgets no mês perde itens silenciosamente hoje.

`credit-card.service.ts` e `installment.service.ts:301` alimentam o dropdown de cartão da própria tela de Expenses. Se um usuário tiver >100 cartões o `creditCardNameById` fica incompleto e a label cai no fallback `?? creditCardId` (mostra UUID cru). Baixa probabilidade, mas é o mesmo defeito.

Não são regressões deste PR — são pré-existentes e fora do escopo declarado. Mas o helper para corrigi-los **já existe agora**, e a decisão explícita (corrigir agora vs. registrar como débito) deveria ser tomada, não silenciada. `tag`, `bullet` e `payer` retornam arrays não paginados — sem risco.

---

### 6. As 5 falhas "pré-existentes/flaky" — **alegação CONFIRMADA, mas o número é enganoso**

Não aceitei a alegação. Executei a suíte **10+ vezes** em ambos os branches.

| Execução | HEAD | `main` |
|---|---|---|
| Isoladas | 4 de 6 limpas (0 falhas); 2 com 9 e 13 falhas | 4 de 4 limpas (0 falhas) |
| **Simultâneas (sob carga)** | **10 falhas** | **12 falhas** |

Uma leitura ingênua ("main passa sempre, HEAD falha às vezes") acusaria o branch. O teste decisivo foi rodar **os dois branches ao mesmo tempo**, sob carga idêntica: `main` falhou **mais** que HEAD (12 vs 10). A instabilidade é **pré-existente e induzida por carga da máquina**, não pelo branch.

Causa: todas as falhas são `Test timed out in 5000ms` em specs de **componente/dialog** (`fakeAsync`/timers de dialog do Material sensíveis a scheduling sob CPU saturada). Os conjuntos que falham se sobrepõem fortemente entre os branches (`share-form`, `tag-page`, `tag-picker-dialog`, `share-page`, `interactive-share-dialog`).

**Nenhuma falha, em nenhuma execução, ocorreu em arquivo tocado por este PR:** `fetch-all-pages.spec.ts`, `expense.service.spec.ts`, `payment.service.spec.ts` e `expense-page.spec.ts` passaram em **100%** das execuções, em ambos os branches.

Ressalva: "5 falhas" não é um número estável — observei 0, 9, 10, 12 e 13. Registrar "5 falhas flaky" como baseline dá falsa precisão; o correto é "N falhas de timeout não determinísticas em specs de dialog, sensíveis a carga". **Isso merece débito técnico próprio** — uma suíte que falha 12 testes sob carga mascara regressões reais em CI.

**Contagem:** `main` = 54 arquivos/462 testes; HEAD = 55/469. **+7 testes**, coerente com T2 (5) + T5 (2).

---

### 7. Teste de mutação — os testes pegam o bug? (verificação extra)

O backend teve **testes vácuos que passavam com o bug presente**. Testei isso diretamente: reverti as duas correções (voltando para `findByWalletId(walletId, 0, 100)` + `response.content`) e rodei a suíte.

```
× should walk every page of a multi-page wallet and concatenate them into expenses$
× should walk every page of a multi-page wallet and concatenate them into payments$
```

**Ambos falharam.** Os testes são genuínos — matam a mutação. O `httpMock.expectOne('...?page=1&size=100')` só é satisfeito se a segunda página for de fato requisitada. Esta é a diferença qualitativa em relação ao que aconteceu no backend. Arquivos restaurados ao estado commitado após o experimento (`git status` limpo).

---

## Achados adicionais

**ACHADO 3 (Menor) — Waterfall sequencial.** Probe Q2 confirmou: 4 páginas = 4 RTTs encadeados (~80ms com 20ms/página). Com 5 páginas em rede móvel (300ms RTT) são ~1,5s só de latência serial, e `ExpenseService` + `PaymentService` rodam esse waterfall **em paralelo entre si**, dobrando a janela em que a tela fica em loading. `expand` é obrigatoriamente sequencial porque `totalPages` só é conhecido após a página 0. Otimização possível: ler `totalPages` da página 0 e disparar as páginas 1..N-1 com `forkJoin`/`mergeMap` (1 RTT em vez de N-1), reordenando por `page` no final — reduz para O(2) RTTs ao custo de N-1 conexões simultâneas. Não é bloqueante no volume atual; vale registrar.

**ACHADO 4 (Menor) — Teto rígido de 5.000 itens.** `MAX_PAGES=50` × `size=100`. Uma wallet legítima com 5.001 expenses **não trunca** (bom, é o bug antigo) mas **falha inteira** com erro genérico e `catchError` que só mostra "Não foi possível carregar as expenses." — o usuário não descobre que o motivo é volume. Trocar o modo de falha por "carregar até o cap + sinalizar truncação na UI" seria degradação graciosa. Alternativa mais simples: aumentar `size` para 500 (5 requisições em vez de 50 para 500 itens) — reduz RTTs e afasta o teto, se o backend aceitar.

**ACHADO 6 (Nit)** — `fetch-all-pages.ts:57`: `map((accumulated) => accumulated as readonly T[])` não faz nada em runtime; `T[]` já é atribuível a `readonly T[]`. Basta declarar o retorno do `reduce` ou remover o operador.

**ACHADO 7 (Nit)** — o comentário de `MAX_PAGES` afirma "Guards against an inconsistent/absurd `totalPages` ... turning this into an unbounded request loop". Após o ACHADO 1, essa frase promete mais do que o código entrega. Corrigir junto com o cap.

**Pontos positivos (merecem registro):**

- O helper está no lugar arquitetural certo (`core/state/`), genérico, sem dependência de feature — dependência aponta `features → core`, correta.
- Comentários explicam o **porquê** com o dado concreto do bug ("111-expense wallet silently lost its last 11"), não parafraseiam o código.
- O achado colateral do `PaymentService` (T4) foi um bom catch: a truncação de payments corrompia o status PAID/OPEN, um bug de *correção de dados* pior que o de visibilidade original.
- T6 não era estritamente necessário para o fix, mas é a consequência certa: remover o teto de 100 itens transforma o `.find()`/`.filter()` por expense em O(n·m) real. Para 1.000 expenses × 1.000 payments, de ~1.000.000 de comparações para ~2.000 operações.
- A auto-correção do "primeiro vence" no self-review foi um catch legítimo e sutil.

---

## Análise de complexidade

**Volume assumido:** wallet grande = 1.000 expenses, 1.000 payments, 200 shares, 50 bullets.

**Dados (`fetchAllPages`):** tempo O(n) em itens, O(p) requisições sequenciais (p = páginas). Espaço O(n) — acumulador único, sem cópias intermediárias (`push(...)` em vez de `[...acc, ...novo]`, que seria O(n²)). Boa escolha. Ressalva: `push(...response.content)` faz spread de até 100 elementos por chamada — seguro, mas se `size` subir para ~50.000 arriscaria estourar o limite de argumentos; um loop `for` seria imune.

**Render (`expenseItems`), antes:** para cada expense, `.find()` em payments (O(m)) + `.filter()` em shares (O(s)) + `.find()` em bullets → **O(n·(m+s))** ≈ 1.000 × 1.200 = **1.200.000 operações por recomputação**.

**Depois:** 3 Maps em O(m+s+b) uma vez, depois lookups O(1) por expense → **O(n+m+s+b)** ≈ **3.200 operações**. Ganho de ~375x no pior caso. Correção necessária, não otimização prematura: sem T6, corrigir a paginação teria *degradado* a performance da tela, já que o dataset deixou de ser limitado a 100.

**Granularidade dos `computed`:** os 3 Maps são `computed` separados, então mudar só `payments()` não reconstrói `bulletById` nem o Map de shares. Coerente com o padrão do `tagMap`. Observação: `creditCardNameById` (`:232`) ficou **dentro** de `expenseItems` — é reconstruído a cada recomputação, inclusive quando só `payments()` mudou. Inconsistente com os outros quatro; extrair para `computed` próprio fecharia o padrão (impacto pequeno: cartões são poucos).

**Bundle:** `expand`/`reduce` são operadores RxJS já presentes na árvore; impacto desprezível.

---

## Recomendação

1. **Antes do merge:** corrigir o ACHADO 1 (cap por iteração). É um loop infinito real, alcançável por defeito de backend, no exato mecanismo que dizia preveni-lo. Adicionar teste com backend que não avança `page`.
2. **Decisão explícita necessária (ACHADO 2):** os 3 serviços irmãos entram neste fluxo ou viram débito técnico? Recomendo **corrigir `reserved-budget.service.ts` agora** (teto de 20 itens, o mais provável de já estar quebrando em produção) e **registrar os demais como débito** — não bloqueiam esta feature e o helper já está pronto.
3. **Débito técnico próprio:** instabilidade da suíte sob carga (10-13 timeouts em specs de dialog). Mascara regressões em CI.
4. Achados 3-7 podem ser agrupados num follow-up de polimento.

O núcleo do fix está correto, bem testado e resistente a mutação. O problema não é o que foi feito — é o que ficou de fora.
