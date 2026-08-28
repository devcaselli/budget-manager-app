# Code Review — F-08 (notas) + F-15/F-16 (integrações Installment/Subscription)

**Branch**: `feature/omega-viewer-tema4-e-integracoes` (3 commits acima de `main`)
**Commits**: `45d44a3` (F-15), `d26468e` (F-16), `e751888` (F-08)
**Revisor**: Opus 5, review independente (sem contexto prévio de implementação)
**Suite**: `npm test -- --watch=false` → **62 arquivos / 607 testes, 0 falhas, exit 0**. Sem flakiness observada nesta execução.

---

## Sumário executivo

O F-08 está **arquiteturalmente bem pensado** e a decisão central (não reusar o `mode` do shell, ter signal local) é a correta — está bem justificada e resiste a escrutínio. Os fixes C1/C2 do `b91b4ac` **não foram quebrados** pela composição: `disableClose` continua fixo em `mode()==='EDIT'` (sem gate em `formDirty`), e ESC/backdrop continuam roteando por `close()`→`guardDirty()`.

Mas a composição dos dois sinais **abriu duas brechas novas**, exatamente na classe de problema que se esperava dessa área. Uma delas (C1) é uma perda silenciosa de dados do usuário — mesma família do C2 anterior.

**Veredito: APROVADO COM RESSALVAS — não recomendo merge antes de C1.**

| # | Severidade | Achado |
|---|---|---|
| C1 | **CRITICAL** | Entrar em full-edit descarta nota não-salva sem aviso, e o `notesDirty` fica travado `true` |
| M1 | **MAJOR** | `guardDirty()` e `disableClose` divergem: guard exige `mode==='EDIT' && formDirty`, `disableClose` não |
| M2 | **MAJOR** | `guardDirty()` confirmado limpa `notesDirty` mas não o form local do filho |
| m1 | Minor | Badge de notas aninhado dentro do `role="button"` na InstallmentPage (a11y + UX) |
| m2 | Minor | `saveNotes()` cai em no-op silencioso para `INSTALLMENT` |
| m3 | Minor | Duplicação estrutural nos dois ramos de `saveNotes()` |
| s1 | Sugestão | Cobertura de teste da composição dos dois dirtys é inexistente |
| s2 | Sugestão | `audit: null` pós-save-de-notas esconde footer inteiro |

Pontos 4 (Subscription sem full-edit) e 6 (`details` opcional) — **verificados e corretos**, sem achado.

---

## CRITICAL

### C1 — Entrar em full-edit de Expense descarta a nota em edição sem aviso, e deixa `notesDirty` travado em `true`

**Ponto**: `omega-viewer.component.ts:384-389` (`enterEditMode`), `omega-viewer.component.html:59-91`, `viewer-notes-section.component.ts:99-102` + `129-132`.

Este é exatamente o cenário 1(a) do pedido de review, e ele **falha**.

Sequência real:

1. Expense em `mode() === 'VIEW'`. Usuário clica "Editar" na seção de Notas → `startEdit()` cria o `FormGroup` local.
2. Usuário digita. `valueChanges` → `dirtyChange.emit(true)` → shell: `notesDirty = true`, `disableClose = true`. Correto até aqui.
3. Usuário clica **"Editar" no título** (o botão do full-edit de Expense). Esse botão está visível — a condição de render é `detail.kind === 'EXPENSE' && mode() === 'VIEW'` (`html:59`), e `mode()` **ainda é `'VIEW'`**, porque o modo de notas é local ao filho. O shell não sabe que existe uma edição em andamento.
4. `enterEditMode()` executa `this.mode.set('EDIT')` **sem passar por `guardDirty()`** e sem checar `notesDirty()`.
5. O template troca o ramo `@else` inteiro pelo `<app-viewer-edit-form>` (`html:71-81`). O `<app-viewer-notes-section>` é **destruído**.

Consequências, ambas ruins:

**(a) Perda de dados silenciosa.** O texto digitado na nota some sem nenhum aviso, sem diálogo de descarte. É a mesma classe do C2 anterior — o usuário acredita que seu trabalho está em algum lugar quando não está. Pior: aqui ele nem recebe um erro, o conteúdo simplesmente evapora numa transição que parece inócua.

**(b) `notesDirty` fica travado em `true` — e isso é o mais grave.** O `closeEdit()` que emitiria `dirtyChange(false)` só roda em três lugares: no `effect` que observa `detail()`, no `onCancel()`, e em nenhum outro. **Nenhum deles roda na destruição do componente.** Não há `DestroyRef`/`ngOnDestroy` emitindo `dirtyChange(false)`. Então, depois do passo 5:

- `notesDirty()` permanece `true` indefinidamente;
- `guardDirty()` (`:556-561`) passa a disparar o diálogo de descarte **em toda saída**, para sempre — inclusive quando o usuário cancela o full-edit sem ter tocado em nada, ou simplesmente clica "Fechar";
- `leaveEditMode()` (`:544-548`) reseta `mode`, `formDirty` e `saveError` — mas **não** `notesDirty`. Então sair do full-edit não limpa nada;
- `disableClose` (`:298`) fica `true` permanentemente, mesmo de volta em `VIEW` sem nada editado.

O único caminho que limpa é o usuário confirmar o descarte no diálogo (`:568-570`) — ou seja, ele é forçado a confirmar "descartar alterações" para uma alteração que **já foi descartada** cinco passos atrás. Isso é ativamente enganoso: sugere que há algo a perder quando não há.

**Impacto**: perda silenciosa de dados do usuário + estado de guarda corrompido pelo resto da vida do modal. Blast radius é o modal inteiro, não só a seção de notas.

**Solução** (duas partes, ambas necessárias):

1. Rotear `enterEditMode()` pelo guard, como todo outro caminho de saída já faz:
   ```ts
   protected enterEditMode(): void {
     if (this.readyDetail()?.kind !== 'EXPENSE') return;
     this.guardDirty(() => this.mode.set('EDIT'));
   }
   ```
   Entrar em full-edit **é** abandonar a edição de nota — é precisamente o cenário para o qual o guard existe. O `guardDirty()` já limpa `notesDirty`/`notesSaveError` no ramo confirmado (`:568-570`), então isso resolve (a) e (b) de uma vez.

2. Defensivamente, garantir que o filho emita `dirtyChange(false)` ao ser destruído — `destroyRef.onDestroy(() => this.dirtyChange.emit(false))` no construtor de `ViewerNotesSectionComponent`. Sem isso, qualquer futuro caminho que destrua a seção (uma nova seção condicional, um `@defer`, F-09) reintroduz o mesmo dirty travado. O invariante "o shell só sabe que a nota está limpa se o filho contar" é frágil quando o shell controla a destruição do filho.

**Benefício**: fecha a última brecha de saída não-guardada, elimina a perda silenciosa, e torna o `notesDirty` auto-limpante em vez de dependente de um caminho feliz específico.

---

## MAJOR

### M1 — `guardDirty()` e `disableClose` usam predicados diferentes — divergência assimétrica

**Ponto**: `omega-viewer.component.ts:297-299` vs `:556-561`.

```ts
// disableClose (effect):
this.dialogRef.disableClose = this.mode() === 'EDIT' || this.notesDirty();

// guardDirty:
const formIsDirty = this.mode() === 'EDIT' && this.formDirty();
if (!formIsDirty && !this.notesDirty()) { action(); return; }
```

Os dois predicados **não são o mesmo**. Em `mode()==='EDIT'` com `formDirty()===false` e `notesDirty()===false`:
- `disableClose === true` (bloqueia ESC/backdrop nativos);
- `guardDirty` → passa direto, sem diálogo.

O pedido de review perguntava se os dois cobrem os dois sinais "na mesma ordem/prioridade". A resposta é **não** — mas, ao contrário do que se poderia esperar, aqui a divergência é **deliberada e correta**, e é justamente o fix C1a do `b91b4ac`: `disableClose` é intencionalmente mais amplo para fechar a janela de corrida entre o keystroke e a emissão de `dirtyChange`. ESC/backdrop são roteados por `close()`→`guardDirty()` (`:307-318`), que então decide corretamente deixar passar. O comportamento final para o usuário está certo.

O problema não é o comportamento — é que **`notesDirty` entra nos dois predicados sem a proteção equivalente**. Para o full-edit existe o par `mode` (grosseiro, sem corrida) + `formDirty` (fino); para as notas existe **só** `notesDirty` (fino). A janela de corrida C1a que o fix fechou para o Expense form continua **aberta para as notas**: entre o primeiro keystroke na textarea e a emissão de `dirtyChange(true)` chegando no shell, `disableClose` ainda é `false` e ESC fecha o modal descartando o texto.

O comentário em `:294-296` reconhece isso e argumenta que está tudo bem porque "nada está em risco até o usuário ter realmente digitado algo". Isso é **incorreto**: o risco existe precisamente *durante* o tick em que ele digitou mas o sinal ainda não propagou. É o mesmo argumento que foi rejeitado no C1a original.

**Impacto**: janela de ~1 tick em que ESC descarta a primeira letra digitada numa nota, sem confirmação. Baixa probabilidade, mas é literalmente o bug que a rodada anterior corrigiu — reintroduzido no caminho novo.

**Solução**: expor também um sinal grosseiro de "notas em edição". `ViewerNotesSectionComponent` já tem `editing()`; basta um `output<boolean>` `editingChange` emitido em `startEdit()`/`closeEdit()`, e o shell compõe:
```ts
this.dialogRef.disableClose = this.mode() === 'EDIT' || this.notesEditing();
```
mantendo `notesDirty` só no `guardDirty()` (que é onde a granularidade fina é desejável — não queremos diálogo de descarte para uma textarea aberta e intocada). Isso deixa a simetria exata: `mode`↔`notesEditing` para `disableClose`, `formDirty`↔`notesDirty` para o guard.

**Benefício**: fecha a corrida C1a no caminho novo e torna a assimetria atual (que hoje precisa de 6 linhas de comentário para se justificar) desnecessária.

---

### M2 — `guardDirty()` confirmado limpa o `notesDirty` do shell mas não o form do filho

**Ponto**: `omega-viewer.component.ts:566-572`.

```ts
.subscribe((confirmed) => {
  if (confirmed) {
    this.notesDirty.set(false);
    this.notesSaveError.set(null);
    action();
  }
});
```

O shell limpa seu próprio espelho, mas `ViewerNotesSectionComponent` **continua com `formSignal` populado e `form.dirty === true`**. Nos casos em que `action()` navega (`navigateTo`/`goBack`), isso se auto-corrige: o `detail()` muda → o `effect` (`:99-102`) chama `closeEdit()`. Nos casos em que `action()` fecha o modal, também não importa.

Mas em `cancelEdit()` (`:394-396`) o `action()` é `leaveEditMode()`, que só mexe em `mode`/`formDirty`/`saveError` — `detail()` **não muda**, o effect do filho **não roda**, e a seção de notas reaparece (volta pra `VIEW`) **ainda com a textarea aberta e o texto que o usuário acabou de confirmar descartar**. O shell acha que está limpo (`notesDirty === false`), o filho acha que está sujo (`form.dirty === true`). Divergência de estado entre pai e filho.

A partir daí, qualquer novo keystroke re-emite `dirtyChange(form.dirty)` = `true` e ressincroniza — então não é corrupção permanente. Mas o texto "descartado" está visivelmente na tela, contradizendo o diálogo que o usuário acabou de confirmar.

**Impacto**: UX contraditória (confirmou descarte, o texto continua lá) e janela de dessincronia pai/filho. Menor que C1 porque se auto-corrige, mas é a mesma raiz: **o shell não tem como comandar o filho a limpar**, só espera que ele perceba sozinho via `detail()`.

**Solução**: dar ao shell um canal imperativo. O mais limpo em Angular 21 é o filho expor um método público e o shell obtê-lo via `viewChild(ViewerNotesSectionComponent)`, chamando `resetEdit()` dentro do ramo confirmado do `guardDirty()`. Alternativa sem `viewChild`: um `input` de "reset token" (contador) que o filho observa num `effect`. Prefiro a primeira — é explícita e não inventa um protocolo de sinalização por número mágico.

**Benefício**: elimina a divergência pai/filho e faz "descartar" significar descartar de fato em todos os caminhos, não só nos que por acaso trocam o `detail()`.

---

## Verificações solicitadas — resultados

### ✅ Ponto 1(b) — ESC em full-edit continua coberto

Confirmado, o fix anterior **não foi quebrado**. `disableClose` continua fixo em `mode()==='EDIT'` sem gate em `formDirty` (`:298`); a composição só adicionou `|| notesDirty()`, que é estritamente mais permissiva em bloquear. As subscriptions de `keydownEvents()`/`backdropClick()` (`:307-318`) seguem intactas roteando por `close()`. Teste `omega-viewer.component.spec.ts:849` continua verde.

### ⚠️ Ponto 1(c) — `notesDirty` reseta após save bem-sucedido

**Sim, reseta** — e por dois caminhos redundantes, o que é bom:
1. `saveNotes()` faz `this.notesDirty.set(false)` explicitamente no `next` (`:435`, `:454`);
2. o `savedOverride` muda `readyDetail()` → novo `detail()` no filho → `effect` → `closeEdit()` → `dirtyChange(false)`.

Sem travamento neste caminho. **Mas** note que ambos dependem do save ter sucesso — o travamento descrito em C1 acontece no caminho de destruição, não no de save.

Um detalhe: `savedOverride` recebe `{...detail, details: updated.details ?? null}`. Se o backend retornar `details` idêntico ao que já estava (usuário salvou sem mudar nada), o objeto ainda é uma **nova referência**, então o `effect` do filho dispara igual — `closeEdit()` roda. Correto por acidente de referência, mas funciona.

### ✅ Ponto 3 — erro de save de notas é visível dentro do modal

**Correto e bem feito.** `notesSaveError` é `input` do filho (`viewer-notes-section.component.ts:70`), renderizado em `viewer-notes-section.component.html:14-18` com `.ew-alert[role="alert"]`, **dentro do `<form>`, acima da textarea** — ou seja, dentro do modal aberto, visível, mesmo padrão do `ViewerEditFormComponent`. Não repete o C2. Teste em `viewer-notes-section.component.spec.ts:225`.

A separação `notesSaveError` vs `saveError` está bem justificada no comentário `:145-150` e é a chamada certa — são falhas conceitualmente diferentes e nada ganharia em compartilhar.

Um detalhe menor: `notesSaveError` é limpo em `saveNotes()` (início), em `onNotesCancelEdit()` e no `guardDirty` confirmado — mas **não** em `leaveEditMode()`. Combinado com C1, um erro de save de nota pode sobreviver a uma ida-e-volta pelo full-edit. Some junto com o fix de C1.

### ✅ Ponto 4 — Subscription sem full-edit é intencional

**Confirmado contra o plano.** `frontend-tasks.md:67` (F-07): a task previa `ExpenseService.patch` / `InstallmentService.patch` / `SubscriptionService.update`, mas o status registrado diz explicitamente *"só Expense por enquanto — Installment/Subscription ficam pra próxima rodada"*. E `frontend-tasks.md:74` (F-08) define notas editáveis para Expense/Subscription independentemente.

Então o estado atual — Subscription com só `details` editável no viewer — é **a interseção correta de duas decisões deliberadas**, não uma lacuna acidental. `task-map.md:61` confirma a dependência F-08→F-07 sem exigir form completo.

Ressalva de UX, não de arquitetura: para o usuário, uma Subscription no viewer mostra vários campos read-only e um único bloco "Notas" com botão "Editar". Isso pode ler como bug ("por que só a nota é editável?"). Não bloqueia merge, mas vale alinhar com o Victor se o botão "Editar" da seção de notas não deveria ser rotulado "Editar notas" para deixar o escopo óbvio. Hoje ele é só "Editar" (`viewer-notes-section.component.html:5`) — dentro de um bloco cujo título é "Notas", então é defensável, mas ambíguo à distância.

### ✅ Ponto 5 — F-15 não sobrepõe o botão "Edit notes" — **alegação confirmada**

Li o HTML real (`installment-page.html:126-215`). A alegação **procede**:

- O botão novo "View installment" (`:184-192`) está em `.installment-row-actions`, como **primeiro irmão** dos botões já existentes "Manage tags" (`:193-201`) e "Edit notes" (`:202-208`). São todos `<button>` irmãos, sem aninhamento, sem overlay, sem `position: absolute`. O `.scss` novo (`:199-206`) só adiciona `cursor`/`border-radius`/`:focus-visible` em `.installment-description-row` — não toca em `.installment-row-actions` nem nas action buttons.
- O gatilho `role="button"` foi aplicado ao `<span class="installment-description-row">` (`:129-137`), que está em `.ew-alloc-name` — **outro container**, longe das ações.

Não há sobreposição nem conflito de clique entre o gatilho do viewer e "Edit notes". Mesma conclusão para o F-16 (`subscription-page.html:94-102` vs `:137-146`).

Gatilho teclado-acessível: `(keydown.enter)` + `(keydown.space)` com `$event.preventDefault()`, `tabindex="0"`, `role="button"`, `[attr.aria-label]` — **idêntico ao F-14 já aprovado** (`expense-page.html:130-137`). Padrão replicado corretamente.

`mutated`-gated reload: correto nos dois. `installment-page.ts:403-412` captura `walletId` **antes** de abrir (evita ler um wallet trocado no meio) e chama `loadByWalletId(walletId)` — mesmo shape do F-14. `subscription-page.ts:323-331` chama `loadSubscriptions()` (a Subscription não é wallet-scoped, então não há `walletId` a capturar) — correto. Ambos com `takeUntilDestroyed(this.destroyRef)`.

### ✅ Ponto 6 — `details` em `Subscription`/`UpdateSubscriptionRequest` não quebra call-site nenhum

**Confirmado.** Ambos foram adicionados como **opcionais**:
- `Subscription.details?: string | null` (`subscription.ts:33`)
- `UpdateSubscriptionRequest.details?: string` (`subscription.ts:57`)

Varri todos os call-sites de `UpdateSubscriptionRequest`: `subscription.service.ts:104` (assinatura), `subscription.service.ts:140` (`assignTags`, passa só `tagIds`), `subscription-page.ts:192` (edição inline), e os specs `:96`/`:131`. Nenhum quebra — campo opcional, construção por object literal, sem `exactOptionalPropertyTypes` conflitante. Build e suite passam.

Nota de consistência de tipo: `Subscription.details` é `string | null` e `UpdateSubscriptionRequest.details` é `string` (sem `null`). Assimetria proposital e correta — não há como "limpar" a nota para `null` via patch, só para `""`. É o mesmo contrato que `PatchExpenseRequest.details` já usa, então está coerente com o precedente. Só registrando que "apagar a nota" resulta em string vazia, não `null`, e o template trata `''` como falsy (`viewer-notes-section.component.html:36`) e mostra "Sem notas." — comportamento correto.

---

## Minor

### m1 — Badge de notas ficou aninhado dentro do `role="button"` na InstallmentPage

**Ponto**: `installment-page.html:129-150`.

O `<span class="installment-notes-badge">` (com `mouseenter`/`mousemove`/`mouseleave` de tooltip, `:140-148`) agora está **dentro** do `<span role="button" tabindex="0">` novo. Dois efeitos:

1. **A11y**: um elemento com `aria-label="Has notes"` dentro de um `role="button"` — o conteúdo do botão é substituído pelo `aria-label` do pai (`'View ' + item.description`), então o badge fica inacessível a leitores de tela. Antes ele também não era focável, então não é regressão de foco; mas agora o *nome acessível* do botão engole o badge. Menor porque a informação "tem notas" continua disponível pelo botão "Edit notes" na mesma linha.
2. **UX**: passar o mouse no badge para ler o tooltip agora acontece sobre uma área clicável — clicar no badge (gesto natural depois de ver o tooltip) abre o **viewer**, não as notas. Comportamento surpreendente.

O F-14 não tem esse problema porque a ExpensePage aninhou só tag chips (`expense-page.html:139-141`), que não têm handlers próprios.

**Solução**: mover o badge para fora do span clicável (irmão dele, dentro de `.ew-alloc-name`), ou adicionar `(click)="$event.stopPropagation()"` no badge. A primeira é mais limpa.

### m2 — `saveNotes()` cai em no-op silencioso para `INSTALLMENT`

**Ponto**: `omega-viewer.component.ts:423-468`.

O método faz `notesSaving.set(true)` (`:429`) **antes** de discriminar o `kind`. Os dois `if` cobrem `EXPENSE` e `SUBSCRIPTION`; se `detail.kind === 'INSTALLMENT'`, a função retorna com **`notesSaving` travado em `true` para sempre** — sem request, sem erro, sem reset.

Hoje é inalcançável: o filho não renderiza botão de save para Installment (`isEditable()` = `kind !== 'INSTALLMENT'`). Mas é uma bomba-relógio — o dia em que Installment virar editável (ou alguém chamar `saveNotes` de outro lugar), o botão "Salvar" fica em "Salvando..." permanentemente.

**Solução**: guard-clause explícito no topo, antes de setar `notesSaving`:
```ts
if (detail.kind === 'INSTALLMENT') return;
```
Ou, melhor, um `switch` exaustivo com `never` check no default — o projeto já usa união discriminada com rigor, e aqui o compilador poderia estar garantindo a exaustividade em vez de dois `if` soltos.

### m3 — Duplicação estrutural nos dois ramos de `saveNotes()`

**Ponto**: `omega-viewer.component.ts:432-467`.

Os dois blocos são idênticos exceto pela chamada de service. ~30 linhas duplicadas, quatro `set()` repetidos em cada `next`, dois `error` handlers idênticos.

**Solução**: escolher o observable e ter um único `subscribe`:
```ts
const request$ = detail.kind === 'EXPENSE'
  ? this.expenseService.patch(detail.ref.id, { details })
  : this.subscriptionService.update(detail.ref.id, { details });

request$.subscribe({ next: (updated) => { /* uma vez */ }, error: ... });
```
Ambos retornam algo com `details?: string | null`, então o `next` unifica sem cast. Reduz a superfície onde os dois ramos podem divergir (já quase divergiram — se alguém tocar num `next` e esquecer do outro, o bug é silencioso).

Observação RxJS: nenhum dos `subscribe()` aqui tem `takeUntilDestroyed()`. É aceitável — `HttpClient` completa sozinho e o `ReplaySubject` do service completa — mas se o modal fechar com o request em voo, o `next` ainda roda escrevendo em signals de um componente destruído. Não vaza (o observable completa), mas é write-after-destroy. O `saveEdit()` pré-existente tem o mesmo padrão, então não é regressão do F-08 — só registrando a consistência.

---

## Sugestões

### s1 — Não existe um único teste da composição dos dois dirtys

Esta é a lacuna que **permitiu o C1 passar**. A suite tem cobertura boa de cada sinal isoladamente:
- `notesDirty` sozinho: `spec.ts:1476`, `:1488`, `:1500`;
- `formDirty`/`mode` sozinhos: `:849`, `:871`, `:887+`.

Mas **zero** testes com os dois ativos ao mesmo tempo, e zero testes de transição `notes-dirty → enterEditMode`. Os testes de `notesDirty` chamam `component['onNotesDirtyChange'](true)` direto no shell, **contornando o filho inteiro** — então a destruição do filho (a raiz do C1) nunca é exercitada.

Testes que faltam e que teriam pego os achados:
1. notas dirty → `enterEditMode()` → esperar diálogo de descarte (pega C1);
2. notas dirty → `enterEditMode()` → cancelar full-edit → `notesDirty()` deve ser `false` (pega o travamento de C1);
3. notas dirty via **textarea real** (não via `onNotesDirtyChange`) → destruir a seção → `notesDirty()` deve ser `false`;
4. `mode==='EDIT'` + `formDirty` + `notesDirty` simultâneos → cada caminho de saída (ESC, backdrop, ×, Fechar, navigateTo, goBack) abre exatamente **um** diálogo.

Recomendo que qualquer fix do C1 venha com pelo menos (1), (2) e (3).

### s2 — `audit: null` no `savedOverride` de notas esconde o footer inteiro

**Ponto**: `omega-viewer.component.ts:440`, `:459`.

O `saveNotes()` copiou o `audit: null` do `saveEdit()` (que o adotou como fix M2 da review anterior, por honestidade: o DTO não devolve `updatedAt`). A lógica se aplica igual aqui, então **está correto**. Só registrando o efeito colateral acumulado: salvar uma nota faz o rodapé "Criado em... Atualizado em..." **desaparecer** da tela até a próxima navegação. Sumir é honesto, mas visualmente é um layout shift que o usuário não pediu.

Alternativa, se incomodar: manter `createdAt` e renderizar `updatedAt` como "agora há pouco" / omitir só a metade desatualizada. Fora do escopo desta review — é uma decisão de produto sobre o F-13, não um defeito do F-08.

---

## Análise de complexidade

**Volume assumido**: ≤200 installments e ≤100 subscriptions por wallet (`findAll(page=0, size=100)` em `subscription.service.ts:69`), 1 item por vez no viewer.

- **Notas (F-08)**: O(1) em tudo. Um `FormControl`, um `computed` de `isEditable`, sem loops. `startEdit()` cria um `FormGroup` novo por edição — alocação O(1), descartada em `closeEdit()`. Sem preocupação.
- **Render**: `ViewerNotesSectionComponent` é `OnPush`, sem chamada de método no template (só `editing()`, `form()`, `isEditable()`, `saving()`, `saveError()` — todos signals/computeds). Sem `@for`. Correto.
- **`savedOverride` em `readyDetail()`** (`:213-225`): comparação O(1) por `kind`+`id`, sem varredura. Correto.
- **F-15/F-16**: os gatilhos são O(1) por linha; nenhum `@for` novo, nenhum recomputo adicional. `toListItem()` da SubscriptionPage constrói dois `Map` por item chamado — mas isso é pré-existente (`subscription-page.ts:332-334`), não introduzido aqui. Vale registrar: se `toListItem` roda dentro de um `map` sobre N subscriptions, são N construções de Map sobre C cards e T tags = O(N·(C+T)) em vez de O(N+C+T). Com N=100, C~10, T~30 são ~4000 operações por recomputo — irrelevante nesse volume, mas é um O(n²)-shaped pattern que vale corrigir se a lista crescer. **Fora do escopo deste diff.**
- **Bundle**: `ViewerNotesSectionComponent` entra no chunk lazy `omega-viewer-component` (confirmado no build: `chunk-DN2FLVZ2.js`, 590 bytes), não no initial. Correto — o launcher continua sendo a única porta de entrada e mantém o `import()` dinâmico.

Nenhum problema de complexidade introduzido.

---

## Notas positivas

Vale registrar, porque são decisões não-óbvias que foram tomadas bem:

- **A decisão de não reusar `mode`** está certa e bem argumentada (`viewer-notes-section.component.ts:30-40`). Reusar exigiria ou widening do `enterEditMode` para kinds que o F-07 conscientemente deixou de fora, ou um terceiro valor no `OmegaViewerMode` — ambos piores. O signal local é a chamada correta.
- **A separação `notesSaveError`/`saveError`** e **`notesSaving`/`saving`** está certa pelo motivo certo.
- **Não renderizar a seção durante full-edit** (`html:71-81`) elimina o risco de double-editor de verdade, não só na aparência.
- **`destroyRef` capturado no construtor** (`:62`) para usar em `takeUntilDestroyed` dentro de `startEdit()` — detalhe sutil de contexto de injeção, feito corretamente.
- **F-15/F-16 replicaram o F-14 fielmente**, incluindo a captura de `walletId` antes do open. Sem desvio.
- Os comentários de código são densos mas **carregam o *porquê*** e referenciam achados de review anteriores — isso é o que tornou esta review possível de fazer rápido.

---

## Veredito

**APROVADO COM RESSALVAS — não recomendo merge antes de C1.**

- **C1 é bloqueante.** É perda silenciosa de dados do usuário (mesma família do C2 que a rodada anterior corrigiu) *mais* um estado de guarda que fica corrompido pelo resto da sessão do modal. O fix é pequeno — envolver `enterEditMode()` em `guardDirty()` — e o `guardDirty` já faz a limpeza necessária no ramo confirmado.
- **M1 e M2 deveriam entrar na mesma rodada.** M1 reintroduz a corrida C1a no caminho novo; M2 faz "descartar" não descartar visualmente. Nenhum dos dois é bloqueante isoladamente, mas os três achados têm a **mesma raiz** — o shell não tem controle imperativo sobre o estado de edição do filho, só espera que ele se auto-limpe via `detail()`. Corrigir os três juntos resolve a raiz; corrigir só C1 deixa a estrutura frágil para o F-09.
- **m1-m3 e s1** podem ir junto (são baratos) ou virar débito técnico. Recomendo **s1 junto com o fix de C1** — sem os testes de composição, o próximo sinal de dirty (F-09/F-10 vão adicionar pelo menos um) reabre a mesma classe de brecha.
- **F-15/F-16 estão aprovados sem ressalva**, exceto o m1 (badge aninhado), que é cosmético/a11y menor.

A intuição do pedido de review estava certa: **compor dois sinais de dirty abriu brechas novas exatamente na área onde se esperava.** A composição no `disableClose` está funcionalmente correta; o que faltou foi tratar `enterEditMode` como um caminho de saída — porque ele não *parece* um, mas é.
