import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
});

@Pipe({
  name: 'brDate',
  pure: true,
})
export class BrDatePipe implements PipeTransform {
  transform(value: string | null): string {
    if (!value) {
      return 'Sem fechamento';
    }

    return formatter.format(new Date(`${value}T00:00:00Z`));
  }
}
