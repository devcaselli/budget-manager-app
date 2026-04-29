import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

@Pipe({
  name: 'brlCurrency',
})
export class BrlCurrencyPipe implements PipeTransform {
  transform(value: number): string {
    return formatter.format(value);
  }
}
