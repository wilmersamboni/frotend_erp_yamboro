import { Component, inject } from '@angular/core';
import { MaterialesKardexComponent } from '../administration/kardex.component';

/** Kardex es de solo lectura: admin e instructor comparten exactamente la
 * misma pantalla; el backend conserva el recorte de datos por usuario. */
@Component({
  standalone: true,
  imports: [MaterialesKardexComponent],
  template: `<app-materiales-kardex />`,
})
export class KardexEntryComponent {}
