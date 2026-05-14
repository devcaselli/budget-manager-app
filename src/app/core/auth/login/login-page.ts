import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AuthService } from '@core/auth/auth.service';

interface PwRule {
  readonly label: string;
  readonly met: boolean;
}

@Component({
  selector: 'app-login-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly activeTab = signal<'login' | 'signup'>('login');
  protected readonly loginError = signal('');
  protected readonly signupError = signal('');
  protected readonly loginForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected readonly signupForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
    confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  // Signals driven by FormControl.valueChanges — computed() reacts to these
  private readonly pwValue = signal('');
  private readonly confirmValue = signal('');

  protected readonly pwRules = computed<PwRule[]>(() => {
    const pw = this.pwValue();
    const confirm = this.confirmValue();
    return [
      { label: '8+ chars',  met: pw.length >= 8 },
      { label: 'Uppercase', met: /[A-Z]/.test(pw) },
      { label: 'Lowercase', met: /[a-z]/.test(pw) },
      { label: 'Number',    met: /[0-9]/.test(pw) },
      { label: 'Symbol',    met: /[^A-Za-z0-9]/.test(pw) },
      { label: 'Matches',   met: pw.length > 0 && pw === confirm },
    ];
  });

  protected readonly pwStrengthPercent = computed(() =>
    Math.round((this.pwRules().filter((r) => r.met).length / 6) * 100),
  );

  protected readonly pwStrengthColor = computed(() => {
    const pct = this.pwStrengthPercent();
    if (pct < 34) return 'var(--ew-bad)';
    if (pct < 67) return 'var(--ew-acc)';
    return 'var(--ew-teal)';
  });

  constructor() {
    this.signupForm.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.pwValue.set(v));

    this.signupForm.controls.confirmPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.confirmValue.set(v));
  }

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
  }

  protected onLoginSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginError.set('Please enter a valid email and password.');
      return;
    }

    const { email, password } = this.loginForm.getRawValue();
    this.loginError.set('');

    this.authService
      .login(email, password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.router.navigate(['/dashboard']),
        error: (err: Error) => this.loginError.set(err.message),
      });
  }

  protected onSignupSubmit(): void {
    const { email, password, confirmPassword } = this.signupForm.getRawValue();

    if (this.signupForm.invalid) {
      this.signupError.set('Please fill in all fields correctly.');
      return;
    }

    if (password !== confirmPassword) {
      this.signupError.set('Passwords do not match.');
      return;
    }

    const unmetRules = this.pwRules().filter((r) => !r.met && r.label !== 'Matches');
    if (unmetRules.length > 0) {
      this.signupError.set('Password does not meet all requirements.');
      return;
    }

    this.signupError.set('');

    this.authService
      .register(email, password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.router.navigate(['/dashboard']),
        error: (err: Error) => this.signupError.set(err.message),
      });
  }
}
