import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '@environments/environment';

import {
  OmegaViewerDetail,
  OmegaViewerExpenseDetail,
  OmegaViewerInstallmentDetail,
  OmegaViewerInstallmentProgress,
  OmegaViewerPayment,
  OmegaViewerReservedBudgetMigrationDetail,
  OmegaViewerSubscriptionDetail,
} from './models/omega-viewer-detail';
import {
  ExpenseViewerResponseDto,
  InstallmentProgressResponseDto,
  InstallmentViewerResponseDto,
  PaymentTraceLineResponseDto,
  ReservedBudgetMigrationViewerResponseDto,
  SubscriptionViewerResponseDto,
  ViewerRefResponseDto,
} from './models/omega-viewer-dto';
import { OmegaViewerLink, OmegaViewerRef } from './models/omega-viewer-ref';

/**
 * Read facade for the Omega Viewer shell. `load()` is the only public surface.
 *
 * Calls the real backend Viewer endpoints (`ViewerController`, backend tasks C4/C5/C6):
 * `GET /viewer/expenses/{id}`, `GET /viewer/installments/{id}`,
 * `GET /viewer/subscriptions/{id}`. All three are owner-scoped via the JWT — no ownerId is
 * sent, same as every other endpoint in the project. DTO shapes live in `models/omega-viewer-dto.ts`
 * and mirror the backend's `rest/viewer/dtos/*ResponseDto.java` records exactly.
 *
 * `refs` (cross-references) already arrive with a resolved `label` from the backend, so no
 * extra fetch is needed to derive link text — unlike the earlier client-side fallback, which
 * had to fetch the linked Installment separately just to read its `description`.
 *
 * Component-scoped provider (see `OmegaViewerComponent`'s `providers: []`) — this is
 * modal view-state, not an app-lifetime singleton, so it is NOT `providedIn: 'root'`.
 */
@Injectable()
export class OmegaViewerService {
  private readonly http = inject(HttpClient);
  private readonly viewerUrl = `${environment.apiUrl}/viewer`;

  load(ref: OmegaViewerRef): Observable<OmegaViewerDetail> {
    switch (ref.kind) {
      case 'EXPENSE':
        return this.loadExpense(ref.id);
      case 'INSTALLMENT':
        return this.loadInstallment(ref.id);
      case 'SUBSCRIPTION':
        return this.loadSubscription(ref.id);
      case 'RESERVED_BUDGET_MIGRATION':
        return this.loadReservedBudgetMigration(ref.id);
    }
  }

  private loadExpense(id: string): Observable<OmegaViewerExpenseDetail> {
    return this.http
      .get<ExpenseViewerResponseDto>(`${this.viewerUrl}/expenses/${id}`)
      .pipe(map((dto) => this.mapExpense(dto)));
  }

  private loadInstallment(id: string): Observable<OmegaViewerInstallmentDetail> {
    return this.http
      .get<InstallmentViewerResponseDto>(`${this.viewerUrl}/installments/${id}`)
      .pipe(map((dto) => this.mapInstallment(dto)));
  }

  private loadSubscription(id: string): Observable<OmegaViewerSubscriptionDetail> {
    return this.http
      .get<SubscriptionViewerResponseDto>(`${this.viewerUrl}/subscriptions/${id}`)
      .pipe(map((dto) => this.mapSubscription(dto)));
  }

  // Path segment/DTO/field confirmed against the real backend (RBM-F1 gate). The
  // @PathVariable is named `id` on the controller but semantically receives the extraBudgetId
  // — it's "the migration" that opens, not "the reserve budget with focus on the migration".
  private loadReservedBudgetMigration(
    extraBudgetId: string,
  ): Observable<OmegaViewerReservedBudgetMigrationDetail> {
    return this.http
      .get<ReservedBudgetMigrationViewerResponseDto>(
        `${this.viewerUrl}/reserved-budget-migrations/${extraBudgetId}`,
      )
      .pipe(map((dto) => this.mapReservedBudgetMigration(dto)));
  }

  private mapExpense(dto: ExpenseViewerResponseDto): OmegaViewerExpenseDetail {
    return {
      kind: 'EXPENSE',
      ref: { kind: 'EXPENSE', id: dto.id },
      name: dto.name,
      cost: dto.cost,
      remaining: dto.remaining,
      purchaseDate: dto.purchaseDate,
      creditCardId: dto.creditCardId,
      details: dto.details,
      tagIds: dto.tags.map((tag) => tag.id),
      // No single resolved payer name in the real DTO — see the field's own doc comment.
      payerName: null,
      payments: dto.paymentTrace.map(mapPaymentTraceLine),
      // `ExpenseViewerResponseDto` carries no installment-progress field at all — C4
      // (`FindExpenseViewerUseCase`) only exposes a navigation `ref` to the parent
      // Installment (type INSTALLMENT), it does not resolve that Installment's
      // `InstallmentProgressDto`. Following the ref with a second HTTP call just to derive
      // this badge would reintroduce the exact per-item fetch the real endpoint was built
      // to eliminate (see the class doc), so this stays `null` (no badge) until/unless the
      // backend adds progress to the Expense DTO itself. The 0-vs-null distinction still
      // applies where the backend actually provides progress — see `mapInstallment` below.
      installmentsRemaining: null,
      links: mapRefs(dto.refs),
      // ExpenseViewerResponseDto carries no deletedAt field yet (the Omega Viewer plan calls
      // for Expense to eventually get one; C4 as shipped doesn't) — `null` here is accurate,
      // not a placeholder, same treatment as Subscription below (which never gets one, by
      // design: hard-delete/endMonth model has nothing to stamp).
      audit: {
        createdAt: toDateOnly(dto.createdAt),
        updatedAt: toDateOnly(dto.updatedAt),
        deletedAt: null,
      },
    };
  }

  private mapInstallment(dto: InstallmentViewerResponseDto): OmegaViewerInstallmentDetail {
    return {
      kind: 'INSTALLMENT',
      ref: { kind: 'INSTALLMENT', id: dto.id },
      description: dto.description,
      originalValue: dto.originalValue,
      installmentValue: dto.installmentValue,
      installmentNumber: dto.installmentNumber,
      purchaseDate: dto.purchaseDate,
      lastInstallmentDate: dto.lastInstallmentDate,
      creditCardId: dto.creditCardId,
      details: dto.details,
      tagIds: [],
      payerName: null,
      progress: mapProgress(dto.progress),
      payments: dto.paymentTrace.map(mapPaymentTraceLine),
      links: mapRefs(dto.refs),
      audit: {
        createdAt: toDateOnly(dto.createdAt),
        updatedAt: toDateOnly(dto.updatedAt),
        deletedAt: toDateOnly(dto.deletedAt),
      },
    };
  }

  private mapSubscription(dto: SubscriptionViewerResponseDto): OmegaViewerSubscriptionDetail {
    return {
      kind: 'SUBSCRIPTION',
      ref: { kind: 'SUBSCRIPTION', id: dto.id },
      description: dto.description,
      currency: dto.currency,
      state: dto.state === 'PREVIEW' ? 'PREVIEW' : 'PRODUCTION',
      startMonth: dto.startMonth,
      endMonth: dto.endMonth,
      creditCardId: dto.creditCardId,
      details: dto.details,
      tagIds: [],
      payerName: null,
      // Subscription has no Payment/Expense link and no tags in the real DTO — confirmed
      // intentional (Omega Viewer README, decisions table: "Subscription não tem link com
      // Payment/Expense, confirmado esperado").
      links: [],
      audit: {
        createdAt: toDateOnly(dto.createdAt),
        updatedAt: toDateOnly(dto.updatedAt),
        deletedAt: null,
      },
    };
  }

  private mapReservedBudgetMigration(
    dto: ReservedBudgetMigrationViewerResponseDto,
  ): OmegaViewerReservedBudgetMigrationDetail {
    return {
      kind: 'RESERVED_BUDGET_MIGRATION',
      ref: { kind: 'RESERVED_BUDGET_MIGRATION', id: dto.extraBudgetId },
      extraBudgetId: dto.extraBudgetId,
      reservedBudgetId: dto.reservedBudgetId,
      reservedBudgetDescription: dto.reservedBudgetDescription,
      bulletId: dto.bulletId,
      bulletDescription: dto.bulletDescription,
      amount: dto.amount,
      currency: dto.currency,
      effectiveMonth: dto.effectiveMonth,
      description: dto.description,
      // Post-epic code review MAJOR 2: the real DTO DOES carry `reverted`/`revertedAt` — derive
      // `revertable` from `!dto.reverted` instead of hardcoding `true`. Reopening an
      // already-reverted migration must not offer a revert action that only ever 404s/409s. The
      // 409 MigrationNotReversibleException (bullet already spent it) remains a SEPARATE cause,
      // still only surfaced at request time — see the domain type's own doc comment.
      revertable: !dto.reverted,
      reverted: dto.reverted,
      // The reserved budget the migration came from is not itself a viewer kind — only the
      // migration is, so no link is invented FOR THE RESERVED BUDGET (same honesty as
      // mapSubscription's empty links above). That is a different question from whether the
      // DTO's own `refs` should be read at all — it should, exactly like mapExpense/
      // mapInstallment above, since `refs` is the real cross-reference channel (e.g. the N>1
      // migrations fallback documented on the bullet card, RBM-F15).
      links: mapRefs(dto.refs),
      // The real DTO has no createdAt/updatedAt/deletedAt timestamps at all — audit stays
      // hidden entirely, same "null means hidden, not a placeholder" convention documented on
      // OmegaViewerAudit itself.
      audit: null,
    };
  }
}

/**
 * `OmegaViewerAudit.createdAt`/`updatedAt`/`deletedAt` render through `BrDatePipe`, which
 * expects a bare `YYYY-MM-DD` (`LocalDate`-shaped) string and appends its own `T00:00:00Z`
 * — the same convention this project already uses at every other `LocalDate`-from-`Date`
 * call site (`new Date().toISOString().slice(0, 10)`, e.g. `expense-page.ts`). The real
 * Viewer DTOs type these fields as `Instant` (full ISO datetime, e.g.
 * `2026-07-01T10:00:00Z`), so passing them straight through breaks the pipe. Truncating to
 * the date portion here (once, at the mapping boundary) keeps `BrDatePipe` itself untouched
 * — it is shared by 4 other unrelated templates that already pass it real `LocalDate`
 * strings, so widening its own parsing wasn't the right fix.
 */
function toDateOnly(instant: string | null): string | null {
  return instant ? instant.slice(0, 10) : null;
}

/**
 * `refs` already carries a backend-resolved `label` — no extra per-ref fetch needed, unlike
 * the earlier client-side fallback's `fetchInstallmentById`.
 */
function mapRefs(refs: readonly ViewerRefResponseDto[]): OmegaViewerLink[] {
  return refs.map((ref) => ({
    ref: { kind: ref.type, id: ref.id },
    label: ref.label,
  }));
}

function mapProgress(progress: InstallmentProgressResponseDto): OmegaViewerInstallmentProgress {
  return {
    paidInstallments: progress.paidInstallments,
    remainingInstallments: progress.remainingInstallments,
    totalInstallments: progress.totalInstallments,
  };
}

function mapPaymentTraceLine(line: PaymentTraceLineResponseDto): OmegaViewerPayment {
  return {
    id: line.id,
    amount: line.amount,
    paymentDate: line.paymentDate,
    bulletId: line.bulletId,
    bulletDescription: line.bulletDescription,
    reversal: line.reversal,
    reversed: line.reversed,
    payerIds: line.payerIds,
    kind: line.kind,
  };
}
