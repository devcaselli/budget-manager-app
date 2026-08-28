# Code Review — F-06 + F-07: Expense Edit no Omega Viewer

**Escopo:** `git diff 951027f..HEAD` (commits `40133c2` F-06, `a6386cf` F-07)
**Revisor:** angular-arch (revisão independente, sem contexto de implementação)
**Suite:** `npm test -- --watch=false` → **61 arquivos / 550 testes, 100% passando, exit 0**
**Data:** 2026-08-06

---

## Contexto

Esta é a **primeira feature de escrita** através do Omega Viewer — até aqui ele era estritamente leitura. O dado editado é financeiro real (`cost`, e por consequência `remaining`), então o padrão de rigor aplicado é o mesmo já usado nos bugs de dinheiro deste projeto: qualquer caminho onde o frontend possa exibir um número que não veio do backend é defeito, não melhoria.

A arquitetura entregue é, no geral, **sólida**: `savedOverride` chaveado por ref é a decisão certa, o smart/dumb split entre shell e `ViewerEditFormComponent` está correto, o patch mínimo respeita a semântica "ausente = não mexe" do backend, e `remaining` de fato nunca é computado no frontend. Os problemas estão nas bordas — e duas dessas bordas causam perda de dado silenciosa.

---

## Achados por severidade

### CRITICAL

---

#### C1 — ESC e clique no backdrop escapam do `guardDirty()`: perda de dado silenciosa quando o form está sujo mas ainda não emitiu `dirtyChange`

**Ponto:** `omega-viewer.component.ts:239-241` (effect do `disableClose`) + ausência de qualquer subscribe em `dialogRef.keydownEvents()` / `dialogRef.backdropClick()`.

O `disableClose` é a **única** proteção contra ESC e backdrop. Ele não roteia para o confirm dialog — ele apenas **bloqueia**. Isso cria dois problemas distintos:

**C1a — o buraco de reatividade.** `formDirty` só vira `true` quando `ViewerEditFormComponent` emite `dirtyChange`, e isso só acontece dentro do subscribe de `form.valueChanges` (`viewer-edit-form.component.ts:75-77`). Existe uma janela real onde o form está visualmente sujo e `disableClose` ainda é `false`:

- O usuário entra em EDIT e digita no `<textarea>` de detalhes. `valueChanges` dispara, `form.dirty` vira `true`, `dirtyChange.emit(true)` → shell seta `formDirty(true)` → effect roda → `disableClose = true`. **Isso funciona.**
- **Mas**: o effect é agendado, não síncrono. Entre o `emit` e o flush do effect existe pelo menos um tick. Um ESC nesse intervalo fecha o modal com `disableClose` ainda `false`. Na prática a janela é curta, mas ela existe e o custo é perda total do que foi digitado, sem aviso.

**C1b — o problema estrutural, mais grave.** Mesmo quando `disableClose = true` funciona perfeitamente, o comportamento resultante é **errado do ponto de vista de UX**: o usuário aperta ESC e **nada acontece**. Nenhum dialog de confirmação, nenhum feedback. O modal simplesmente ignora a tecla. O F-07 pretendia que ESC/backdrop passassem pelo guard de descarte — mas `disableClose` não faz isso, ele só desliga o atalho.

Compare com o caminho programático: `close()` (linha 301-303) chama `guardDirty()`, que abre o `ViewerDiscardConfirmDialogComponent` e dá ao usuário a escolha. ESC e backdrop **não têm esse caminho**. São dois comportamentos divergentes para a mesma intenção do usuário ("quero sair").

O comentário na linha 237-238 afirma: *"clicking outside or pressing ESC must not silently discard unsaved edits"*. Estritamente, o objetivo é atingido (não descarta). Mas o resultado é um modal que parece travado, não um modal que pergunta.

**Impacto:** Perda de dado financeiro digitado (C1a, janela estreita) e, com muito mais frequência, um modal que ignora ESC sem explicar por quê (C1b). O usuário que aperta ESC duas vezes e não vê reação tende a concluir que a aplicação travou.

**Solução:** Roteie ESC e backdrop pelo mesmo guard, em vez de bloqueá-los. Mantenha `disableClose = true` **sempre que em EDIT** (não condicionado a `formDirty`, eliminando C1a por completo) e assine os eventos no construtor:

```ts
this.dialogRef.keydownEvents()
  .pipe(filter((e) => e.key === 'Escape'), takeUntilDestroyed())
  .subscribe(() => this.close());

this.dialogRef.backdropClick()
  .pipe(takeUntilDestroyed())
  .subscribe(() => this.close());
```

Com `disableClose` fixo em EDIT, `close()` vira o único ponto de saída de verdade e `guardDirty()` passa a cobrir os três caminhos (botão, ESC, backdrop) com comportamento idêntico. Fora de EDIT, `disableClose = false` e o Material trata ESC/backdrop nativamente como hoje.

**Benefício:** `guardDirty()` deixa de ser "o ponto único" apenas no papel e passa a ser de fato. Elimina a janela de corrida e o modal-que-parece-travado ao mesmo tempo.

> **Resposta direta à pergunta 2 do briefing:** Não. `guardDirty()` **não** é o único ponto de saída. ESC e backdrop escapam dele — são interceptados por `disableClose`, que tem semântica diferente (bloquear ≠ perguntar). Este é o achado mais sério da revisão.

---

#### C2 — Falha de patch é completamente silenciosa dentro do Viewer

**Ponto:** `omega-viewer.component.ts:357` — `error: () => this.saving.set(false)`.

O handler de erro **descarta o erro inteiro**. Não seta estado de erro, não renderiza mensagem, não emite nada. E o template do viewer nunca assina `ExpenseService.error$` — confirmei por grep: nenhuma referência a `error$` ou `errorMessage` em `omega-viewer.component.ts`, `omega-viewer.component.html` ou `viewer-edit-form.component.html`.

`ExpenseService.patch()` **empurra** a mensagem para `errorSubject` (`expense.service.ts:207`), mas quem renderiza `error$` é a `ExpensePage` — que está **atrás do modal**, coberta por ele. A mensagem é publicada num lugar que o usuário literalmente não consegue ver enquanto o Viewer está aberto.

O que o usuário vê na prática: clica em "Salvar" → o botão mostra "Salvando..." → volta para "Salvar" → **nada mais acontece**. O form continua em EDIT com os valores digitados (o que é o comportamento correto para retentativa, e isso está certo), mas não há nenhum indício de que algo falhou. A leitura natural do usuário é "o clique não pegou", e ele clica de novo. E de novo.

Isto é agravado por um caso de erro que é **garantido de acontecer** neste domínio: `ExpenseCostBelowPaidAmountException` (`Expense.java:516-518`). Se o usuário reduzir o `cost` para abaixo do valor já pago, o backend rejeita com uma exceção de negócio específica. O frontend não tem como prever essa condição (ver M1) — então esta é uma falha **esperada, recorrente e sem nenhum feedback visual**.

**Impacto:** Dado financeiro que o usuário acredita ter salvo, e não salvou. Combinado com C1, o cenário completo é: patch falha silenciosamente → usuário assume que salvou → aperta ESC para sair → modal não responde (C1b) → usuário fecha pelo "×" → guard pergunta se quer descartar → ele descarta achando que já tinha salvado. **Perda de dado com confirmação explícita do usuário, causada por informação errada.**

**Solução:** Adicione um signal de erro no shell e renderize-o dentro do form em EDIT:

```ts
protected readonly saveError = signal<string | null>(null);

// no saveEdit:
next: (updated) => { this.saveError.set(null); /* ... */ },
error: () => {
  this.saving.set(false);
  this.saveError.set('Não foi possível salvar. Verifique os valores e tente novamente.');
},
```

Passe como input para `ViewerEditFormComponent` e renderize com `role="alert"`. Idealmente, trate `ExpenseCostBelowPaidAmountException` de forma específica (ver M1) para dizer *por que* falhou, não só *que* falhou.

**Benefício:** Fecha o buraco mais perigoso da feature — o usuário deixa de acreditar em saves que não aconteceram. Junto com C1, elimina o cenário de perda de dado auto-confirmada.

---

### MAJOR

---

#### M1 — Validador `min(0.01)` no frontend é mais restritivo que o backend, e ainda assim não previne a rejeição que realmente importa

**Ponto:** `viewer-edit-form.component.ts:54` — `cost: [0, [Validators.required, Validators.min(0.01)]]`.

Verifiquei o contrato real do backend (não confiei no relatório):

- **`ExpensePatchRequestDto.java:34-35`** — `@Positive @Digits(integer = 12, fraction = 2)`. `@Positive` é estritamente `> 0`. Com `fraction = 2`, o menor valor aceitável é de fato `0.01`.
- **`Expense.java:354`** — `if (!cost.isPositive()) throw new IllegalArgumentException("cost must be positive")`.

**Veredito sobre o valor `0.01`: está correto.** `@Positive` + `@Digits(fraction=2)` produz exatamente `0.01` como mínimo efetivo. Não há divergência frontend/backend aqui, e o julgamento do self-review foi bom. Registro como verificado.

**Mas** — e aqui está o problema real — o validador que existe não é o validador que importa. A regra de negócio que vai rejeitar patches na prática é outra:

```java
// Expense.java:516-518
Money paidAmount = this.cost.subtract(this.remaining);
if (paidAmount.isGreaterThan(patchedCost)) {
    throw new ExpenseCostBelowPaidAmountException(patchedCost, paidAmount);
}
```

Ou seja: **o novo `cost` não pode ser menor que o valor já pago** (`cost - remaining`). Uma despesa de R$300 com R$200 já pagos não aceita ser editada para R$150 — o backend rejeita.

O frontend tem **todos os dados necessários** para prever isso: `OmegaViewerExpenseDetail` carrega `cost` e `remaining` (`omega-viewer-detail.ts:55-56`). O valor pago é `cost - remaining`, computável localmente. Note que isto **não viola** a regra de nunca computar `remaining` — é um validador de entrada derivado do estado exibido, não um valor financeiro renderizado como verdade.

**Impacto:** O usuário reduz o valor de uma despesa parcialmente paga, clica em Salvar, e (por C2) não recebe nenhum feedback. O `min(0.01)` deixa passar porque `150 > 0.01`. A validação que teria pego o erro não existe.

**Solução:** Adicione um validador dinâmico no form, derivado do `expense()` input:

```ts
const paidAmount = expense.cost - expense.remaining;
// no reset/re-seed do effect, aplique min(Math.max(0.01, paidAmount)) ao control de cost
```

Com mensagem explícita: *"O valor não pode ser menor que R$ X já pago."* Isso transforma um erro de servidor silencioso em validação inline.

**Benefício:** Elimina uma classe inteira de save falho antes da requisição sair. Alinha o frontend à regra de negócio real do backend (B1), não só à validação sintática do DTO.

---

#### M2 — `savedOverride` está incompleto: `audit.updatedAt` fica congelado no valor pré-patch

**Ponto:** `omega-viewer.component.ts:343-354`.

O override monta o novo detail com spread `...detail` (o detail **antigo**) e sobrescreve seis campos: `name`, `cost`, `remaining`, `purchaseDate`, `creditCardId`, `details`.

Auditei campo a campo contra `OmegaViewerExpenseDetail` (`omega-viewer-detail.ts:52-72`):

| Campo | Vem do patch? | Tratamento | Correto? |
|---|---|---|---|
| `name`, `cost`, `purchaseDate`, `creditCardId`, `details` | sim | sobrescrito | ✅ |
| **`remaining`** | **sim** | **sobrescrito de `updated.remaining`** | ✅ **correto e crítico** |
| `tagIds` | não (form não edita tags) | preservado via spread | ✅ |
| `installmentsRemaining`, `payments`, `payerName`, `links`, `ref`, `kind` | não afetados pelo patch | preservados | ✅ |
| **`audit.updatedAt`** | **não vem no patch** | **preservado — fica STALE** | ❌ |

**`remaining` está correto.** Confirmei o caminho inteiro: `Expense.patch()` recalcula `patchedRemaining = patchedCost - paidAmount` (`Expense.java:520`), o `ExpenseResponseDto` devolve, `ExpenseService.patch()` tipa como `Expense` (que tem `remaining: number`, `expense.ts:6`), e a linha 349 copia **verbatim**. O teste em `omega-viewer.component.spec.ts:826-846` prova isso explicitamente: `cost: 250` mas `remaining: 190` — um valor que o frontend jamais derivaria sozinho, e que é exibido corretamente. **Este era o risco central da feature e está resolvido.**

O problema é `audit`. O `ExpenseResponseDto` do backend não carrega `createdAt`/`updatedAt` no shape que `Expense` mapeia (o model frontend não tem esses campos), então o override não tem de onde tirá-los. Resultado: `Expense.java:481-487` documenta que o repositório **sempre** carimba `updatedAt` no `save()` — ou seja, o valor mudou no banco, mas o rodapé do Viewer (`omega-viewer.component.html:97-101`) continua exibindo o timestamp antigo até que o usuário navegue para fora e volte.

**Impacto:** Baixo em termos de dinheiro, real em termos de confiança. O usuário salva uma edição e o rodapé diz "Atualizado em [data antiga]" — contradizendo visualmente a ação que ele acabou de fazer. Numa tela de auditoria financeira, um timestamp que não bate é exatamente o tipo de coisa que faz o usuário desconfiar do resto dos números.

> **Sobre "misturar dado antigo com novo de forma inconsistente"** (pergunta 1 do briefing): sim, existe — e é este. O spread de `...detail` preserva `audit` do estado pré-patch enquanto os campos financeiros vêm do pós-patch. O detail resultante é um híbrido temporal. Nos campos de dinheiro está tudo certo; no metadado de auditoria, não.

**Solução:** Duas opções, com trade-off explícito:

- **(a)** Expor `createdAt`/`updatedAt` no `Expense` model do frontend (o backend já os tem no domínio) e sobrescrevê-los no override. Custo: uma mudança de model + confirmar que o `ExpenseResponseDto` realmente os serializa.
- **(b)** Zerar `audit` para `null` no override, escondendo o rodapé até a próxima navegação. Custo: some informação da tela, mas nunca exibe informação errada.

**Recomendo (a)** se o DTO já serializa os timestamps (verificar), **(b)** como fallback barato. Exibir um timestamp errado é pior que não exibir nenhum.

---

### MINOR

---

#### m1 — Baseline da segunda edição: **correto**, mas por um encadeamento frágil e não testado

Esta foi a pergunta 4 do briefing e merece resposta detalhada, porque o mecanismo funciona mas não é óbvio.

**Rastreamento do fluxo:**

1. Save #1 tem sucesso → `savedOverride` é setado com o detail patcheado (linha 343).
2. `readyDetail()` recomputa e retorna o **override** (linha 182-184), porque `ref.kind`/`ref.id` batem.
3. O template passa `[expense]="detail"` (`omega-viewer.component.html:71`) — onde `detail` é o `readyDetail()` já com override.
4. O `effect` em `viewer-edit-form.component.ts:64-73` observa `this.expense()`, vê o novo valor, e chama `form.reset({...})` com os dados patcheados.
5. `form.reset()` também limpa `dirty`.
6. Na segunda edição, `submit()` diffa `value` contra `this.expense()` (linha 86) — que agora é o detail **pós-save-#1**.

**Veredito: o baseline está correto.** A segunda edição diffa contra o resultado da primeira, não contra o valor original. Não há o bug descrito no briefing.

Porém, três observações que justificam registrar isto como achado em vez de simplesmente "ok":

- **Fragilidade:** a correção depende inteiramente do `@if` na linha 69 **não** destruir/recriar o componente entre os saves, e do `effect` reagir ao input signal. Após um save, `leaveEditMode()` seta `mode = 'VIEW'`, o `@if` **destrói** o form, e ao reentrar em EDIT um form **novo** é criado com o `expense()` já correto. Ou seja: funciona por dois caminhos independentes (re-seed via effect **e** recriação via `@if`), o que na prática é robusto — mas nenhum dos dois está documentado como o mecanismo que garante a correção.
- **Sem cobertura de teste:** não existe nenhum teste de "salva, edita de novo, verifica que o segundo patch diffa contra o primeiro resultado". É exatamente o cenário que o briefing levantou como risco, e ele passa hoje por acidente feliz de composição, não por contrato verificado.
- **Efeito colateral do `form.reset()` no effect:** o `reset()` dispara `valueChanges`, que emite `dirtyChange.emit(this.form.dirty)` → `false`. Benigno aqui, mas é um emit não intencional acoplado ao re-seed.

**Solução:** Adicione um teste de segunda rodada de edição. Sem ele, uma refatoração futura do `@if` (ex.: trocar por `@switch`, ou manter o form vivo em VIEW) reintroduz o bug silenciosamente.

---

#### m2 — `disableClose` não fica travado, mas o effect tem uma dependência implícita não-sinalizada

Pergunta 3 do briefing. Auditei os caminhos de saída de EDIT:

- `saveEdit` sucesso → `formDirty.set(false)` (linha 342) + `leaveEditMode()` (linha 355, que também zera ambos) → effect roda → `disableClose = false`. ✅
- `cancelEdit` confirmado → `leaveEditMode()` → `mode='VIEW'`, `formDirty=false`. ✅
- `navigateTo`/`goBack` confirmados → `leaveEditMode()`. ✅
- `saveEdit` **falha** → `saving.set(false)` apenas; permanece em EDIT + dirty → `disableClose` continua `true`. **Correto** — ainda há dado não salvo a proteger. Não é travamento; o "×" continua funcionando via `guardDirty()`.

**Veredito: não existe caminho onde o modal fique permanentemente travado exigindo reload.** O effect é um `effect()` de componente lendo dois signals (`mode()`, `formDirty()`) — ambos rastreados corretamente, sem `untracked`, sem valor stale.

A ressalva é de estilo: escrever numa propriedade **imperativa e externa** (`dialogRef.disableClose`) de dentro de um `effect()` é o uso legítimo mas mais escorregadio de effects — é exatamente a categoria de "sincronizar com API não-reativa" que `angular.dev` cita como caso válido, então a escolha se defende. Mas note que este effect é o que sustenta C1, e ele foi projetado como *bloqueio* e não como *roteamento*. Corrigindo C1, este effect fica ainda mais simples (`disableClose = mode() === 'EDIT'`).

---

#### m3 — `ViewerDiscardConfirmDialogComponent`: duplicação real, mas a chamada de não-extrair está correta

Pergunta 6 do briefing. Verifiquei os precedentes citados. O implementador está certo: **não existe** confirm-dialog genérico no projeto, e `ExpenseDeleteDialogComponent` / `SubscriptionFutureConfirmDialogComponent` são de fato dialogs bespoke por feature.

Este é o **terceiro** dialog de confirmação com a mesma forma estrutural (título + corpo + dois botões + `close(boolean)`). Três instâncias é o ponto clássico onde a extração começa a se pagar — a regra prática de "três strikes" existe justamente aqui.

**Contra-argumento que sustenta a decisão atual:** os três diferem no corpo (o de delete mostra nome+valor da despesa, o de subscription mostra implicação de meses futuros, este é texto puro), e um genérico bem-feito precisaria de projeção de conteúdo ou config tipada. Extrair isso **dentro** de uma task de edição financeira teria sido scope creep num commit que já mexe em dinheiro — e misturar refactor de infra de UI com a primeira feature de escrita do Viewer é exatamente o tipo de coisa que dificulta o rollback se algo der errado em produção.

**Veredito: não bloqueante, mas é dívida técnica real.** Registre como item de tech debt: *"Extrair confirm-dialog genérico — 3 ocorrências duplicadas (`ExpenseDelete`, `SubscriptionFutureConfirm`, `ViewerDiscardConfirm`)"*, com a nota de que o genérico precisa suportar corpo customizado. A decisão de adiar foi correta; o que não pode é o adiamento ficar sem registro.

---

#### m4 — `creditCardService.loadAll()` no construtor: fetch disparado de um componente `shared/`

**Ponto:** `omega-viewer.component.ts:235`.

O comentário (linhas 228-234) justifica bem: a `ExpensePage` nunca chama `loadAll()`, o form precisa da lista para o `<select>`, e a chamada é idempotente sobre um `BehaviorSubject`.

O incômodo arquitetural é que isso contradiz a regra documentada logo acima, na linha 209-212: *"reading their streams here is a read-only lookup map, **not a fetch trigger**"*. A linha 235 é literalmente um fetch trigger. A doc do próprio arquivo agora se contradiz.

Além disso: o `loadAll()` roda **em toda abertura do Viewer**, inclusive para Installment e Subscription, que não têm form de edição e não precisam da lista. É uma requisição HTTP desperdiçada na maioria das aberturas.

**Impacto:** Baixo (uma request extra, cache idempotente). Mas é o tipo de acoplamento que degrada: o próximo dev lê a doc da linha 209 e assume que o componente não faz fetch.

**Solução:** Mover o `loadAll()` para dentro de `enterEditMode()` — que já é guardado por `kind === 'EXPENSE'`. Dispara só quando a lista é de fato necessária, e a doc volta a ser verdadeira.

---

### SUGGESTION

---

#### s1 — `patch satisfies PatchExpenseRequest` seria melhor como tipo declarado

**Ponto:** `viewer-edit-form.component.ts:88-94, 112`.

O objeto `patch` é declarado com um type literal inline que **duplica** a estrutura de `PatchExpenseRequest` (menos `tagIds`), e só no `emit` é validado com `satisfies`. Se `PatchExpenseRequest` ganhar um campo, o literal inline não acompanha e o `satisfies` continua passando (é um subtipo válido).

Prefira derivar do tipo canônico:

```ts
const patch: Partial<Pick<PatchExpenseRequest, 'name' | 'cost' | 'purchaseDate' | 'creditCardId' | 'details'>> = {};
```

Mantém o `satisfies` redundante mas honesto, e amarra o literal à fonte da verdade. Uso de `satisfies` em vez de `as` está correto e é a escolha certa — a observação é só sobre a origem do tipo.

---

#### s2 — `details` com trim: `''` e `null` são indistinguíveis no diff

**Ponto:** `viewer-edit-form.component.ts:108-110`.

`if (value.details.trim() !== (original.details ?? ''))` — se o original é `null` e o usuário digita espaços e apaga, `''.trim() === ''` e nada é enviado. Correto.

Mas se o original é `"nota"` e o usuário limpa o campo, envia `details: ''`. O backend (`@Size(max = 500)`, sem `@NotBlank`) aceita `''` e grava string vazia — **não** `null`. Então "limpar a nota" resulta em `''` no banco, não em ausência de nota. Provavelmente é o comportamento desejado, mas vale confirmar com o backend se `''` e `null` são tratados como equivalentes na leitura (o `details` do frontend é `string | null`, então `''` volta como `''` e não como `null` — divergência sutil de round-trip).

Não é bug hoje; é uma inconsistência de modelagem a confirmar.

---

#### s3 — Complexidade: sem problemas

Análise Big-O do caminho tocado, assumindo volumes realistas (dezenas de cartões, ~7 field rows, 1 item por vez no Viewer):

- `readyDetail()` — O(1). Duas comparações de string no check do override. Ideal.
- `savedOverride` chaveado por ref — a decisão certa; elimina por construção o vazamento de override entre itens após navegação. O(1).
- `creditCardNameById` / `tagNameById` — `Map` construído em `computed()`, O(n) na construção, O(1) por lookup. Correto: evita `Array.find` dentro de loop de renderização.
- `mapDetailToFieldRows` — O(n) sobre tags, memoizado por `computed()`. Correto.
- `@for` no `<select>` de cartões — tem `track card.id`. Correto.
- Sem N+1: um único PATCH por save, sem refetch. `savedOverride` **elimina** um round-trip que a alternativa ingênua (refetch pós-save) teria custado.
- `switchMap` em `detailState` cancela requests obsoletas. `takeUntilDestroyed()` no `valueChanges` do form. Sem vazamento.
- Bundle: o Viewer é lazy via `import()` dinâmico no launcher (`omega-viewer-launcher.ts:35`); o form e o dialog de descarte entram nesse mesmo chunk. Correto.

**Uma observação:** o `subscribe` em `guardDirty()` (linha 375-382) e o de `saveEdit` (linha 338) não têm `takeUntilDestroyed()`. Na prática são inócuos — `afterClosed()` completa sozinho, e o `ReplaySubject` de `patch()` completa após o next. Mas por consistência com o padrão já adotado no resto do projeto, valeria adicionar.

---

## Respostas diretas às perguntas do briefing

| # | Pergunta | Veredito |
|---|---|---|
| 1 | `savedOverride` correto e completo? | **Quase.** `remaining` está **correto** e vem verbatim do backend (verificado no código e no teste). `audit.updatedAt` fica stale → **M2**. |
| 2 | `guardDirty()` é o único ponto de saída? | **NÃO.** ESC e backdrop escapam via `disableClose`, que bloqueia em vez de perguntar → **C1**. |
| 3 | `disableClose` via effect tem stale/travamento? | **Não.** Reatividade correta, nenhum caminho de travamento permanente → **m2**. |
| 4 | Baseline da segunda edição correto? | **Sim**, via re-seed do effect + recriação pelo `@if`. Mas frágil e sem teste → **m1**. |
| 5 | `min(0.01)` bate com o backend? | **Sim** (`@Positive` + `@Digits(fraction=2)` = 0.01). Mas falta o validador que importa: `cost >= valor já pago` → **M1**. |
| 6 | Discard dialog duplicado? | **Duplicação real** (3ª ocorrência), mas adiar foi a chamada certa. Registrar como débito → **m3**. |
| 7 | `mutated` chega na `ExpensePage`? | **Sim, verificado no código real.** Cadeia completa abaixo. |
| 8 | Outros problemas | **C2** (falha silenciosa), **m4**, **s1-s3**. |

**Cadeia do `mutated` (pergunta 7), verificada linha a linha:**

1. `omega-viewer.component.ts:341` — `this.mutated.set(true)` no `next` do patch.
2. `omega-viewer.component.ts:302` — `close()` → `dialogRef.close({ mutated: this.mutated() })`.
3. `omega-viewer-launcher.ts:42-44` — `afterClosed()` → `subscriber.next(result ?? { mutated: false })`. O fallback `?? { mutated: false }` cobre o fechamento sem resultado.
4. `expense-page.ts:494-495` — `if (result.mutated) this.expenseService.loadByWalletId(walletId)`.

Coberto por testes em ambas as pontas (`expense-page.spec.ts:376-388`, `omega-viewer.component.spec.ts:847-849`). **O relatório do implementador confere.**

Uma nota: o `mutated` só chega se o modal fechar via `close()`. Se fechar por ESC/backdrop **fora** de EDIT (onde `disableClose` é `false`), o Material fecha com `undefined` e o launcher cai no fallback `{ mutated: false }` — **descartando um `mutated: true`** de um save anterior na mesma sessão. Cenário real: usuário salva uma edição, o form sai de EDIT, ele aperta ESC → a lista da `ExpensePage` **não recarrega**. A correção proposta em **C1** (rotear ESC/backdrop por `close()`) resolve isto também, de graça.

---

## Veredito final

**APROVADO COM RESSALVAS — não recomendo merge antes de C1 e C2.**

A arquitetura está certa nos pontos que mais importam. `savedOverride` chaveado por ref é uma boa decisão de design e resolve corretamente o problema central desta feature: **`remaining` nunca é computado no frontend**, e isso está provado tanto no código quanto num teste que usa deliberadamente um `remaining` (190) que não é derivável do `cost` (250). O smart/dumb split está limpo, o patch mínimo respeita a semântica do backend, o `mutated` propaga como anunciado, o lazy-loading está preservado e a complexidade não tem nada a corrigir. A suite passa 550/550. O self-review agregou valor real — os validadores eram necessários, o rename de `cancel` estava certo, e o `min(0.01)` de fato bate com o backend.

O que impede o merge são dois defeitos que, **combinados**, produzem perda de dado financeiro:

- **C2** faz o usuário acreditar que salvou quando não salvou.
- **C1b** faz o ESC não responder, empurrando-o para o "×" — onde ele confirma o descarte de dados que ele acha que já estão salvos.

Esse encadeamento não é hipotético: `ExpenseCostBelowPaidAmountException` é uma rejeição de negócio esperada e frequente (reduzir o valor de uma despesa parcialmente paga), e hoje ela é 100% silenciosa. Para a primeira feature de escrita do Viewer sobre dado financeiro, esse é o cenário exato que o rigor deste projeto existe para prevenir.

**Bloqueantes:**
- **C1** — rotear ESC/backdrop por `guardDirty()`; fixar `disableClose = mode() === 'EDIT'`.
- **C2** — superficiar o erro de patch dentro do modal.

**Fortemente recomendados no mesmo ciclo:**
- **M1** — validador `cost >= (cost - remaining)`, com mensagem explicando o valor já pago.
- **M2** — resolver o `audit.updatedAt` stale (opção (a) ou (b)).

**Aceitáveis como débito técnico registrado:** m1 (teste de segunda edição), m3 (confirm-dialog genérico), m4 (`loadAll()` no construtor), s1-s3.

Sugiro que m1, m3, m4 e s1-s3 sejam registrados via `obsidian-tech-debt` em `Tech/Development/Budget Manager/Technical Debt/` em vez de corrigidos aqui — nenhum deles bloqueia ou corrompe a feature, e inflar o escopo deste commit específico aumenta o risco de rollback de algo que mexe em dinheiro.
