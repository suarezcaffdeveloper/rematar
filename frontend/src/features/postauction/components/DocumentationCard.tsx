import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { Card } from '../../../shared/components/Card';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { Dropzone } from '../../../shared/components/Dropzone';
import { Modal } from '../../../shared/components/Modal';
import { ProgressBar } from '../../../shared/components/ProgressBar';
import { Select } from '../../../shared/components/Select';
import { normalizeApiError } from '../../../shared/api/errors';
import { formatDateTime, formatFileSize } from '../../../shared/lib/format';
import { useToastStore } from '../../../shared/toast/toastStore';
import { FileTextIcon } from '../../remates/components/icons';
import { uploadVentaDocumentoRequest, deleteVentaDocumentoRequest } from '../api';
import { DOCUMENT_TYPE_LABELS } from '../labels';
import { validateDocumentFile } from '../media';
import type { PostAuctionDocument, PostAuctionDocumentType } from '../types';

export interface DocumentationCardProps {
  caseId: string;
  documents: PostAuctionDocument[];
  /** Se llama tras cada subida/eliminación persistida con éxito -- el padre vuelve a
   * pedir el detalle completo del caso (`reload`), mismo criterio que
   * `StatusChangeForm`/`NoteForm` en vez de que este componente mantenga su propia copia
   * de `documents`. */
  onChanged: () => void;
}

interface PendingUpload {
  id: string;
  name: string;
  progress: number;
}

function isImage(contentType: string): boolean {
  return contentType.startsWith('image/');
}

/**
 * "Documentación" (sección 11, vista de empresa) -- reemplaza el placeholder visual por
 * subida real de archivos: varios a la vez (comprobante, factura, guía de envío, etc.),
 * listados chico/resumido con miniatura o ícono según el tipo, y un modal para abrirlos
 * completos (imagen embebida, PDF en `<iframe>`) sin salir de la pantalla. Mismo patrón
 * de subida con progreso que `LoteGalleryManager` (Épica 6, Módulo 6.1): cada archivo se
 * sube por separado con `onUploadProgress`, el padre refresca el caso completo al
 * terminar en vez de que este componente arme su propia copia optimista -- acá cada
 * subida ya persiste sola (a diferencia de la galería de imágenes, no hace falta un
 * segundo `PATCH` para "confirmar" el array final).
 */
export function DocumentationCard({ caseId, documents, onChanged }: DocumentationCardProps) {
  const [documentType, setDocumentType] = useState<PostAuctionDocumentType>('otro');
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [previewDocument, setPreviewDocument] = useState<PostAuctionDocument | null>(null);
  const [deletingDocument, setDeletingDocument] = useState<PostAuctionDocument | null>(null);

  function handleFiles(files: File[]) {
    const valid: File[] = [];
    for (const file of files) {
      const error = validateDocumentFile(file);
      if (error) {
        useToastStore.getState().push('error', error);
        continue;
      }
      valid.push(file);
    }
    if (valid.length === 0) return;
    void uploadAll(valid);
  }

  async function uploadAll(files: File[]) {
    const pending: PendingUpload[] = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      progress: 0,
    }));
    setPendingUploads((prev) => [...prev, ...pending]);

    const results = await Promise.allSettled(
      files.map((file, index) =>
        uploadVentaDocumentoRequest(caseId, file, documentType, (percent) => {
          setPendingUploads((prev) =>
            prev.map((p) => (p.id === pending[index].id ? { ...p, progress: percent } : p)),
          );
        }),
      ),
    );

    let anySucceeded = false;
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        anySucceeded = true;
      } else {
        useToastStore.getState().push('error', normalizeApiError(result.reason).message);
      }
    });

    setPendingUploads((prev) => prev.filter((p) => !pending.some((item) => item.id === p.id)));
    if (anySucceeded) onChanged();
  }

  async function handleConfirmDelete() {
    if (!deletingDocument) return;
    try {
      await deleteVentaDocumentoRequest(caseId, deletingDocument.id);
      setDeletingDocument(null);
      setPreviewDocument(null);
      onChanged();
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Documentación</h2>
      <p className="mb-4 text-xs text-slate-500">
        Comprobante de pago, factura, documentación de envío y entrega.
      </p>

      {(documents.length > 0 || pendingUploads.length > 0) && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {documents.map((document) => (
            <button
              key={document.id}
              type="button"
              onClick={() => setPreviewDocument(document)}
              className="group flex flex-col items-start gap-1.5 rounded-lg border border-slate-200 p-2 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50"
            >
              <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded bg-slate-100">
                {isImage(document.content_type) ? (
                  <img src={document.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <FileTextIcon className="h-6 w-6 text-slate-400" />
                )}
              </div>
              <p className="w-full truncate text-xs font-medium text-slate-700">
                {document.original_filename}
              </p>
              <div className="flex w-full items-center justify-between gap-1">
                <Badge variant="neutral" className="min-w-0 truncate">
                  {DOCUMENT_TYPE_LABELS[document.document_type]}
                </Badge>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {formatFileSize(document.file_size)}
                </span>
              </div>
            </button>
          ))}

          {pendingUploads.map((item) => (
            <div key={item.id} className="flex flex-col gap-1.5 rounded-lg border border-dashed border-slate-300 p-2">
              <div className="flex h-16 w-full items-center justify-center rounded bg-slate-50">
                <FileTextIcon className="h-6 w-6 text-slate-300" />
              </div>
              <p className="w-full truncate text-xs text-slate-500">{item.name}</p>
              <ProgressBar percent={item.progress} />
            </div>
          ))}
        </div>
      )}

      <div className="mb-2">
        <Select
          label="Tipo de documento a subir"
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value as PostAuctionDocumentType)}
        >
          {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <Dropzone
        onFiles={handleFiles}
        accept="application/pdf,image/jpeg,image/png,image/webp"
        label="Arrastrá archivos acá o hacé clic para elegirlos"
        hint="PDF, JPG, PNG o WEBP, hasta 10 MB por archivo"
      />

      <Modal
        isOpen={previewDocument !== null}
        onClose={() => setPreviewDocument(null)}
        title={previewDocument?.original_filename ?? 'Documento'}
        size="lg"
        footer={
          previewDocument && (
            <>
              <Button
                variant="danger-outline"
                onClick={() => setDeletingDocument(previewDocument)}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                Eliminar
              </Button>
              <a
                href={previewDocument.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Abrir en una pestaña nueva
              </a>
            </>
          )
        }
      >
        {previewDocument && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge>{DOCUMENT_TYPE_LABELS[previewDocument.document_type]}</Badge>
              <span>{formatFileSize(previewDocument.file_size)}</span>
              <span>·</span>
              <span>{formatDateTime(previewDocument.created_at)}</span>
            </div>
            {isImage(previewDocument.content_type) ? (
              <img
                src={previewDocument.url}
                alt={previewDocument.original_filename}
                className="max-h-[65vh] w-full rounded-lg object-contain"
              />
            ) : (
              <iframe
                src={previewDocument.url}
                title={previewDocument.original_filename}
                className="h-[65vh] w-full rounded-lg border border-slate-200"
              />
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={deletingDocument !== null}
        onClose={() => setDeletingDocument(null)}
        onConfirm={handleConfirmDelete}
        title="Eliminar documento"
        message={`¿Seguro que querés eliminar "${deletingDocument?.original_filename}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
      />
    </Card>
  );
}
