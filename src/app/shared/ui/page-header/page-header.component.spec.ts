import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PageHeaderComponent } from './page-header.component';

@Component({
  imports: [PageHeaderComponent],
  template: `
    <app-page-header
      title="Dashboard financeiro"
      subtitle="Resumo do mes"
      icon="monitoring"
    />
  `,
})
class PageHeaderHostComponent {}

@Component({
  imports: [PageHeaderComponent],
  template: '<app-page-header title="Wallets" />',
})
class MinimalPageHeaderHostComponent {}

describe('PageHeaderComponent', () => {
  it('should render required title and optional subtitle/icon', async () => {
    await TestBed.configureTestingModule({
      imports: [PageHeaderHostComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(PageHeaderHostComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent?.trim()).toBe('Dashboard financeiro');
    expect(compiled.querySelector('p')?.textContent?.trim()).toBe('Resumo do mes');
    expect(compiled.querySelector('mat-icon')?.textContent?.trim()).toBe('monitoring');
  });

  it('should omit optional subtitle and icon when not provided', async () => {
    await TestBed.configureTestingModule({
      imports: [MinimalPageHeaderHostComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(MinimalPageHeaderHostComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent?.trim()).toBe('Wallets');
    expect(compiled.querySelector('p')).toBeNull();
    expect(compiled.querySelector('mat-icon')).toBeNull();
  });
});
