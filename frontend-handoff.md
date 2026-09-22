# Handoff — Enhanced Ingest (Frontend)

**Status:** pronto para planejamento detalhado / execução por `angular-developer-ultimate`.
**Autor:** omega-planner, 2026-07-24.
**Repo:** `budget-manager-app`.
**Repo irmão (backend):** `budget-manager-api-public` — ver `backend-handoff.md` lá. **Depende do backend estar pronto primeiro** (novo modelo `PendingExpenseReview` + endpoints list/edit/discard/confirm).

---

## Objetivo

Substituir o botão "Sync" atual (que hoje cria expenses direto e mostra um resumo de contadores) por um fluxo de **revisão antes de confirmar**: clicar Sync abre uma modal com os itens pendentes, editáveis inline (nome, parcelamento), com checkbox de seleção e opção de excluir definitivamente. Além da modal, uma **tela dedicada nova** ("Revisar Importações") mostra os mesmos pendentes a qualquer momento, não só logo após clicar Sync.

## Escopo

### Dentro do escopo

1. Componente burro `pending-review-list` — lista de itens com: nome (input editável), valor, checkbox (marcado por padrão), toggle "é parcelado?" + campo N-parcelas condicional, botão excluir por item.
2. Componente smart `pending-review-page` — resolve estado via serviço, passa lista para `pending-review-list`. É o conteúdo tanto da rota dedicada quanto da modal (reusar a page inteira dentro do `MatDialog`, não só o componente burro — evita duplicar lógica de loading/erro/refetch).
3. Rota nova "Revisar Importações", entrada em `activityNav` (logo após "Connected accounts", antes de "Settings" — mesmo agrupamento temático de ingestão bancária/Pluggy).
4. `PendingReviewService` novo — `BehaviorSubject`+`toSignal`, estado compartilhado entre modal e tela dedicada (editar/confirmar/descartar num lugar reflete no outro sem re-fetch).
5. Botão "Sync" continua na Expense page — dispara sync, abre a modal com o resultado (fluxo rápido de sempre). Não migra para a tela dedicada.
6. Botão "Confirmar" na modal/page — POST em lote dos itens marcados.

### Fora do escopo (explícito)

- Seleção manual de cartão para itens `card_sync`/fallback — mantém como está.
- Qualquer redesign do resumo de resultado pós-confirmação além do que já existe hoje (`ew-alert`-style summary já shipado em `93a1646`) — se aplicável, reusar o padrão existente, não inventar novo.
- Detalhe extra que o Victor mencionou querer acrescentar depois ("mais pra frente eu acrescento mais") — não descrito, fora deste handoff até ele especificar.

## Decisões já tomadas (não reabrir sem novo input do Victor)

| Decisão | Escolha |
|---|---|
| Modal vs. rota dedicada | **Ambas** — não é OU. Modal para o fluxo rápido pós-Sync, rota dedicada para revisão a qualquer momento. Mesmo componente reusado nas duas. |
| Botão Sync na Expense page | **Mantém** — continua lá, abre a modal. Não migra pra tela dedicada. |
| Edição de item | Inline na própria lista (nome + toggle parcelamento), sem sub-editor/expansão separada |
| Item desmarcado (checkbox off) e modal fechada sem confirmar | Fica pendente, reaparece no próximo sync / já visível na tela dedicada |
| Exclusão de item | Ícone de exclusão por item = descarte definitivo (chama endpoint de discard) |
| Cartão em fallback (`card_sync`) | Fora de escopo — não editável na modal/tela |
| Onde a rota entra na nav | `activityNav`, após "Connected accounts" |

## Achados técnicos (angular-frontend-expert, investigação 2026-07-24)

### `SyncService` atual não serve para o novo fluxo

- `src/app/features/sync/services/sync.service.ts` — `ingest()` retorna `SyncReport` (contadores agregados: created/skipped/fallback/errors), **não uma lista de itens individuais**.
- O service inteiro muda de forma, não é extensão incremental. Precisa de métodos novos: listar pendentes (`GET`), editar item, descartar item, confirmar em lote — alinhados aos endpoints novos do backend.
- Novo model necessário: `PendingReview` (espelha `PendingExpenseReview` do backend — ver `backend-handoff.md`).

### Padrão de modal confirmado viável

- `MatDialog` é o único padrão de overlay no projeto (confirmado, sem `MatMenu`/CDK Overlay soltos em uso).
- Lista de N itens com input+checkbox+toggle+campo condicional **cabe** no padrão — mesma classe de complexidade dos dialogs já existentes (`installment-create-dialog`, `interactive-share-dialog`), só repetida N vezes. `mat-dialog-content` suporta `max-height`+scroll interno nativamente para volume de itens — não é motivo para forçar rota em vez de modal.
- **Referência mais próxima no código atual:** `interactive-share-dialog` já lida com edição de múltiplos itens numa lista dentro de um `MatDialog`.

### Estrutura de reuso recomendada

```
src/app/features/pending-review/
  components/
    pending-review-list/     — burro: input(list), output(edit/toggle/discard/confirm)
  pages/
    pending-review-page/     — smart: injeta service, toSignal, passa pra list
  services/
    pending-review.service.ts — BehaviorSubject/loading$/error$, compartilhado
  models/
    pending-review.ts
```

- **Modal = abrir `pending-review-page` inteira dentro do `MatDialog`** (não um wrapper separado que injeta só o componente burro). Isso evita escrever a lógica de "buscar pendentes, subscrever, tratar erro" duas vezes — rota e modal reusam a mesma camada smart, não só a burra.
- Segue o padrão já registrado do projeto (`docs/shared-state-behavior-subject.md`): sem NgRx, `BehaviorSubject`+`toSignal`.

## Dependências / integração

- Depende dos endpoints novos do backend (`backend-handoff.md`): listar pendentes em revisão, editar (nome/installmentNumber), descartar, confirmar em lote.
- `expense-page.ts` — hoje único consumidor do `SyncService`; botão Sync ali muda de "dispara e mostra resumo" para "dispara sync (staging) e abre modal de revisão".
- Nenhum toast/snackbar system existe no projeto — resultado pós-confirmação reusa o padrão `ew-alert` local já usado em `connected-accounts-page` e no sync atual (`93a1646`), não inventar um novo.

## Critérios de aceite

1. Clicar "Sync" na Expense page dispara sync (staging) e abre modal com a lista de pendentes atualizada (novos + já existentes em `PENDING_REVIEW`).
2. Cada item da lista: nome editável inline, valor exibido, checkbox marcado por padrão, toggle parcelamento com campo N revelado condicionalmente, ícone de excluir.
3. Editar nome ou marcar parcelamento persiste via chamada ao backend (não só estado local — sobrevive fechar/reabrir modal).
4. Desmarcar checkbox e fechar sem confirmar: item continua pendente, aparece de novo no próximo sync e na tela dedicada.
5. Excluir item: some da lista, não reaparece (mesmo com novo sync).
6. Confirmar: POST em lote só dos itens marcados, lista atualiza removendo os confirmados, Expense page reflete as novas expenses/installments criadas.
7. Rota "Revisar Importações" acessível pela nav (`activityNav`), mostra os mesmos pendentes sem precisar clicar Sync antes.
8. Estado compartilhado entre modal e tela dedicada — ação numa reflete na outra sem exigir refresh manual.
9. Testes: componente `pending-review-list` (edição, toggle, emit de eventos), `pending-review.service` (estado, chamadas HTTP), fluxo de confirmação em lote.

## Milestones sugeridos

1. `PendingReviewService` + models novos, consumindo os endpoints do backend (bloqueado até backend Milestone 2 estar pronto).
2. `pending-review-list` (burro) + `pending-review-page` (smart).
3. Rota + entrada na nav (`activityNav`).
4. Integração da modal na Expense page (reusa `pending-review-page` dentro de `MatDialog`, substitui o fluxo atual do botão Sync).
5. Testes + self-review.

## Questões em aberto

- Detalhe extra que o Victor mencionou e adiou ("mais pra frente eu acrescento mais") — natureza desconhecida.
- Layout exato do toggle-parcelamento e do resumo de erros por item (ex: item que falhar na confirmação em lote — como reportar erro por item vs erro geral) não detalhado ainda, decidir na fase de planejamento fino com angular-frontend-expert.
