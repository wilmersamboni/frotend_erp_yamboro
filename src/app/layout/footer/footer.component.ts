import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <footer
      class="w-full backdrop-blur bg-[#00304D] text-white border-t border-[#39A900]/40 py-8"
    >
      <div class="max-w-6xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
        
        <!-- Columna 1 -->
        <div>
          <p class="text-sm text-white/80">
            © {{ year }} EPSAS — Todos los derechos reservados
          </p>
        </div>

        <!-- Columna 2 -->
        <div class="flex justify-center gap-6">
          <a href="#" class="text-white hover:text-[#39A900] transition">
            <lucide-icon name="facebook" class="w-5 h-5"></lucide-icon>
          </a>
          <a href="#" class="text-white hover:text-[#39A900] transition">
            <lucide-icon name="twitter" class="w-5 h-5"></lucide-icon>
          </a>
          <a href="#" class="text-white hover:text-[#39A900] transition">
            <lucide-icon name="music-2" class="w-5 h-5"></lucide-icon> <!-- TikTok -->
          </a>
          <a href="#" class="text-white hover:text-[#39A900] transition">
            <lucide-icon name="youtube" class="w-5 h-5"></lucide-icon>
          </a>
        </div>

        <!-- Columna 3 -->
        <div class="flex flex-col items-end text-right">
          <p class="text-sm flex items-center gap-2 text-white/80">
            <lucide-icon name="map-pin" class="w-4 h-4 text-[#39A900]"></lucide-icon>
            Calle 123 #45-67, Bogotá, Colombia
          </p>

          <div class="flex gap-4 mt-2">
            <a
              href="/privacidad"
              class="text-sm text-white/80 hover:text-[#39A900] transition"
            >
              Política de privacidad
            </a>
            <a
              href="/terminos"
              class="text-sm text-white/80 hover:text-[#39A900] transition"
            >
              Términos de uso
            </a>
          </div>
        </div>

      </div>
    </footer>
  `
})
export class FooterComponent {
  year = new Date().getFullYear();
}
