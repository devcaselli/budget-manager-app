import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ShellComponent } from '@layout/shell/shell.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ShellComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
