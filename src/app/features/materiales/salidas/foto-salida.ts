/*
 * Foto de cada material de consumo de una salida (decisión del dueño, 2026-10-07): se toma al llenar el
 * formulario, es obligatoria y va en la columna "Registro Fotografico" de la hoja de San Agustín. La póliza
 * (devolutivos) no lleva foto.
 */

/** Lado mayor de la foto que se sube: suficiente para la celda del Excel e imprimirla, sin pesar varios MB. */
const LADO_MAXIMO = 1280;
const CALIDAD_JPEG = 0.82;

/** Foto lista para `wb.addImage`, con su tamaño real para no deformarla. */
export interface FotoExcel {
  buffer: ArrayBuffer;
  extension: 'jpeg' | 'png';
  ancho: number;
  alto: number;
}

/** Tamaño que entra en una caja de `maxAncho × maxAlto` sin deformar ni agrandar. */
export function encajar(ancho: number, alto: number, maxAncho: number, maxAlto: number): { width: number; height: number } {
  if (!(ancho > 0) || !(alto > 0)) return { width: maxAncho, height: maxAlto };
  const escala = Math.min(maxAncho / ancho, maxAlto / alto, 1);
  return { width: Math.round(ancho * escala), height: Math.round(alto * escala) };
}

/** Decodifica la imagen respetando la orientación de la cámara (EXIF). */
async function decodificar(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('No se pudo leer la foto. Toma otra o elige una imagen JPG o PNG.');
  }
}

/**
 * Achica la foto en el navegador antes de subirla (JPEG, lado mayor 1280 px). Una foto de celular pesa
 * 3-8 MB; así queda en ~150-300 kB y el Excel no se infla.
 */
export async function achicarFoto(archivo: Blob): Promise<Blob> {
  const img = await decodificar(archivo);
  const { width, height } = encajar(img.width, img.height, LADO_MAXIMO, LADO_MAXIMO);
  const lienzo = document.createElement('canvas');
  lienzo.width = width;
  lienzo.height = height;
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('El navegador no pudo procesar la foto.');
  ctx.fillStyle = '#ffffff'; // un PNG con transparencia no queda negro al pasar a JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  img.close();
  return new Promise((ok, falla) =>
    lienzo.toBlob((b) => (b ? ok(b) : falla(new Error('El navegador no pudo procesar la foto.'))), 'image/jpeg', CALIDAD_JPEG),
  );
}

/** La foto bajada del servidor, con su tamaño, para ponerla en el Excel. */
export async function fotoParaExcel(blob: Blob): Promise<FotoExcel> {
  const img = await decodificar(blob);
  const foto: FotoExcel = {
    buffer: await blob.arrayBuffer(),
    extension: blob.type === 'image/png' ? 'png' : 'jpeg',
    ancho: img.width,
    alto: img.height,
  };
  img.close();
  return foto;
}
