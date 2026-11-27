import QRCode from 'qrcode';
import { s } from './dom';

/** Black on white with the four-module quiet zone, drawn as SVG so it stays sharp in print. */
export function qrSvg(text: string, className: string): SVGSVGElement {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const quiet = 4;
  const size = modules.size + quiet * 2;
  let path = '';
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (modules.get(row, column)) path += `M${column + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  return s(
    'svg',
    { class: className, viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': 'QR', 'shape-rendering': 'crispEdges' },
    s('rect', { width: size, height: size, fill: '#fff' }),
    s('path', { d: path, fill: '#000' }),
  );
}
