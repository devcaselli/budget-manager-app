import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ToastService } from './toast.service';

describe('ToastService', () => {
  it('opens a MatSnackBar with the message, a Dismiss action, and the ew-toast panel class', () => {
    const open = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: MatSnackBar, useValue: { open } }],
    });

    const service = TestBed.inject(ToastService);
    service.show('Expense created');

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      'Expense created',
      'Dismiss',
      expect.objectContaining({
        panelClass: ['ew-toast'],
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      }),
    );
  });
});
