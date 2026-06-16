import { Pipe, PipeTransform } from '@angular/core';

import { formatBrl } from '@shared/utils/currency';

@Pipe({
  name: 'brlCurrency',
  pure: true,
})
export class BrlCurrencyPipe implements PipeTransform {
  transform(value: number): string {
    return formatBrl(value);
  }
}
