# Code Review — F-09 (payments section) + F-10 (revert payment)

**Escopo**: `git diff main..HEAD` — commits `63144be` (F-09) e `3a2efeb` (F-10).
**Branch**: `feature/omega-viewer-tema5` · **Revisor**: independente, sem contexto de implementação.
**Suite**: `npm test -- --watch=false` → **65 arquivos / 659 testes, 100% verde na primeira execução** (sem flakiness observada). `tsc --noEmit` limpo.

**Veredito**: **Não aprovado como está.** Um achado **Critical** (C1) — regressão da mesma classe do C1 do F-07, **confirmada empiricamente**, não por leitura. O resto do trabalho é de qualidade alta e os pontos 2, 5 e 6 do questionamento passam sem ressalva.

---

## Critical

### C1 — `revertPayment()` chama `retry()` fora do `guardDirty()`: uma nota em edição é destruída silenciosamente

**Ponto**: `omega-viewer.component.ts:648` — o handler de sucesso chama `this.retry()` diretamente.

```ts
next: () => {
  this.revertingId.set(null);
  this.mutated.set(true);
  this.retry();          // ← não passa por guardDirty()
},
```

`retry()` (linha 443) empurra um ref novo no `history`, o `switchMap` refaz o `load()`, `detailState` emite um **objeto novo**, e o effect de re-seed do `ViewerNotesSectionComponent` (`viewer-notes-section.component.ts:107-110`) faz `closeEdit()` — que zera o `FormGroup` local e emite `dirtyChange(false)`.

Esta é exatamente a forma do **C1 do F-07** ("entrar em full-edit destruía a nota"), que foi corrigido roteando `enterEditMode()` pelo `guardDirty()`. `revertPayment()` é um caminho novo que destrói a mesma seção e **não recebeu o mesmo tratamento**.

**Confirmação empírica** (não inferência): instrumentei o `omega-viewer.component.spec.ts` com um teste que abre a nota via DOM real (`.vns__edit-btn`), digita no `<textarea>`, e então executa um revert com confirmação. Resultado com `load()` devolvendo um objeto novo a cada chamada — que é o que o HTTP real sempre faz:

| Observação | Valor |
|---|---|
| Diálogos abertos durante o revert | **1** (só o de confirmação de revert; **nenhum** discard) |
| `load()` chamado | 2 (refetch ocorreu) |
| `<textarea>` presente depois | **false** (destruído) |
| Texto digitado | **perdido** |
| `notesDirty` depois | `false` (resetado sem o usuário decidir) |

O arquivo de spec foi **restaurado ao estado original** (`git diff` limpo, suite de volta a 659/659) — nenhuma alteração ficou no working tree.

> Nota metodológica: com o `loadSpy` devolvendo **a mesma referência** de objeto (como fazem vários testes do F-10 hoje), o bug **não aparece** — a nota sobrevive, porque o effect de re-seed não dispara sem mudança de identidade. É por isso que a suite atual passa: os testes de revert do F-10 usam `mockReturnValue(of(detail))`, que mascara exatamente este caso. Em produção, `HttpClient` devolve um objeto novo por resposta, então o bug **é real em runtime** e **invisível na suite**.

**Impacto**: perda silenciosa de trabalho do usuário, sem confirmação — a categoria de defeito que o `guardDirty()` existe para impedir. Agravante: o revert é uma ação de escrita financeira que o usuário tende a fazer *enquanto* revisa/anota o item, então a coincidência "nota aberta + revert" não é rebuscada. E o `disableClose` não protege aqui: não é um fechamento de modal, é uma troca de `detail()` por dentro.

**Solução**: rotear o refetch pelo guard, como todos os outros caminhos destrutivos:

```ts
next: () => {
  this.revertingId.set(null);
  this.mutated.set(true);
  this.guardDirty(() => this.retry());
},
```

Vale decidir conscientemente o UX: o revert **já foi persistido** no backend quando este callback roda, então "Descartar alterações?" com opção de cancelar deixa a tela num estado defasado se o usuário cancelar (trace desatualizado). Duas saídas defensáveis:
- **(i)** manter o guard e, se o usuário cancelar, não refazer o fetch — a tela fica com o trace velho até a próxima navegação, mas a nota é preservada. Aceitável, e é o comportamento menos destrutivo.
- **(ii)** preferível: **bloquear o revert antes de disparar** — se `notesDirty()` (ou `mode() === 'EDIT'`), pedir para salvar/descartar a nota **antes** de chamar `PaymentService.revert()`, dentro de `requestRevertPayment()`. Assim nunca existe o estado "escrita já feita + edição pendente conflitante". É o único caminho que evita a ambiguidade de ordem.

**Benefício**: fecha, na terceira ocorrência, a classe de bug que já custou dois rounds de review (C1/F-07 e C1/F-08); e adiciona a única cobertura de teste que hoje faltaria para detectá-la.

**Ação adicional obrigatória**: os testes de revert do F-10 devem passar a usar `mockImplementation(() => of({ ...detail }))` em vez de `mockReturnValue(of(detail))`. Do jeito atual eles **não conseguem** pegar esta regressão nem regressões futuras do mesmo tipo.

---

## Major

### M1 — `mode() === 'EDIT'` + revert: o botão nem deveria estar acessível, mas a composição não é verificada

`showPaymentsSection()` (linha 280) depende só do `kind`, não do `mode`. Na prática o template renderiza a seção dentro do ramo `@else` de VIEW, então em `mode=EDIT` a seção não existe e o revert não é alcançável — **está correto hoje**, verificado no HTML. Mas isso é uma garantia *emergente do template*, não expressa no `computed()`. Se alguém mover o bloco, o revert passa a poder disparar `retry()` durante um full-edit sujo — e aí o `savedOverride`/`formDirty` são descartados sem guard, com perda de escopo bem maior que a da nota.

**Sugestão**: tornar a intenção explícita — `showPaymentsSection = computed(() => this.mode() === 'VIEW' && (kind === 'EXPENSE' || kind === 'INSTALLMENT'))`. Custo zero, remove a dependência de layout do template.

### M2 — `ineligibleHintOf()` tem um ramo morto e um contrato incoerente com o template

`omega-viewer-payment-row.ts:89-97` devolve `null` para o caso "nem reversal nem reversed". Mas o template (`viewer-payments-section.component.html:51-60`) só entra no `@else` — que renderiza o hint — quando `revertable === false`, e `revertable` é `!reversal && !reversed`. Logo, sempre que o `@else` roda, `reversal || reversed` é verdade, e o `null` **nunca** é alcançado ali.

Consequência: `[title]`/`[attr.aria-label]` estão tipados `string | null` mas na prática nunca recebem `null` — o que está ok — porém o doc comment da função **descreve outro comportamento**: diz que uma linha "que não é nenhum dos dois" recebe "o hint genérico de Share". Isso **não acontece**: ela recebe `null` e, de todo modo, nunca chega ao `@else`. O comentário descreve um design que não foi implementado.

Não é bug funcional, mas é documentação que mente sobre o código — e foi justamente o tipo de coisa (M2 do F-07, "audit timestamp desatualizado") que já foi tratada como achado neste feature. Ou implementa o hint genérico descrito, ou corrige o comentário.

---

## Minor

### m1 — `canRevertPayments = true` é código morto

`payment.service.ts:48`. Nenhum consumidor (`grep` em todo `src/`, fora o próprio arquivo). O `canDeletePayments = false` que ele espelha **é** consumido. Um flag constante `true` que ninguém lê não é "doc-as-code", é superfície morta que sugere um gate que não existe. Remover, ou usar de fato no template para esconder o botão.

### m2 — `revert()` não tem teardown: a request continua após o viewer fechar

`payment.service.ts` — o `.subscribe()` interno não é cancelável pelo chamador; o `ReplaySubject` devolvido, quando desinscrito, não aborta o POST. Se o usuário fechar o modal com o revert em voo, o `next` roda em um componente destruído (`revertingId.set` / `retry()` em signals órfãos).

Mitigadores reais: `mutated` já foi setado; signals de componente destruído não quebram; e o padrão é **idêntico ao do `ShareService.revert()`**, ou seja, é consistente com o precedente aprovado. Além disso, para uma escrita financeira, *não* cancelar o POST é a escolha certa — abortar no meio deixaria o backend em estado indeterminado do ponto de vista do cliente.

Fica como Minor por consistência e por não haver dano observável, mas o `next` deveria ser defensivo quanto ao destroy (ex.: `takeUntilDestroyed` no lado do **componente**, não do serviço, para não tocar signals após o teardown).

### m3 — `formatPaymentDateLabel` cria `Date` a partir de string sem validação

`new Date(paymentDate)` com string inválida gera `Invalid Date` → `Intl.format` lança `RangeError`, que estouraria dentro de um `computed()` e derrubaria a renderização da seção inteira. O backend tipa `Instant` (sempre válido), então é defensivo — mas o `computed()` é um ponto onde uma exceção tem blast radius desproporcional.

---

## Respostas diretas aos 7 pontos

**1. Gap SHARED/NO_BULLET só via 422 — aceitável?**
**Sim, aceitável — e eu não mudaria o modelo.** O comportamento atual é seguro nas duas dimensões que importam: o backend é a autoridade, rejeita com 422 antes de qualquer escrita, e o `describeRevertError()` devolve uma mensagem específica e acionável (não genérica). Nenhum dado é perdido nem corrompido; o pior caso é um clique desperdiçado com explicação clara.

Adicionar `kind`/`shareId` ao `OmegaViewerPayment` exigiria mudança no `PaymentTraceLineDto` (backend), no `omega-viewer-dto.ts`, no mapper e nos testes dos dois lados — para eliminar um clique perdido em um app pessoal de um usuário só. **Custo desproporcional.** A decisão está documentada honestamente no doc comment do `isRevertablePayment`, que é o padrão certo.

Ressalva: a UX seria pior se o 422 fosse frequente. Como `NO_BULLET` é declarado no próprio backend como "nenhum fluxo de produção produz isso hoje", o caso real é só `SHARED_PAYMENT`. Se pagamentos SHARED forem comuns no trace, reavalie; se forem raros, mantenha.

**2. Mapeamento de `payments` no Installment está correto/completo?**
**Sim, verificado e correto.** `mapExpense` (linha 88) e `mapInstallment` (linha 126) usam a **mesma função** `mapPaymentTraceLine` sobre o mesmo `dto.paymentTrace`, ambos tipados `readonly PaymentTraceLineResponseDto[]` — não há divergência possível de tratamento de campos opcionais/nulos porque não há código duplicado. Confirmei contra o record Java `PaymentTraceLineDto`: os 8 campos batem 1:1, e nenhum é anulável no backend (`bulletId` é `String` mas o use case garante presença para NORMAL). O achado do implementador (campo nunca mapeado apesar do backend já enviar) é legítimo e a correção é a mínima possível.

**3. Interação refetch × dirty-guard/mode.**
**Existe um caminho destrutivo — é o C1 acima, confirmado empiricamente.** Com `notesDirty=true`, o revert destrói a nota sem diálogo. Com `mode=EDIT`, está protegido *hoje*, mas só por acidente de layout do template (M1). É a mesma classe do C1 anterior.

**4. Acessibilidade/foco do `ViewerRevertConfirmDialogComponent`.**
**Segue o padrão.** Estrutura idêntica ao `ViewerDiscardConfirmDialogComponent`: `mat-dialog-title`/`mat-dialog-content`/`mat-dialog-actions`, botão de fechar com `aria-label="Fechar"`, ícone decorativo com `aria-hidden="true"`, `confirm()`/`cancel()` fechando com `boolean`. Foco inicial, focus-trap, restauração de foco ao fechar e ESC são fornecidos pelo `MatDialog` — e aqui **ESC funciona nativamente**, porque este diálogo é aberto sem `disableClose` (diferente do shell, que precisou de tratamento especial). `afterClosed()` devolve `undefined` no ESC, que cai no `if (confirmed)` como falsy → não reverte. Correto.

**5. `describeRevertError()` cobre os 4 `reason`?**
**Sim, verificado contra a fonte.** Confirmei os 4 valores no enum real `PaymentNotRevertableException.Reason` (`SHARED_PAYMENT`, `ALREADY_A_REVERSAL`, `ALREADY_REVERTED`, `NO_BULLET`) e — mais importante — confirmei no `GlobalExceptionHandler.java:287` que o handler faz `problem.setProperty("reason", ex.getReason().name())`, ou seja, `reason` é propriedade **top-level** do JSON e o `.name()` produz exatamente essas strings. O parsing do frontend (`error.error as { reason?: string }`) casa com o contrato real. As 4 mensagens em português são específicas e acionáveis; o fallback genérico só pega não-422 e 422 com `reason` desconhecido. Sem ressalvas.

**6. Big-O da seção de payments.**
**O(P), linear, sem aninhamento.** `mapPaymentsToRows` é um único `.map()`; cada linha faz trabalho O(1) (`statusOf`, `formatBrl`, `payerLabelOf` lê só `.length`, `isRevertablePayment` são dois booleans). **Não repete o padrão `.find()` aninhado do m2 do Tema 4** — não há lookup cruzado aqui, justamente porque a resolução `payerId → nome` foi deliberadamente descartada (que seria exatamente onde um O(P × N) apareceria). O `Intl.DateTimeFormat` está instanciado **uma vez** no módulo (linha 54), não por linha — esse é o detalhe que normalmente vira gargalo e foi feito certo. Renderização: `@for` com `track row.id`, `OnPush`, zero method call no template. Para P realista (dezenas), custo irrelevante.

**7. Outros.** M1, M2, m1, m2, m3 acima. Ponto positivo que merece registro: `revertError` renderizado com `role="alert"` dentro do modal aberto — o C2 anterior (falha silenciosa) **não** se repetiu, e a checagem de `revertingId() === row.id` isola o spinner/disabled em exatamente uma linha.

---

## Resumo

| Sev | Achado |
|---|---|
| **Critical** | C1 — `retry()` fora do `guardDirty()` destrói nota em edição (confirmado empiricamente; testes atuais mascaram) |
| Major | M1 — `showPaymentsSection` não considera `mode()`; garantia só emergente do template |
| Major | M2 — `ineligibleHintOf()` com ramo inalcançável e doc comment que descreve comportamento não implementado |
| Minor | m1 — `canRevertPayments` é código morto |
| Minor | m2 — `revert()` sem teardown; toca signals após destroy |
| Minor | m3 — `formatPaymentDateLabel` pode lançar dentro de `computed()` |

**Bloqueia merge**: C1 (+ o ajuste dos testes que o mascaram). M1/M2 são baratos e valem no mesmo passe. m1–m3 podem virar débito técnico.

O trabalho de F-09/F-10 é sólido: separação dumb/smart consistente, precomputação correta, contrato de erro verificado contra o backend, e o achado do `payments` não mapeado foi legítimo. O C1 é uma regressão de composição — não de código novo isolado — que só aparece na interação com o F-08, e que a suite atual estruturalmente não consegue detectar.
