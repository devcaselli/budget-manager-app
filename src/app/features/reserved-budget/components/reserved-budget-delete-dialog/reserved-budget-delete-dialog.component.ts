import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ReservedBudgetDeleteDialogData {
  readonly description: string;
}

@Component({
  selector: 'app-reserved-budget-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatIconModule],
  templateUrl: './reserved-budget-delete-dialog.component.html',
  styleUrl: './reserved-budget-delete-dialog.component.scss',
})
export class ReservedBudgetDeleteDialogComponent {
  private readonly dialogRef = inject<
    MatDialogRef<ReservedBudgetDeleteDialogComponent, boolean>
  >(MatDialogRef);

  protected readonly data = inject<ReservedBudgetDeleteDialogData>(MAT_DIALOG_DATA);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
