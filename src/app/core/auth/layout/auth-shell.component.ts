import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Shell-less layout for public auth routes (login, and future confirm-email /
 * forgot-password / reset-password / check-your-email pages from Temas C/D/E).
 *
 * Renders the full-screen split overlay — brand/marketing hero on the left,
 * a centered content panel on the right — using only the global `.ew-auth-*`
 * classes and `--ew-*` tokens already defined in `styles.scss`. Each auth
 * page supplies its own tabs/form/content through the nested `<router-outlet>`.
 *
 * This is a layout ROUTE (mirrors `ShellComponent`'s `path: ''` + children
 * pattern), not a wrapper component pages include directly — new public
 * routes are added as children of this route in `app.routes.ts`.
 */
@Component({
  selector: 'app-auth-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.scss',
})
export class AuthShellComponent {}
