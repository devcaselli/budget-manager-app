import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface TagDeleteDialogData {
  readonly name: string;
  /** Warns the user that direct subtags are deleted too (backend cascades server-side). */
  readonly subtagCount: number;
}

@Component({
  selector: 'app-tag-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './tag-delete-dialog.component.html',
  styleUrl: './tag-delete-dialog.component.scss',
})
export class TagDeleteDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<TagDeleteDialogComponent, boolean>>(
    MatDialogRef,
  );

  protected readonly data = inject<TagDeleteDialogData>(MAT_DIALOG_DATA);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
