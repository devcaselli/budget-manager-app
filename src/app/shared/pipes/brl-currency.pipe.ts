import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

@Pipe({
  name: 'brlCurrency',
  pure: true,
})
export class BrlCurrencyPipe implements PipeTransform {
  transform(value: number): string {
    return formatter.format(value);
  }
}
