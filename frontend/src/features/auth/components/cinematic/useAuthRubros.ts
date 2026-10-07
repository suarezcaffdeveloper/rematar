import { useEffect, useState } from 'react';
import { AUTH_RUBROS } from './authRubros';
import { useAutoRotate } from './useAutoRotate';

/** Cuánto está cada rubro (y su foto de fondo) en pantalla antes de pasar al siguiente. */
export const AUTH_ROTATE_MS = 3000;

/**
 * Rotación de rubros compartida por login, registro y recuperación de contraseña. Precarga todas
 * las fotos al montar para que el crossfade nunca espere una descarga (con una foto externa lenta
 * el fondo se veía "trabado" en la anterior).
 */
export function useAuthRubros() {
  const [isPaused, setIsPaused] = useState(false);
  const [index, setIndex] = useAutoRotate(AUTH_RUBROS.length, AUTH_ROTATE_MS, isPaused);

  useEffect(() => {
    AUTH_RUBROS.forEach(({ photo }) => {
      const image = new Image();
      image.src = photo.url;
    });
  }, []);

  return { rubro: AUTH_RUBROS[index], index, setIndex, isPaused, setIsPaused };
}
