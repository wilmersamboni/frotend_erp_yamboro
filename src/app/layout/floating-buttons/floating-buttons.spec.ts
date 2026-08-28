import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideLottieOptions } from 'ngx-lottie';

import { FloatingButtons } from './floating-buttons';

describe('FloatingButtons', () => {
  let component: FloatingButtons;
  let fixture: ComponentFixture<FloatingButtons>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FloatingButtons],
      providers: [
        provideLottieOptions({
          // Player fake: cualquier método del AnimationItem es un no-op
          player: () => ({ loadAnimation: () => new Proxy({}, { get: () => () => undefined }) }) as any,
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FloatingButtons);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
