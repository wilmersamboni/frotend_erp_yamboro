import { ApplicationConfig, provideZoneChangeDetection, LOCALE_ID } from '@angular/core';
import { MessageService, ConfirmationService } from 'primeng/api';
import { signal } from '@angular/core';  // ← agrega signal
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { debugInterceptor } from './core/interceptors/debug.interceptor';
import { environment } from '../environments/environment';
import { provideLottieOptions } from 'ngx-lottie';
import player from 'lottie-web';
import { provideTaiga } from '@taiga-ui/core';
import { tuiAssetsPathProvider } from '@taiga-ui/core/tokens';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { TUI_LANGUAGE } from '@taiga-ui/i18n/tokens';
import { TUI_SPANISH_LANGUAGE } from '@taiga-ui/i18n/languages/spanish';
import {
  LucideAngularModule,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar,
  Clock,
  Sunrise,
  Sun,
  Moon,
  Download,
  Search,
  Pencil,
  Trash2,
  X,
  Users,
  BookOpen,
  Info,
  Save,
  Check,
  Loader,
  MessageCircle,
  CheckCircle,
  RefreshCw,
  ChevronUp,
  User,
  Building2,
  ArrowRight,
  MessageSquare,
  ShieldCheck,
  Inbox,
  MapPin,
  CalendarClock,
  AlertTriangle,
  ClipboardCheck,
  Umbrella,
  HelpCircle,
  PanelRightClose,
  PanelRightOpen,
  UserPlus,
  GraduationCap,
  ClipboardPlus,
  LayoutGrid,
  Copy,
  Hourglass,
  Send,
  AlertCircle,
  Ban,
  Bell,
  CalendarX,
  Facebook,
  Filter,
  GitBranch,
  List,
  Music2,
  Paperclip,
  Play,
  Radio,
  SearchX,
  Shuffle,
  Square,
  Twitter,
  XCircle,
  Youtube,
  ZoomIn,
} from 'lucide-angular';

import { importProvidersFrom } from '@angular/core';


registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
  provideZoneChangeDetection({ eventCoalescing: true }),
  provideRouter(routes),
  provideHttpClient(withInterceptors([
    authInterceptor,
    errorInterceptor,
    // Solo en desarrollo: loguea respuestas no-JSON/no-ok en consola.
    ...(environment.production ? [] : [debugInterceptor]),
  ])),
  provideAnimationsAsync(),

  importProvidersFrom(
  LucideAngularModule.pick({
    Plus,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Calendar,
    Clock,
    Sunrise,
    Sun,
    Moon,
    Download,
    Search,
    Pencil,
    Trash2,
    X,
    Users,
    BookOpen,
    Info,
    Save,
    Check,
    Loader,
    MessageCircle,
    CheckCircle,
    RefreshCw,
    ChevronUp,
    User,
    Building2,
    ArrowRight,
    MessageSquare,
    ShieldCheck, Inbox,
    MapPin,
    CalendarClock,
    AlertTriangle,
    ClipboardCheck,
    Umbrella, HelpCircle, PanelRightOpen, PanelRightClose,
    UserPlus, GraduationCap, ClipboardPlus, LayoutGrid,
    Copy, Hourglass, Send,
    AlertCircle, Ban, Bell, CalendarX, Facebook, Filter, GitBranch, List,
    Music2, Paperclip, Play, Radio, SearchX, Shuffle, Square, Twitter,
    XCircle, Youtube, ZoomIn,
  })
),

  providePrimeNG({ theme: { preset: Aura } }),
    { provide: LOCALE_ID, useValue: 'es' },
    {
      provide: TUI_LANGUAGE,
      useFactory: () => signal(TUI_SPANISH_LANGUAGE),  // ← signal()
    },
    ...provideTaiga({ scrollbars: 'native' }),
    tuiAssetsPathProvider('assets/taiga-ui/icons'),
    provideLottieOptions({ player: () => player }),
    MessageService,   // ← proveedor global para ToastService
    ConfirmationService,   // ← proveedor global; el <p-confirmDialog> vive en app.ts (Ronda 6)
  ],
};