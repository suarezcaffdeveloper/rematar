/**
 * Llamadas HTTP del feature Post-Remate (Épica 7, Módulo 7.5). Ver
 * docs/41-gestion-post-remate.md.
 */

import { apiClient } from '../../shared/api/client';
import type { Page } from '../../shared/api/types';
import type {
  PostAuctionCase,
  PostAuctionCaseDetail,
  PostAuctionDocumentType,
  PostAuctionListFilters,
  StatusChangeRequest,
} from './types';

function toQueryParams(filters: PostAuctionListFilters, page: number, pageSize: number) {
  const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
  if (filters.status) params.status = filters.status;
  if (filters.remate_id) params.remate_id = filters.remate_id;
  if (filters.search) params.search = filters.search;
  return params;
}

export async function fetchVentasAdjudicadasRequest(
  filters: PostAuctionListFilters,
  page: number,
  pageSize: number,
): Promise<Page<PostAuctionCase>> {
  const { data } = await apiClient.get<Page<PostAuctionCase>>('/postauction/ventas', {
    params: toQueryParams(filters, page, pageSize),
  });
  return data;
}

export async function fetchVentaDetailRequest(caseId: string): Promise<PostAuctionCaseDetail> {
  const { data } = await apiClient.get<PostAuctionCaseDetail>(`/postauction/ventas/${caseId}`);
  return data;
}

export async function changeVentaEstadoRequest(
  caseId: string,
  body: StatusChangeRequest,
): Promise<PostAuctionCaseDetail> {
  const { data } = await apiClient.patch<PostAuctionCaseDetail>(
    `/postauction/ventas/${caseId}/estado`,
    body,
  );
  return data;
}

export async function addVentaNotaRequest(
  caseId: string,
  note: string,
): Promise<PostAuctionCaseDetail> {
  const { data } = await apiClient.post<PostAuctionCaseDetail>(
    `/postauction/ventas/${caseId}/notas`,
    { note },
  );
  return data;
}

/** Sube un documento adjunto a una venta adjudicada -- devuelve el caso completo (con el
 * documento nuevo ya en `documents` y una entrada de timeline), mismo criterio de "la
 * mutación devuelve el detalle entero" que `changeVentaEstadoRequest`/`addVentaNotaRequest`,
 * así el llamador no necesita un segundo pedido para refrescar la pantalla. */
export async function uploadVentaDocumentoRequest(
  caseId: string,
  file: File,
  documentType: PostAuctionDocumentType,
  onProgress?: (percent: number) => void,
): Promise<PostAuctionCaseDetail> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('document_type', documentType);
  const { data } = await apiClient.post<PostAuctionCaseDetail>(
    `/postauction/ventas/${caseId}/documentos`,
    formData,
    {
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    },
  );
  return data;
}

export async function deleteVentaDocumentoRequest(
  caseId: string,
  documentId: string,
): Promise<PostAuctionCaseDetail> {
  const { data } = await apiClient.delete<PostAuctionCaseDetail>(
    `/postauction/ventas/${caseId}/documentos/${documentId}`,
  );
  return data;
}

export async function fetchMisComprasRequest(
  filters: PostAuctionListFilters,
  page: number,
  pageSize: number,
): Promise<Page<PostAuctionCase>> {
  const { data } = await apiClient.get<Page<PostAuctionCase>>('/postauction/mis-compras', {
    params: toQueryParams(filters, page, pageSize),
  });
  return data;
}

export async function fetchMiCompraDetailRequest(caseId: string): Promise<PostAuctionCaseDetail> {
  const { data } = await apiClient.get<PostAuctionCaseDetail>(
    `/postauction/mis-compras/${caseId}`,
  );
  return data;
}
