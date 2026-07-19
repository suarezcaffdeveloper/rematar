import { type ChangeEvent, type DragEvent, useId, useRef, useState } from 'react';
import clsx from 'clsx';

export interface DropzoneProps {
  /** Se llama con la lista de archivos soltados o elegidos -- validar formato/tamaño es
   * responsabilidad de quien la usa, este componente no conoce ningún dominio. */
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  hint?: string;
}

/**
 * Área genérica de arrastrar-y-soltar archivos (drag & drop nativo del navegador, sin
 * librería -- mismo criterio ya establecido para el reordenamiento de lotes, ver
 * ADR-034) con un `<input type="file">` oculto como alternativa siempre disponible por
 * teclado/mouse/touch (clickeando el área completa). Sin ningún conocimiento de
 * imágenes/lotes/formatos -- reutilizable por cualquier feature futura que necesite
 * subir archivos.
 */
export function Dropzone({
  onFiles,
  accept,
  multiple = true,
  disabled = false,
  label = 'Arrastrá archivos acá o hacé clic para elegirlos',
  hint,
}: DropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onFiles(Array.from(fileList));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    handleFiles(event.dataTransfer.files);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(event.target.files);
    event.target.value = '';
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={clsx(
        'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
        disabled && 'cursor-not-allowed opacity-50',
        isDragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-slate-400',
      )}
    >
      <p className="text-sm font-medium text-slate-600">{label}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleInputChange}
        className="sr-only"
      />
    </div>
  );
}
