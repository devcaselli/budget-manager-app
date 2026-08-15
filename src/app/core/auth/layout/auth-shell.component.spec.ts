import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AuthShellComponent } from './auth-shell.component';

/** Stand-in routed page — proves the shell projects arbitrary child route content. */
@Component({ template: '<p class="stub-content">stub page</p>' })
class StubChildPage {}

describe('AuthShellComponent — static structure', () => {
  let fixture: ComponentFixture<AuthShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthShellComponent],
      providers: [provideRouter([{ path: 'stub', component: StubChildPage }])],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthShellComponent);
    fixture.detectChanges();
  });

  it('renders the hero brand mark and name', () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.ew-auth-hero-mark')?.textContent?.trim()).toBe('B');
    expect(root.querySelector('.ew-auth-hero-name')?.textContent).toContain('Budget');
    expect(root.querySelector('.ew-auth-hero-name span')?.textContent).toContain(
      'Personal Ledger',
    );
  });

  it('renders the hero quote heading and copy', () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.ew-auth-hero-h')).toBeTruthy();
    expect(root.querySelector('.ew-auth-hero-p')).toBeTruthy();
  });

  it('wraps hero and content panels in the .ew-auth split container', () => {
    const root = fixture.nativeElement as HTMLElement;
    const container = root.querySelector('.ew-auth');

    expect(container).toBeTruthy();
    expect(container?.querySelector('.ew-auth-hero')).toBeTruthy();
    expect(container?.querySelector('.ew-auth-form-side')).toBeTruthy();
  });
});

describe('AuthShellComponent — child route projection', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: AuthShellComponent,
            children: [{ path: 'stub', component: StubChildPage }],
          },
        ]),
      ],
    }).compileComponents();
  });

  it('renders the activated child route content inside .ew-auth-form-side', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/stub', AuthShellComponent);
    harness.detectChanges();

    const formSide = harness.routeNativeElement?.querySelector(
      '.ew-auth-form-side',
    ) as HTMLElement;

    expect(formSide).toBeTruthy();
    expect(formSide.querySelector('.stub-content')?.textContent).toBe('stub page');
  });
});
