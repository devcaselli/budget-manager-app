import { formatBrl } from '@shared/utils/currency';

import {
  OmegaViewerDetail,
  OmegaViewerExpenseDetail,
  OmegaViewerInstallmentDetail,
  OmegaViewerSubscriptionDetail,
} from './models/omega-viewer-detail';
import { OmegaViewerFieldRow, OmegaViewerRemainingBadge } from './models/omega-viewer-field-row';

const UNSET = '—';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

/** Same `null`-safe formatting `BrDatePipe` applies, kept here as a plain function so the
 * mapper (used inside a `computed()`, not a template) doesn't need to run through Angular's
 * pipe machinery. */
function formatDate(value: string | null): string {
  if (!value) {
    return UNSET;
  }
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function formatMonth(value: string | null): string {
  if (!value) {
    return UNSET;
  }
  return value;
}

function row(key: string, label: string, value: string, sensitive = false): OmegaViewerFieldRow {
  return { key, label, value, sensitive };
}

function tagsValue(tagIds: readonly string[], tagNameById: ReadonlyMap<string, string>): string {
  if (tagIds.length === 0) {
    return UNSET;
  }
  return tagIds.map((id) => tagNameById.get(id) ?? UNSET).join(', ');
}

function creditCardValue(
  creditCardId: string | null,
  creditCardNameById: ReadonlyMap<string, string>,
): string {
  return creditCardId ? (creditCardNameById.get(creditCardId) ?? creditCardId) : UNSET;
}

/**
 * Name lookup maps the mapper needs but doesn't own — resolved once in the shell (from
 * `TagService`/`CreditCardService`, both `providedIn: 'root'`) and passed down, so this file
 * stays a pure function with no DI of its own.
 */
export interface OmegaViewerFieldMapperContext {
  readonly tagNameById: ReadonlyMap<string, string>;
  readonly creditCardNameById: ReadonlyMap<string, string>;
}

/**
 * Field coverage per kind mirrors what the corresponding listing page (`expense-page`,
 * `installment-page`, `subscription-page`) already shows in its table/list row — see
 * frontend-tasks.md F-12. Nothing invented, nothing dropped.
 */
export function mapDetailToFieldRows(
  detail: OmegaViewerDetail,
  ctx: OmegaViewerFieldMapperContext,
): readonly OmegaViewerFieldRow[] {
  switch (detail.kind) {
    case 'EXPENSE':
      return mapExpenseRows(detail, ctx);
    case 'INSTALLMENT':
      return mapInstallmentRows(detail, ctx);
    case 'SUBSCRIPTION':
      return mapSubscriptionRows(detail, ctx);
  }
}

// KNOWN GAP (flagged, not silently dropped): expense-page's table also shows a "Bullet"
// column (the wallet bullet an expense's payment was allocated to). `OmegaViewerExpenseDetail`
// (F-01/F-03, already shipped) carries no bullet reference at all — not on the detail itself,
// not on `OmegaViewerPayment` — so it cannot be rendered here without extending that
// already-committed model, which is out of this task's scope. Needs a human call: extend
// the F-01/F-03 model + backend viewer DTO, or accept the gap for now.
function mapExpenseRows(
  detail: OmegaViewerExpenseDetail,
  ctx: OmegaViewerFieldMapperContext,
): readonly OmegaViewerFieldRow[] {
  return [
    row('purchaseDate', 'Data', formatDate(detail.purchaseDate)),
    row('creditCard', 'Cartão', creditCardValue(detail.creditCardId, ctx.creditCardNameById)),
    row('status', 'Status', detail.remaining <= 0 ? 'PAID' : 'OPEN'),
    row('cost', 'Valor original', formatBrl(detail.cost), true),
    row('remaining', 'Saldo em aberto', formatBrl(detail.remaining), true),
    row('payer', 'Pagador', detail.payerName ?? UNSET),
    row('tags', 'Tags', tagsValue(detail.tagIds, ctx.tagNameById)),
  ];
}

function mapInstallmentRows(
  detail: OmegaViewerInstallmentDetail,
  ctx: OmegaViewerFieldMapperContext,
): readonly OmegaViewerFieldRow[] {
  return [
    row('creditCard', 'Cartão', creditCardValue(detail.creditCardId, ctx.creditCardNameById)),
    row('purchaseDate', 'Início', formatDate(detail.purchaseDate)),
    row('lastInstallmentDate', 'Término', formatDate(detail.lastInstallmentDate)),
    // The listing page's "current/total" progress (installment-page.ts `elapsedCharges`)
    // is derived from `sourceEffectiveMonth` + the current month, neither of which exists on
    // `OmegaViewerInstallmentDetail` today — showing a fabricated ratio would be actively
    // wrong (always N/N), so this row honestly reports only the total charge count until the
    // backend viewer endpoint carries what elapsed-progress needs.
    row('installmentNumber', 'Total de parcelas', `${detail.installmentNumber}`),
    row('originalValue', 'Valor original', formatBrl(detail.originalValue), true),
    row('installmentValue', 'Valor da parcela', formatBrl(detail.installmentValue), true),
    row('payer', 'Pagador', detail.payerName ?? UNSET),
    row('tags', 'Tags', tagsValue(detail.tagIds, ctx.tagNameById)),
  ];
}

function mapSubscriptionRows(
  detail: OmegaViewerSubscriptionDetail,
  ctx: OmegaViewerFieldMapperContext,
): readonly OmegaViewerFieldRow[] {
  return [
    row('state', 'Estado', detail.state),
    row('creditCard', 'Cartão', creditCardValue(detail.creditCardId, ctx.creditCardNameById)),
    row('startMonth', 'Início', formatMonth(detail.startMonth)),
    row('endMonth', 'Fim', formatMonth(detail.endMonth)),
    row('currency', 'Moeda', detail.currency),
    row('payer', 'Pagador', detail.payerName ?? UNSET),
    row('tags', 'Tags', tagsValue(detail.tagIds, ctx.tagNameById)),
  ];
}

/**
 * `installmentsRemaining` is Expense-only (the field doesn't exist on the Installment/
 * Subscription detail shapes) and must render `0` (fully paid) and `null` (not linked to an
 * installment) as visually distinct states — never collapsed into "show nothing either way".
 */
export function mapRemainingBadge(detail: OmegaViewerDetail): OmegaViewerRemainingBadge {
  if (detail.kind !== 'EXPENSE' || detail.installmentsRemaining === null) {
    return { kind: 'none' };
  }
  return { kind: 'remaining', count: detail.installmentsRemaining };
}
