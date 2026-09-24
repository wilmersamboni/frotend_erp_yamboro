import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Item, MaterialesApiService } from "../data-access/materiales-api.service";


interface LineaParaElegir{
    id_producto: string;
    nombre:string;
    cantidad:number;
    opciones:Item[];
    elegidos:string[]
}

@Component({
    selector:'app-elegir-placas-asignacion-modal',
    standalone:true,
    imports: [FormsModule],
    template: `
        @if(abierto) {
            <div class= "fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)= "cancelar()">
                <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
                    <div class="flex items-center justify-between mb-5">
                        <h2 class="text-lg font-bold text-gray-800"> Elegir placas a asignar</h2>
                        <button (click)="cancelar()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">x</button>
                    </div>

                    @if(loading){
                        <p class="text-sm text-gray-400 py-6 text-center"> Cargando items disponibles...</p>
                    } @else{
                        <div class="flex rounded-xl border border-gray-200 bg-gray-50 p-1 mb-5">
                            <button type="button" (click)="modo = 'auto'" class="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors" [class.bg-white]="modo === 'auto'" [class.shadow-sm]="modo === 'auto'" 
                            [class.text-gray-800]="modo === 'auto'" [class.text-gray-400]="modo !== 'auto'"> Automatico</button>

                            <button type="button" (click)="modo = 'manual'"
                              class="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                              [class.bg-white]="modo === 'manual'" [class.shadow-sm]="modo === 'manual'"
                              [class.text-gray-800]="modo === 'manual'" [class.text-gray-400]="modo !== 'manual'">
                              Elegir placas
                            </button>

                        </div>
                        @if(modo === 'auto'){
                            <p class="text-xs text-gray-400 mb-4">
                                El sistema elige automaticamente las primeras unidades de cada producto.
                            </p>
                        }@else {
                            <p class="text-xs text-gray-400 mb-4"> Elige exactamente la cantidad pedida de cada linea</p>
                            <div class="space-y-4">
                                @for(linea of lineasParaElegir; track linea.id_producto){
                                    <div class="rounded-xl border border-gray-100 p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <p class="text-sm font-semibold rounded-full px-2 py-0.5">{{linea.nombre}}</p>
                                            <span class= "text=[11px] font-semibold rounded-full px-2 py-05" [class.bg-green-50]="linea.elegidos.length === linea.cantidad" [class.text-green-700]="linea.elegidos.length === linea.cantidad" [class.bg-amber-50]="linea.elegidos.length === linea.cantidad">
                                                {{linea.elegidos.length}} / {{linea.cantidad}}
                                            </span>
                                        </div>
                                        @if(linea.opciones.length === 0) {
                                            <p class="text-xs text-red-500"> No hay unidades disponibles de este producto.</p> 
                                        }@else{
                                            <div class=" grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                                                @for (item of linea.opciones; track item.id_item) {
                                                    <label class="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg border cursor-pointer transition-colors" 
                                                    [class.border-[#39A900]]="estaElegido(linea, item.id_item)"
                                                    [class.bg-green-50]="estaElegido(linea, item.id_item)"
                                                    [class.border-gray-200]="!estaElegido(linea, item.id_item)"
                                                    [class.opacity-40]="!estaElegido(linea, item.id_item) && linea.elegidos.length >= linea.cantidad"> 
                                                <input type="checkbox" class="accent-[#39A900]"
                                                [checked]="estaElegido(linea, item.id_item)"
                                                [disabled]="!estaElegido(linea, item.id_item) && linea.elegidos.length >= linea.cantidad"
                                                (change)="toggleItem(linea, item.id_item)"
                                                />

                                                <span class="font-mono truncate">{{item.placa_sena || item.codigo_sku || 'Sin placa'}} </span>
                                                
                                                </label>
                                                }

                                            </div>
                                        }
                                    </div>
                                }
                            </div>
                        }

                        <div class=" flex justify-end gap-2 mt-6">
                            <button (click)="cancelar()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"> Cancelar </button>

                            <button (click)="confirmar()" [disabled]="modo === 'manual' && !manualCompleto" class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors" style="background-color: #39A900"> Confirmar </button>
                    </div>
                    }

                </div>
            </div> 
                }

    `
})

export class ElegirPlacasAsignacionModalComponent implements OnChanges {
    @Input() abierto = false
    @Input({ required:true}) lineas!:{id_producto:string, nombre:string, cantidad:number}[]
    @Output() cerrado = new EventEmitter<void>();
    @Output() confirmado = new EventEmitter<{id_producto: string, id_items:string[]}[] | undefined>();

    modo: 'auto' | 'manual' = 'auto';
    loading = false;
    lineasParaElegir: LineaParaElegir[] = [];

    constructor(private api: MaterialesApiService){}

    ngOnChanges(): void {
        if(this.abierto){
            this.modo = 'auto'
            this.prepararLineas()
        }
    }

    private async prepararLineas():Promise<void>{
        this.loading = true;
        try {
            this.lineasParaElegir = await Promise.all(
                this.lineas.map(async (l)=>{
                    const items = await this.api.listarItems(l.id_producto);
                    return {...l, opciones: items.filter((i)=> i.estado === 'DISPONIBLE'), elegidos: [] as string[]};
                })
            )
        } finally{
            this.loading = false
        }
    }

    estaElegido(linea: LineaParaElegir, idItem:string): boolean {
        return linea.elegidos.includes(idItem)
    }

    toggleItem(linea: LineaParaElegir, idItem:string):void {
        const idx= linea.elegidos.indexOf(idItem);
        if(idx >=0){
            linea.elegidos.splice(idx, 1);
        }else if (linea.elegidos.length < linea.cantidad) {
            linea.elegidos.push(idItem)
        }
    }

    get manualCompleto(): boolean {
        return this.lineasParaElegir.every((l)=>l.elegidos.length === l.cantidad);
    }

    cancelar(): void{
        this.cerrado.emit()
    }

    confirmar():void{
        if(this.modo === 'auto'){
            this.confirmado.emit(undefined)
        return
        }
        this.confirmado.emit(this.lineasParaElegir.map((l)=> ({id_producto: l.id_producto, id_items: l.elegidos})))
    }
}