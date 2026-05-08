import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ExpenseDeleteDialogData {
  readonly expenseName: string;
  readonly cost: number;
}

@Component({
  selector: 'app-expense-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './expense-delete-dialog.component.html',
  styleUrl: './expense-delete-dialog.component.scss',
})
export class ExpenseDeleteDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<ExpenseDeleteDialogComponent, boolean>>(
    MatDialogRef,
  );

  protected readonly data = inject<ExpenseDeleteDialogData>(MAT_DIALOG_DATA);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
