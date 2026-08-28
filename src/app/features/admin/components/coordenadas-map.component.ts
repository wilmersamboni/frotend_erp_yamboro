import {
  Component, Input, Output, EventEmitter,
  ViewChild, ElementRef, AfterViewInit, OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';

// La auto-detección de Leaflet del path de sus íconos por defecto (lee el
// background-image de una regla CSS de leaflet.css) se rompe con el bundler
// de Angular — el hashing de assets deja un nombre de archivo que no existe
// en el output (ver angular.json: node_modules/leaflet/dist/images ya se
// copia a assets/leaflet, solo falta decirle a Leaflet que use esa ruta).
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
  iconUrl: 'assets/leaflet/marker-icon.png',
  shadowUrl: 'assets/leaflet/marker-shadow.png',
});

const CENTRO_COLOMBIA: [number, number] = [4.5709, -74.2973];
const ZOOM_SIN_UBICACION = 6;
const ZOOM_CON_UBICACION = 16;

/**
 * Selector de ubicación en mapa (Leaflet + tiles OSM, sin API key) para
 * pares lat/lng — pensado para reemplazar dos inputs numéricos sueltos.
 * Incluye buscador de dirección vía Nominatim (geocodificación gratuita
 * de OpenStreetMap; uso ligero desde el navegador, sin proxy — suficiente
 * para un panel admin de bajo tráfico, no apto para volumen alto).
 */
@Component({
  selector: 'app-coordenadas-map',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="space-y-2">
      <div class="flex gap-2">
        <input
          type="text"
          [(ngModel)]="busqueda"
          (keydown.enter)="buscarDireccion($event)"
          placeholder="Buscar dirección o ciudad…"
          class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
        <button type="button" (click)="buscarDireccion()" [disabled]="buscando"
          class="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
          {{ buscando ? 'Buscando…' : 'Buscar' }}
        </button>
      </div>
      @if (sinResultados) {
        <p class="text-xs text-red-500">No se encontró esa dirección.</p>
      }

      <div #mapContainer class="w-full h-56 rounded-lg border border-gray-200"></div>

      <p class="text-xs text-gray-400">
        Click en el mapa o arrastra el pin para ajustar la ubicación.
        @if (latNum() != null && lngNum() != null) {
          <span class="text-gray-500">Lat: {{ latNum()!.toFixed(6) }}, Lng: {{ lngNum()!.toFixed(6) }}</span>
        }
      </p>
    </div>
  `,
})
export class CoordenadasMapComponent implements AfterViewInit, OnDestroy {
  // El form genérico del panel admin inicializa campos vacíos como ''
  // (no null/undefined), así que hay que aceptar y normalizar eso.
  @Input() lat: number | string | null = null;
  @Input() lng: number | string | null = null;

  private aNumero(v: number | string | null | undefined): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  latNum(): number | null { return this.aNumero(this.lat); }
  lngNum(): number | null { return this.aNumero(this.lng); }
  @Output() latChange = new EventEmitter<number>();
  @Output() lngChange = new EventEmitter<number>();

  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLDivElement>;

  private map?: L.Map;
  private marker?: L.Marker;

  busqueda      = '';
  buscando      = false;
  sinResultados = false;

  ngAfterViewInit(): void {
    // El contenedor vive dentro de un modal recién abierto — se espera un
    // tick para que termine el layout antes de inicializar Leaflet.
    setTimeout(() => this.initMap());
  }

  private initMap(): void {
    const lat = this.latNum();
    const lng = this.lngNum();
    const tieneUbicacion = lat != null && lng != null;
    const centro: [number, number] = tieneUbicacion ? [lat!, lng!] : CENTRO_COLOMBIA;
    const zoom = tieneUbicacion ? ZOOM_CON_UBICACION : ZOOM_SIN_UBICACION;

    this.map = L.map(this.mapContainer.nativeElement).setView(centro, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(this.map);

    if (tieneUbicacion) {
      this.colocarMarker(lat!, lng!, false);
    }

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.colocarMarker(e.latlng.lat, e.latlng.lng);
    });

    // Si el contenedor no tenía su tamaño final al montar (animación del
    // modal, etc.), Leaflet mide mal y deja tiles grises/cortados.
    setTimeout(() => this.map?.invalidateSize(), 150);
  }

  private colocarMarker(lat: number, lng: number, emitir = true): void {
    if (!this.map) return;
    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      this.marker = L.marker([lat, lng], { draggable: true }).addTo(this.map);
      this.marker.on('dragend', () => {
        const pos = this.marker!.getLatLng();
        this.actualizar(pos.lat, pos.lng);
      });
    }
    if (emitir) this.actualizar(lat, lng);
    else { this.lat = lat; this.lng = lng; }
  }

  private actualizar(lat: number, lng: number): void {
    this.lat = lat;
    this.lng = lng;
    this.latChange.emit(Number(lat.toFixed(6)));
    this.lngChange.emit(Number(lng.toFixed(6)));
  }

  async buscarDireccion(e?: Event): Promise<void> {
    e?.preventDefault();
    const consulta = this.busqueda.trim();
    if (!consulta) return;

    this.buscando = true;
    this.sinResultados = false;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(consulta)}`;
      const res  = await fetch(url);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        this.sinResultados = true;
        return;
      }
      const latNum = parseFloat(data[0].lat);
      const lngNum = parseFloat(data[0].lon);
      this.map?.setView([latNum, lngNum], ZOOM_CON_UBICACION);
      this.colocarMarker(latNum, lngNum);
    } catch {
      this.sinResultados = true;
    } finally {
      this.buscando = false;
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
