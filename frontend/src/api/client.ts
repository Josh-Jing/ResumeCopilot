const API_BASE = '/api';

export interface ResumeListItem {
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ResumeSection {
  id: string;
  title: string;
  content: string;
}

export interface ResumeContent {
  version: 2;
  sections: Record<string, ResumeSection>;
  section_order: string[];
}

export interface ResumeDetail {
  name: string;
  template_html: string;
  content: ResumeContent;
  fields_in_template: string[];
  meta: { name: string; created_at: string; updated_at: string };
}

export interface ResumeNameOperationResult {
  status: string;
  name: string;
  old_name?: string;
  source_name?: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.detail ? `: ${body.detail}` : '';
    } catch {
      detail = '';
    }
    throw new Error(`${url} failed (${res.status})${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function listResumes(): Promise<ResumeListItem[]> {
  return request(`${API_BASE}/resumes`);
}

export async function getResume(name: string): Promise<ResumeDetail> {
  return request(`${API_BASE}/resumes/${encodeURIComponent(name)}`);
}

export async function createResume(name: string): Promise<{ name: string; status: string }> {
  return request(`${API_BASE}/resumes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function updateContent(name: string, content: ResumeContent): Promise<{ status: string }> {
  return request(`${API_BASE}/resumes/${encodeURIComponent(name)}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(content),
  });
}

export async function deleteResume(name: string): Promise<{ status: string }> {
  return request(`${API_BASE}/resumes/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export async function copyResume(name: string, newName?: string): Promise<ResumeNameOperationResult> {
  return request(`${API_BASE}/resumes/${encodeURIComponent(name)}/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newName ? { new_name: newName } : {}),
  });
}

export async function renameResume(name: string, newName: string): Promise<ResumeNameOperationResult> {
  return request(`${API_BASE}/resumes/${encodeURIComponent(name)}/rename`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: newName }),
  });
}

export type PdfFitMode = 'natural' | 'expand' | 'compact' | 'overflow';

export async function exportPdf(name: string, fitMode?: PdfFitMode): Promise<Blob> {
  const res = await fetch(`${API_BASE}/resumes/${encodeURIComponent(name)}/export-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fitMode && fitMode !== 'natural' ? { smart_one_page: true, fit_mode: fitMode } : {}),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.detail ? ` ${body.detail}` : '';
    } catch {
      detail = '';
    }
    throw new Error(`exportPdf: ${res.status}${detail}`);
  }
  return res.blob();
}
