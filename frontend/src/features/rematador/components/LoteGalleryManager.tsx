import { type DragEvent, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import { Dropzone } from '../../../shared/components/Dropzone';
import { ProgressBar } from '../../../shared/components/ProgressBar';
import { normalizeApiError } from '../../../shared/api/errors';
import { useToastStore } from '../../../shared/toast/toastStore';
import { updateLoteImagesRequest, uploadLoteImageRequest } from '../../remates/api';
import type { Lote, LoteImage } from '../../remates/types';
import { validateImageFile } from '../media';
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon } from './icons';

export interface LoteGalleryManagerProps {
  remateId: string;
  lote: Lote;
  /** Se llama después de cada subida/eliminación/reordenamiento persistido con éxito,
   * con el `Lote` ya actualizado -- mismo criterio "avisá, no sepas por qué" que
   * `onChanged` en el resto de este módulo (ver `docs/31-gestion-remates-lotes.md`). */
  onChanged: (lote: Lote) => void;
}

interface PendingUpload {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
}

function sortByOrder(images: LoteImage[]): LoteImage[] {
  return [...images].sort((a, b) => a.order - b.order);
}

function withSequentialOrder(images: LoteImage[]): LoteImage[] {
  return images.map((image, index) => ({ ...image, order: index }));
}

/**
 * Galería multimedia de un lote (Épica 6, Módulo 6.1) -- imagen principal, tira de
 * miniaturas, subida por drag & drop con progreso, marcar principal, eliminar con
 * confirmación, reordenar. Ver docs/32-gestion-multimedia-lotes.md y ADR-035.
 *
 * Deliberadamente "viva": cada acción (subir, eliminar, reordenar, marcar principal)
 * persiste de inmediato con `updateLoteImagesRequest` (el `PATCH` de Lote ya existente
 * desde la Épica 2.2, sin campos nuevos) en vez de esperar a que se cierre el modal --
 * mismo criterio ya usado para el reordenamiento de lotes (ADR-034): actualización
 * optimista, revierte y avisa por toast si el pedido falla.
 */
export function LoteGalleryManager({ remateId, lote, onChanged }: LoteGalleryManagerProps) {
  const [images, setImages] = useState<LoteImage[]>(() => sortByOrder(lote.images));
  useEffect(() => {
    setImages(sortByOrder(lote.images));
  }, [lote.images]);

  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(
    () => () => {
      // Libera los object URLs de previews que quedaran pendientes al desmontar --
      // evita una fuga de memoria si el usuario cierra el modal en medio de una subida.
      pendingUploads.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function persistImages(newImages: LoteImage[]) {
    const previous = imagesRef.current;
    const ordered = withSequentialOrder(newImages);
    setImages(ordered);
    try {
      const updated = await updateLoteImagesRequest(remateId, lote.id, ordered);
      onChanged(updated);
    } catch (err) {
      setImages(previous);
      useToastStore.getState().push('error', normalizeApiError(err).message);
    }
  }

  function handleFiles(files: File[]) {
    const valid: File[] = [];
    for (const file of files) {
      const error = validateImageFile(file);
      if (error) {
        useToastStore.getState().push('error', error);
        continue;
      }
      valid.push(file);
    }
    if (valid.length === 0) return;

    const newPending: PendingUpload[] = valid.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
    }));
    setPendingUploads((prev) => [...prev, ...newPending]);
    void uploadAll(newPending);
  }

  async function uploadAll(pending: PendingUpload[]) {
    const results = await Promise.allSettled(
      pending.map((item) =>
        uploadLoteImageRequest(remateId, lote.id, item.file, (percent) => {
          setPendingUploads((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, progress: percent } : p)),
          );
        }),
      ),
    );

    const successfulUrls: string[] = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successfulUrls.push(result.value.url);
      } else {
        useToastStore.getState().push('error', normalizeApiError(result.reason).message);
      }
    });

    pending.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setPendingUploads((prev) => prev.filter((p) => !pending.some((item) => item.id === p.id)));

    if (successfulUrls.length > 0) {
      const base = imagesRef.current;
      const newImages: LoteImage[] = [
        ...base,
        ...successfulUrls.map((url) => ({ url, order: 0, caption: null })),
      ];
      await persistImages(newImages);
    }
  }

  function handleSetPrimary(index: number) {
    if (index === 0) return;
    const reordered = [...images];
    const [selected] = reordered.splice(index, 1);
    reordered.unshift(selected);
    void persistImages(reordered);
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const reordered = [...images];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    void persistImages(reordered);
  }

  function handleDrop(targetIndex: number) {
    return (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOverIndex(null);
      if (draggedIndex === null || draggedIndex === targetIndex) return;
      const reordered = [...images];
      const [moved] = reordered.splice(draggedIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      void persistImages(reordered);
    };
  }

  function handleConfirmDelete() {
    if (deletingIndex === null) return;
    const reordered = images.filter((_, index) => index !== deletingIndex);
    setDeletingIndex(null);
    void persistImages(reordered);
  }

  const mainImage = images[0];

  return (
    <div className="flex flex-col gap-3">
      {mainImage ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-100">
          <img src={mainImage.url} alt="Imagen principal del lote" className="h-full w-full object-cover" />
        </div>
      ) : (
        <CoverPlaceholder
          className="aspect-video w-full rounded-xl"
          icon={<BoxIcon className="h-12 w-12 text-brand-300" />}
        />
      )}

      {(images.length > 0 || pendingUploads.length > 0) && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <div key={image.url} className="flex w-24 shrink-0 flex-col gap-1">
              <div
                draggable
                onDragStart={() => setDraggedIndex(index)}
                onDragEnter={() => setDragOverIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop(index)}
                onDragEnd={() => {
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                }}
                className={clsx(
                  'relative h-16 w-24 overflow-hidden rounded-lg border-2 transition-colors',
                  index === 0 ? 'border-brand-600' : 'border-transparent hover:border-slate-300',
                  dragOverIndex === index && draggedIndex !== index && 'ring-2 ring-brand-300',
                  draggedIndex === index && 'opacity-40',
                )}
              >
                <button
                  type="button"
                  onClick={() => handleSetPrimary(index)}
                  aria-label={`Marcar imagen ${index + 1} como principal`}
                  aria-pressed={index === 0}
                  className="block h-full w-full cursor-grab active:cursor-grabbing"
                >
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                </button>
                {index === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-brand-600 px-1 text-[10px] font-semibold text-white">
                    Principal
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setDeletingIndex(index)}
                  aria-label={`Eliminar imagen ${index + 1}`}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              </div>
              <div className="flex justify-center gap-1 text-slate-400">
                <button
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  aria-label={`Mover imagen ${index + 1} hacia la izquierda`}
                  className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  disabled={index === images.length - 1}
                  aria-label={`Mover imagen ${index + 1} hacia la derecha`}
                  className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {pendingUploads.map((item) => (
            <div key={item.id} className="flex w-24 shrink-0 flex-col gap-1">
              <div className="h-16 w-24 overflow-hidden rounded-lg border-2 border-slate-200">
                <img src={item.previewUrl} alt="" className="h-full w-full object-cover opacity-60" />
              </div>
              <ProgressBar percent={item.progress} />
            </div>
          ))}
        </div>
      )}

      <Dropzone
        onFiles={handleFiles}
        accept="image/jpeg,image/png,image/webp"
        label="Arrastrá imágenes acá o hacé clic para elegirlas"
        hint="JPG, PNG o WEBP, hasta 5 MB por imagen"
      />

      <ConfirmModal
        isOpen={deletingIndex !== null}
        onClose={() => setDeletingIndex(null)}
        onConfirm={handleConfirmDelete}
        title="Eliminar imagen"
        message="¿Seguro que querés eliminar esta imagen del lote? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}
