import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '@/core/apiClient';

// Sama dengan backend/src/features/materials/materials.schema.ts dan ai.schema.ts (PRD §8.3).
export const MATERIAL_MAX_TEXT_CHARS = 15_000;
export const MATERIAL_MAX_PDF_BYTES = 10 * 1024 * 1024;

export type RubricConcept = { id: string; concept: string; definition: string; weight: number };
export type RubricRelation = { fromConceptId: string; toConceptId: string; relation: string };
export type Rubric = {
  materialTitle: string;
  summary: string;
  keyConcepts: RubricConcept[];
  causalRelations: RubricRelation[];
};

export type MaterialSource = 'TEXT' | 'PDF';

export type Material = {
  id: string;
  title: string;
  classId: string | null;
  source: MaterialSource;
  createdAt: string;
  rubric: Rubric;
};

export type MaterialSummary = Omit<Material, 'rubric'> & { conceptCount: number };

export type CreateMaterialResult = { material: Material; rubricCached: boolean };

export const materialsApi = {
  list: (signal?: AbortSignal) =>
    apiRequest<{ materials: MaterialSummary[] }>('/materials', { signal }).then((r) => r.materials),
  get: (id: string, signal?: AbortSignal) =>
    apiRequest<{ material: Material }>(`/materials/${encodeURIComponent(id)}`, { signal }).then((r) => r.material),
  createText: (title: string, content: string) =>
    apiRequest<CreateMaterialResult>('/materials', { method: 'POST', body: { title, content } }),
  createPdf: (title: string, file: File) => {
    const form = new FormData();
    form.append('title', title);
    form.append('file', file);
    return apiRequest<CreateMaterialResult>('/materials', { method: 'POST', body: form });
  },
  fileUrl: (id: string) =>
    apiRequest<{ url: string; expiresInSec: number }>(`/materials/${encodeURIComponent(id)}/file`),
  remove: (id: string) => apiRequest<void>(`/materials/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

/** Pesan untuk user dari error unggah. Pesan backend dipakai untuk 415/422 karena sudah spesifik. */
export function uploadErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Materi gagal dikirim. Coba lagi.';
  switch (err.status) {
    case 0:
      return 'Server REKSA tidak bisa dihubungi. Periksa koneksimu lalu coba lagi.';
    case 413:
      return 'Ukuran PDF lebih dari 10 MB. Pecah per bab lalu unggah lagi.';
    case 415:
    case 422:
      return err.message;
    case 429:
      return 'Kamu sudah mengunggah 20 materi dalam satu jam terakhir. Coba lagi nanti.';
    default:
      return err.status >= 500 ? 'Server sedang bermasalah. Coba lagi sebentar lagi.' : err.message;
  }
}

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: ApiError | Error };

function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    load(controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, reload, setState };
}

export function useMaterials() {
  return useLoad((signal) => materialsApi.list(signal), []);
}

export function useMaterial(id: string | null) {
  return useLoad<Material | null>((signal) => (id ? materialsApi.get(id, signal) : Promise.resolve(null)), [id]);
}

export function formatMaterialDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
