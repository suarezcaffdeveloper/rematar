import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Dropzone } from '../../../shared/components/Dropzone';
import { ProgressBar } from '../../../shared/components/ProgressBar';
import { uploadRemateCoverImageRequest } from '../../remates/api';
import { validateImageFile } from '../media';

export interface RemateCoverImageFieldProps {
  /** `RemateFormValues.cover_image_url` -- una URL de texto, igual que antes (ver
   * `remateForm.ts`). Este componente nunca la edita a mano: la reemplaza por la URL
   * que devuelve la subida, o la vacía al quitar la imagen. */
  value: string;
  onChange: (url: string) => void;
  error?: string;
}

/**
 * Selector de imagen de portada por archivo (refinamiento visual, item 6) --
 * reemplaza el campo de "URL de imagen de portada" que exigía tipear un link ya
 * alojado en otro lado. Mismo patrón de dos pasos que `LoteGalleryManager` (Épica 6,
 * Módulo 6.1): sube el archivo elegido (`uploadRemateCoverImageRequest`, con
 * preview local mientras sube) y solo actualiza `cover_image_url` -- lo que se
 * envía al crear/guardar el remate sigue siendo una URL de texto, sin cambios en
 * `buildRemateFormPayload` ni en el backend (`POST`/`PATCH /remates`).
 *
 * Sin `remateId`: se sube ANTES de que el remate exista (modo creación) o al editar
 * uno existente, con el mismo endpoint -- ver `RemateService.upload_cover_image`.
 */
export function RemateCoverImageField({ value, onChange, error }: RemateCoverImageFieldProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  function handleFiles(files: File[]) {
    const file = files[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const localPreview = URL.createObjectURL(file);
    objectUrlRef.current = localPreview;
    setPreviewUrl(localPreview);
    setUploadError(null);
    setUploadProgress(0);

    uploadRemateCoverImageRequest(file, setUploadProgress)
      .then(({ url }) => onChange(url))
      .catch((err: unknown) => {
        setUploadError(normalizeApiError(err).message);
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
        setPreviewUrl(null);
      })
      .finally(() => setUploadProgress(null));
  }

  function handleRemove() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setUploadError(null);
    onChange('');
  }

  const displayUrl = previewUrl ?? (value.trim() || null);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-700">Imagen de portada</span>

      {displayUrl ? (
        <div className="relative aspect-video w-full max-w-xs overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          <img src={displayUrl} alt="Vista previa de la portada" className="h-full w-full object-cover" />
          {uploadProgress !== null ? (
            <div className="absolute inset-x-0 bottom-0 bg-slate-900/60 p-2">
              <ProgressBar percent={uploadProgress} label="Subiendo…" />
            </div>
          ) : (
            <button
              type="button"
              onClick={handleRemove}
              aria-label="Quitar imagen de portada"
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/60 text-white transition-colors hover:bg-slate-900/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <Dropzone
          onFiles={handleFiles}
          accept="image/jpeg,image/png,image/webp"
          multiple={false}
          label="Arrastrá una imagen acá o hacé clic para elegirla"
          hint="JPG, PNG o WEBP, hasta 5 MB -- desde tu computadora o celular"
        />
      )}

      {(uploadError ?? error) && <p className="text-sm text-danger-600">{uploadError ?? error}</p>}
    </div>
  );
}
