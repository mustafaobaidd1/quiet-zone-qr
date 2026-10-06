/** Export the undamaged symbol (with its quiet zone) as SVG or PNG files. */

import type { QrSymbol } from './qr/encoder';
import { pngScale, symbolRgba, symbolSvg } from './qr/render';

export function exportName(symbol: QrSymbol, ext: 'svg' | 'png'): string {
  return `quiet-zone-qr-v${symbol.version}-${symbol.level}.${ext}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadSvg(symbol: QrSymbol): string {
  const name = exportName(symbol, 'svg');
  const svg = symbolSvg(symbol.modules, symbol.size, `QR code: ${symbol.text.slice(0, 120)}`);
  download(new Blob([svg], { type: 'image/svg+xml' }), name);
  return name;
}

export function downloadPng(symbol: QrSymbol): Promise<string> {
  const name = exportName(symbol, 'png');
  const scale = pngScale(symbol.size);
  const img = symbolRgba(symbol.modules, symbol.size, scale);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D is not available in this browser'));
  const data = new ImageData(img.width, img.height);
  data.data.set(img.data);
  ctx.putImageData(data, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The browser could not create the PNG'));
        return;
      }
      download(blob, name);
      resolve(name);
    }, 'image/png');
  });
}
