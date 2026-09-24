import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app';

// La bienvenida completa pertenece al acceso. Con sesión persistida, el
// splash solo acompaña la recarga sin hacer esperar al usuario.
const SPLASH_LOGIN_DURATION_MS = 1100;
const SPLASH_SESSION_DURATION_MS = 210;

const tieneSesionGuardada = Boolean(
  localStorage.getItem('user') || localStorage.getItem('tenant_admin_token'),
);
const splashDurationMs = tieneSesionGuardada
  ? SPLASH_SESSION_DURATION_MS
  : SPLASH_LOGIN_DURATION_MS;

function ocultarSplash(): void {
  const splash = document.getElementById('app-splash');
  if (!splash) return;

  splash.classList.add('is-leaving');
  window.setTimeout(() => splash.remove(), 350);
}

bootstrapApplication(AppComponent, appConfig)
  .then(() => {
    // Angular ya dejó lista la ruta inicial detrás del splash. El login recibe
    // una bienvenida perceptible; una sesión existente, solo un fade breve.
    window.setTimeout(() => requestAnimationFrame(ocultarSplash), splashDurationMs);
  })
  .catch(err => console.error(err));
