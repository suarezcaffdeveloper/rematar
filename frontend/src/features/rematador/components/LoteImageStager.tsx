import { type DragEvent, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import { Dropzone } from '../../../shared/components/Dropzone';
import { useToastStore } from '../../../shared/toast/toastStore';
import { validateImageFile } from '../media';

export interface StagedImage {
  id: string;
  file: File;
  previewUrl: string;
}

export interface LoteImageStagerProps {
  value: StagedImage[];
  onChange: (images: StagedImage[]) => void;
}

/**
 * Selector de imágenes de lote mientras todavía se está creando (rediseño UX del flujo de
 * creación de lotes) -- staging 100% local, sin ninguna llamada de red: junta los
 * archivos elegidos con una vista previa inmediata (`URL.createObjectURL`, igual criterio
 * que `RemateCoverImageField`/`LoteGalleryManager`) y deja reordenarlos/quitarlos antes de
 * guardar. El primero de la lista es la imagen principal. La subida real ocurre recién al
 * crear el lote (`LoteFormModal`, con `uploadLoteImageRequest`/`updateLoteImagesRequest`,
 * el mismo par de endpoints que ya usa `LoteGalleryManager` en modo edición) -- acá no se
 * sube nada todavía, por eso no hay barra de progreso ni confirmación de borrado.
 */
export function LoteImageStager({ value, onChange }: LoteImageStagerProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(
    () => () => {
      // Libera los object URLs pendientes al desmontar (modal cerrado sin guardar).
      valueRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    },
    [],
  );

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

    const staged: StagedImage[] = valid.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    onChange([...value, ...staged]);
  }

  function handleRemove(index: number) {
    const removed = value[index];
    URL.revokeObjectURL(removed.previewUrl);
    onChange(value.filter((_, i) => i !== index));
  }

  function handleSetPrimary(index: number) {
    if (index === 0) return;
    const reordered = [...value];
    const [selected] = reordered.splice(index, 1);
    reordered.unshift(selected);
    onChange(reordered);
  }

  function handleDrop(targetIndex: number) {
    return (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOverIndex(null);
      if (draggedIndex === null || draggedIndex === targetIndex) return;
      const reordered = [...value];
      const [moved] = reordered.splice(draggedIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      onChange(reordered);
    };
  }

  const mainImage = value[0];

  return (
    <div className="flex flex-col gap-3">
      {mainImage ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-surface-subtle">
          <img src={mainImage.previewUrl} alt="Imagen principal del lote" className="h-full w-full object-cover" />
        </div>
      ) : (
        <CoverPlaceholder
          className="aspect-video w-full rounded-xl"
          icon={<BoxIcon className="h-12 w-12 text-brand-300" />}
        />
      )}

      {value.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {value.map((item, index) => (
            <div
              key={item.id}
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
                'relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-colors',
                index === 0 ? 'border-brand-600' : 'border-transparent hover:border-line-strong',
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
                <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
              </button>
              {index === 0 && (
                <span className="absolute left-1 top-1 rounded bg-brand-600 px-1 text-[10px] font-semibold text-white">
                  Principal
                </span>
              )}
              <button
                type="button"
                onClick={() => handleRemove(index)}
                aria-label={`Quitar imagen ${index + 1}`}
                className="absolute right-1 top-1 rounded-full bg-slate-900/60 p-1 text-white hover:bg-slate-900/80"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dropzone
        onFiles={handleFiles}
        accept="image/jpeg,image/png,image/webp"
        label="Arrastrá imágenes acá o hacé clic para elegirlas"
        hint="JPG, PNG o WEBP, hasta 5 MB por imagen -- se suben al guardar el lote"
      />
    </div>
  );
}
