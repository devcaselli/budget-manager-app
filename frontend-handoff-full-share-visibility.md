# Handoff — Full-Share Expense Visibility (Frontend)

**Status:** pronto para planejamento detalhado / execução por `angular-developer-ultimate`.
**Autor:** omega-planner, 2026-07-24.
**Repo:** `budget-manager-app`.
**Repo irmão (backend):** `budget-manager-api-public` — ver `backend-handoff-full-share-visibility.md` lá. **Depende do backend estar pronto primeiro** (`includeHidden` no endpoint da tela de Expenses).

---

## Contexto

Quando uma expense é totalmente repassada a outro pagador via share (`InteractiveShareDialog`, `ownerShare == 0`), ela fica `hidden=true` no backend e some da tela sem aviso — comportamento by-design, mas sem feedback visual. Victor decidiu: adicionar um filtro pra reexibir essas expenses (mostrando R$0, igual uma expense paga 100% já mostra hoje) + um indicador visual "faz parte de um share".

**Escopo cortado (2026-07-24):** mudança de semântica do acúmulo de tags fica fora — não mexer em nada de Tags nesta rodada.

## Escopo

### Dentro do escopo

1. **Novo filtro na tela de Expenses** ("mostrar expenses totalmente repassadas" ou nome equivalente) — checkbox no `filtersForm` existente (`expense-page.ts:155-162`). Quando ligado, chama o endpoint com `includeHidden=true` (nome exato a confirmar com o backend).
2. **Renderização das expenses full-share reexibidas** — reusa o padrão visual já existente de "remaining zerado": `ep-amount` mostra R$0,00, `ep-amount-original` mostra o `cost` original tachado/pequeno acima, pílula "PAID" na coluna Status (mesmo mecanismo de `expense-page.html:142-156`, `remaining <= 0 → statusLabel: 'PAID'`). **Não criar componente/estado visual novo** — é a mesma renderização que já existe pra qualquer expense com `remaining=0`.
3. **Indicador de share reexibido para os itens full-share** — reusa o ícone `groups` + tooltip já existente (`expense-page.html:147-155`, `.ep-share-indicator`, `expense-page.ts:196-224`). Hoje esse indicador só aparece pra share parcial porque só share parcial chega visível na lista; com o filtro novo, os itens full-share reexibidos devem entrar no mesmo cálculo de `activeShares`/`hasShare`/`shareSummary` sem lógica nova — é o mesmo dado (`shares()` já carregado), só que agora inclui itens que antes nunca apareciam na lista pra cruzar.

### Fora do escopo (explícito)

- Qualquer mudança em Tags/acúmulo — cortado do escopo geral desta correção.
- Botão "Split expense" continuar oculto quando `hasShare=true` (comportamento atual preservado, `expense-page.html:179-189` — expense já compartilhada não abre split de novo).
- Diferenciar visualmente share parcial de share full no indicador — não pedido, o mesmo badge serve para os dois casos (mostra quem é o payer e quanto, independente de full ou parcial).

## Decisões já tomadas (não reabrir sem novo input do Victor)

| Decisão | Escolha |
|---|---|
| Onde o filtro fica | Checkbox no `filtersForm` já existente da tela de Expenses, junto dos outros 5 filtros |
| Como a expense reaparece | R$0 (remaining), reusando o padrão visual já existente — sem componente novo |
| Indicador de share | Reusa o ícone/tooltip já existente pra share parcial, sem diferenciar full de parcial |
| Escopo de Tags | Cortado — não mexer |

## Achados técnicos (angular-frontend-expert, investigação 2026-07-24)

### Indicador de share parcial já existe, reusável

- Ícone `groups` (Material Icon) + tooltip com resumo (`payerName: valor` por quota) — `expense-page.html:147-155`, `.ep-share-indicator` (`expense-page.scss:130-149`).
- Lógica: `activeShares` filtra `shares()` por `sourceType === 'EXPENSE' && sourceId === expense.id && status === 'ACTIVE'`, `hasShare = activeShares.length > 0`, `shareSummary` monta o texto do tooltip (`expense-page.ts:196-224`).
- Hoje `hasShare` e "aparece indicador" andam 1:1 só porque só share parcial chega visível na lista — full-share nunca chegava a esse ponto do código. Com `includeHidden`, os itens full-share entram na mesma lista e o MESMO cálculo já os cobre, sem lógica condicional nova.

### Filtros existentes — padrão a seguir

- Todos num único `FormGroup` reativo (`filtersForm`, `expense-page.ts:155-162`): search (texto), creditCardId (dropdown), paymentStatus (dropdown 3-estado), sortOrder (dropdown), startDate/endDate (range). Leitura via `toSignal(filtersForm.valueChanges)` → `filteredExpenseItems = computed(...)`.
- **Não existe hoje nenhum filtro checkbox simples** — os 5 atuais são texto/dropdown/date. O novo filtro é o primeiro do tipo boolean puro nessa tela; usar `<input type="checkbox">` nativo ligado via `formControlName`, consistente com o resto (sem MatCheckbox — padrão do projeto é HTML nativo pra form controls simples, `<select>` não `MatSelect`).
- Lógica pura de filtro isolada em `expense-list.filters.ts` (`matchesCriteria`, `filterAndSortExpenses`) — adicionar o novo critério ali, não misturar com o template.

### Padrão "R$0" já existe, sem componente dedicado

- `remaining <= 0 → statusLabel: 'PAID'` (`expense-page.ts:220`).
- `ep-amount` sempre mostra `remaining | brlCurrency` (`expense-page.html:146`) — quando zerado, já renderiza "R$ 0,00" naturalmente.
- Se `paid > 0`, mostra `cost` original riscado/pequeno acima em `ep-amount-original` (`expense-page.html:143-145`).
- Pílula "PAID" na coluna Status quando `statusLabel === 'PAID'`.
- **Não é um componente separado** — é a mesma renderização usada pra qualquer remaining decrescente, parcial ou total. Full-share reexibida cai naturalmente nesse mesmo caminho, sem trabalho extra de UI.

## Dependências / integração

- Depende do backend (`backend-handoff-full-share-visibility.md`) expor `includeHidden` no `GET /expenses/wallet/{id}`.
- `ExpenseService`/chamada HTTP precisa passar o novo parâmetro condicionalmente, baseado no valor do checkbox no `filtersForm`.
- Se o backend optar pela opção (a) do indicador (reusar `GET /shares/active` sem mudança de contrato — recomendado), nenhuma mudança adicional é necessária na chamada de shares já existente no frontend, só garantir que os IDs das expenses full-share reexibidas entrem no mesmo lote de busca de shares ativos (conferir se já é feito para todos os itens da lista atual, ou só pros visíveis por padrão — checar `expense-page.ts` onde `shares()` é carregado).

## Critérios de aceite

1. Novo checkbox no filtro da tela de Expenses ("mostrar expenses totalmente repassadas" ou texto equivalente em inglês, seguindo convenção do resto do app).
2. Checkbox desligado (default): comportamento atual preservado, expenses full-share continuam ocultas.
3. Checkbox ligado: expenses full-share aparecem na lista, mostrando R$0 no valor (remaining), custo original riscado acima, pílula "PAID".
4. Expenses full-share reexibidas mostram o indicador de share (ícone+tooltip) com o nome do payer e valor, igual share parcial já mostra hoje.
5. Nenhuma mudança de comportamento para expenses sem share ou com share parcial (regressão coberta).
6. Testes: filtro liga/desliga corretamente, chamada HTTP inclui `includeHidden` quando ligado, indicador aparece pros itens full-share reexibidos.

## Questões em aberto

- Texto exato do label do checkbox (em inglês, seguindo convenção) — decisão de execução, não bloqueante.
- Confirmar no backend se `shares()` já é carregado para TODOS os itens da wallet ou só pros atualmente visíveis — se for só pros visíveis, pode precisar de ajuste pra incluir os full-share reexibidos na mesma busca.
