import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';

import { PendingReviewPage } from '../../pages/pending-review-page/pending-review-page';
import { PendingReview } from '../../models/pending-review';
import { PendingReviewService } from '../../services/pending-review.service';
import { PendingReviewDialogComponent } from './pending-review-dialog.component';

class FakePendingReviewService {
  readonly pendingReviews$ = new BehaviorSubject<readonly PendingReview[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly error$ = new BehaviorSubject<string | null>(null);
  loadAll = vi.fn();
}

describe('PendingReviewDialogComponent', () => {
  let fixture: ComponentFixture<PendingReviewDialogComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PendingReviewDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PendingReviewService, useClass: FakePendingReviewService },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(PendingReviewDialogComponent);
    fixture.detectChanges();
  });

  it('hosts the whole PendingReviewPage inside the dialog frame, not a re-implemented wrapper', () => {
    const hostedPage = fixture.debugElement.query((node) => node.componentInstance instanceof PendingReviewPage);
    expect(hostedPage).toBeTruthy();
  });

  it('renders a close action in the dialog actions row', () => {
    const closeButtons = fixture.nativeElement.querySelectorAll('[mat-dialog-close]');
    expect(closeButtons.length).toBeGreaterThan(0);
  });

  it('makes the dialog draggable via cdkDrag, scoped to the header as the drag handle', () => {
    const root = fixture.nativeElement.querySelector('.prd__root');
    expect(root?.hasAttribute('cdkdrag')).toBe(true);

    const handle = fixture.nativeElement.querySelector('.prd__head');
    expect(handle?.hasAttribute('cdkdraghandle')).toBe(true);

    // Body/content is not itself a drag handle — dragging by scrolling/reading the list
    // must not move the dialog.
    const body = fixture.nativeElement.querySelector('.prd__body');
    expect(body?.hasAttribute('cdkdraghandle')).toBe(false);
  });
});
