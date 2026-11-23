import type { Job, JobDetail, MarketOption, MarketScope, Paginated, Resume, SeniorityTier, UserPreferences, WorkArrangement } from '@jobapp/shared';
import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * API base URL. By default we reach the API on the same host that serves the JS bundle (Metro),
 * port 4000: that is "localhost" in the iOS Simulator and your Mac's LAN IP on a real phone.
 */
function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const hostUri = Constants.expoConfig?.hostUri; // e.g. "192.168.1.20:8081"
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const API_URL = resolveBaseUrl();

let currentUserId: string | null = null;
export function setApiUser(id: string | null) {
  currentUserId = id;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string>) };
  if (currentUserId) headers['X-User-Id'] = currentUserId;
  let body = init.body;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(0, 'network', `Can't reach the server at ${API_URL}. Is the API running?`);
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ApiError(res.status, err.error ?? 'error', err.message ?? `Request failed (${res.status})`);
  }
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

// ---------------------------------------------------------------- types
export type Profile = UserPreferences & { id: string };

export interface StoredResume {
  id: string;
  resume: Resume;
  hasOriginalFile: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UploadResult extends StoredResume {
  warnings: string[];
  detectedYearsExperience: number;
}

export interface BulletRecommendation {
  experienceId: string;
  bulletIndex: number;
  bullet: string;
  reasons: string[];
  relatedJobTerms: string[];
}

export interface MatchAudit {
  jobId: string;
  score: number;
  skillScore: number;
  experienceScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  unevidencedSkills: string[];
  resumeYears: number;
  requiredYears: number | null;
  experienceGapYears: number;
  recommendations: BulletRecommendation[];
}

export interface TailorResult {
  original: string;
  suggestion: string;
  changes: string[];
  considerIfTrue: string[];
  mode: 'rules' | 'llm';
}

export interface ExportResult {
  url: string;
  expiresAt: string;
  fileName: string;
  paper: 'Letter' | 'A4';
  bytes: number;
  tailoredResumeId: string | null;
  applyUrl: string | null;
}

export interface JobFilters {
  q?: string;
  maxExperience?: number;
  market: MarketScope;
  country?: string | null;
  city?: string | null;
  workTypes: WorkArrangement[];
  seniority?: SeniorityTier[];
  postedWithinDays?: number;
}

// ---------------------------------------------------------------- endpoints
export const api = {
  createUser: () => request<Profile>('/api/users', { method: 'POST' }),
  me: () => request<Profile>('/api/users/me'),
  updateMe: (patch: Partial<UserPreferences>) => request<Profile>('/api/users/me', { method: 'PUT', json: patch }),

  markets: () => request<MarketOption[]>('/api/markets'),

  jobs: (f: JobFilters, page: number) => {
    const p = new URLSearchParams({ page: String(page), page_size: '20', market: f.market });
    if (f.q?.trim()) p.set('q', f.q.trim());
    if (f.maxExperience !== undefined) p.set('max_experience', String(f.maxExperience));
    if (f.market !== 'global' && f.country) p.set('country', f.country);
    if (f.market === 'city' && f.city) p.set('city', f.city);
    if (f.workTypes.length && f.workTypes.length < 3) p.set('work_type', f.workTypes.join(','));
    if (f.seniority?.length) p.set('seniority', f.seniority.join(','));
    if (f.postedWithinDays) p.set('posted_within_days', String(f.postedWithinDays));
    return request<Paginated<Job>>(`/api/jobs?${p}`);
  },
  job: (id: string) => request<JobDetail>(`/api/jobs/${id}`),
  audit: (jobId: string, body: { resumeId?: string; resume?: Resume }) =>
    request<MatchAudit>(`/api/jobs/${jobId}/match-audit`, { method: 'POST', json: body }),

  resumes: () => request<StoredResume[]>('/api/resumes'),
  createResume: (resume: Resume) => request<StoredResume>('/api/resumes', { method: 'POST', json: { resume } }),
  saveResume: (id: string, resume: Resume) => request<StoredResume>(`/api/resumes/${id}`, { method: 'PUT', json: { resume } }),
  tailor: (resumeId: string, jobId: string, text: string) =>
    request<TailorResult>(`/api/resumes/${resumeId}/tailor-bullet`, { method: 'POST', json: { jobId, text } }),
  exportPdf: (resumeId: string, body: { resume?: Resume; jobId?: string }) =>
    request<ExportResult>(`/api/resumes/${resumeId}/export-pdf`, { method: 'POST', json: body }),
  previewHtml: (resumeId: string, resume: Resume) =>
    request<string>(`/api/resumes/${resumeId}/preview-html`, { method: 'POST', json: { resume } }),

  /** Multipart upload of a picked PDF/DOCX (expo/fetch + expo-file-system File, per SDK 58 docs). */
  uploadResume: async (fileUri: string): Promise<UploadResult> => {
    const form = new FormData();
    form.append('file', new File(fileUri) as unknown as Blob);
    const headers: Record<string, string> = {};
    if (currentUserId) headers['X-User-Id'] = currentUserId;
    let res;
    try {
      res = await expoFetch(`${API_URL}/api/resumes/upload`, { method: 'POST', body: form, headers });
    } catch {
      throw new ApiError(0, 'network', `Can't reach the server at ${API_URL}.`);
    }
    const data = (await res.json().catch(() => ({}))) as UploadResult & { error?: string; message?: string };
    if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Upload failed');
    return data;
  },
};
