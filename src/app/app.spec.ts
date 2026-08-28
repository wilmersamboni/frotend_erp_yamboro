import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { provideTaiga } from '@taiga-ui/core';
import { provideLottieOptions } from 'ngx-lottie';
import { AppComponent } from './app';

describe('AppComponent', () => {
  beforeEach(async () => {
    // jsdom no trae matchMedia y el token de dark-mode de Taiga lo necesita
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as any;
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideNoopAnimations(),
        MessageService,
        ...provideTaiga(),
        provideLottieOptions({ player: () => ({}) as any }),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
