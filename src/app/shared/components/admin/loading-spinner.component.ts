import { Component, input } from '@angular/core';
import { LoadingSkeletonComponent, LoadingSkeletonVariant } from '../loading-skeleton.component';

@Component({
  selector: 'app-admin-loading-spinner',
  standalone: true,
  imports: [LoadingSkeletonComponent],
  template: `
    <div class="py-5">
      <app-loading-skeleton [variant]="variant()" [label]="mensaje()" />
    </div>
  `,
})
export class AdminLoadingSpinnerComponent {
  mensaje = input('Cargando...');
  variant = input<LoadingSkeletonVariant>('detail');
}
