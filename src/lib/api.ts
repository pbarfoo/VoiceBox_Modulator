import { invoke } from "@tauri-apps/api/core";

let cachedBase: string | null = null;

async function baseUrl(): Promise<string> {
  if (cachedBase) return cachedBase;
  try {
    const port = await invoke<number>("backend_port");
    cachedBase = `http://127.0.0.1:${port}`;
  } catch {
    cachedBase = "/api";
  }
  return cachedBase;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await baseUrl();
  const url = base === "/api" ? `/api${path}` : `${base}${path}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export interface EngineStatus {
  loaded: boolean;
  loading: boolean;
  load_error: string | null;
  device: string;
  model: string;
  engine_id: string;
  torch_available: boolean;
}

export interface Profile {
  id: string;
  name: string;
  description: string;
  language: string;
  ref_path: string;
  created_at: string;
}

export interface Conversion {
  id: string;
  source_path: string;
  output_path: string;
  profile_id: string | null;
  profile_name: string | null;
  engine: string;
  created_at: string;
}

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface Job {
  id: string;
  status: JobStatus;
  stage: string;
  progress: number;
  error: string | null;
  result: Conversion | null;
}

export const api = {
  health:       () => req<{ status: string; app: string }>("/health"),
  engineStatus: () => req<EngineStatus>("/engine/status"),
  loadEngine:   () => req<EngineStatus>("/engine/select?engine=seedvc", { method: "POST" }),
  unloadEngine: () => req<EngineStatus>("/engine/unload", { method: "POST" }),

  profiles:      () => req<Profile[]>("/profiles"),
  createProfile: (form: FormData) => req<Profile>("/profiles", { method: "POST", body: form }),
  deleteProfile: (id: string) => req<{ deleted: string }>(`/profiles/${id}`, { method: "DELETE" }),

  history:   () => req<Conversion[]>("/history"),
  jobStatus: (jobId: string) => req<Job>(`/jobs/${jobId}`),

  async startConvert(form: FormData): Promise<Job> {
    return req<Job>("/convert", { method: "POST", body: form });
  },

  async audioUrl(conversionId: string): Promise<string> {
    const base = await baseUrl();
    return base === "/api" ? `/api/audio/${conversionId}` : `${base}/audio/${conversionId}`;
  },
};
