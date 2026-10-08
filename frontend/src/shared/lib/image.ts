const CLOUDINARY_UPLOAD_SEGMENT = '/res.cloudinary.com/';

/**
 * Pide a Cloudinary una versión del tamaño justo y en el mejor formato soportado
 * (`f_auto,q_auto,w_<ancho>`) en vez del original. Cualquier otra URL (disco local en
 * desarrollo, `blob:` de previews, `data:`, assets estáticos) vuelve sin cambios, y una
 * URL de Cloudinary que ya tiene transformaciones tampoco se toca.
 *
 * `width` va en píxeles CSS; se duplica para pantallas retina (`dpr`).
 */
export function optimizedImage(url: string | null | undefined, width: number): string {
  if (!url) return '';
  if (!url.includes(CLOUDINARY_UPLOAD_SEGMENT)) return url;
  const marker = '/image/upload/';
  const index = url.indexOf(marker);
  if (index === -1) return url;
  const rest = url.slice(index + marker.length);
  // Si el primer segmento no es una versión (`v123`) ni parte del public_id, ya hay transformaciones.
  if (/^[a-z]{1,3}_[^/]*\//.test(rest) && !/^v\d+\//.test(rest)) return url;
  const transform = `f_auto,q_auto,c_limit,w_${Math.round(width * 2)}`;
  return `${url.slice(0, index + marker.length)}${transform}/${rest}`;
}
