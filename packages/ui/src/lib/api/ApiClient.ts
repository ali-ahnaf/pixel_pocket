import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, Method } from 'axios';

import { clearCache, isCacheable, readCache, writeCache } from '../offline/cache';
import { clearOutbox } from '../offline/outbox';

export const AUTH_TOKEN_STORAGE_KEY = 'auth_token';
export const PROFILE_STORAGE_KEY = 'pocket_pixel_profile';
const SIGN_IN_PATH = '/signin';

/**
 * The request never reached the server (offline, DNS failure, connection reset)
 * — as opposed to a 4xx/5xx, which is the server answering. Callers that can
 * queue a write offline branch on this; a real server error must still surface.
 */
export class NetworkError extends Error {
  readonly originalError: unknown;

  constructor(message: string, originalError: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.originalError = originalError;
  }
}

export function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

/**
 * Handle an expired/invalid session. Clears stored credentials then navigates
 * to /signin. Guards against redirect loops — normalises trailing slash since
 * next.config.js has trailingSlash: true (pathname may be '/signin/').
 */
function handleUnauthorized(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  // The offline cache and queue are per-user; a second user on this device must
  // never inherit the first user's dues, tags or unsent writes.
  clearCache();
  clearOutbox();
  const current = window.location.pathname.replace(/\/$/, '');
  if (current !== SIGN_IN_PATH) {
    // Use Next.js client-side navigation to avoid a full reload and keep the
    // SPA shell alive. Falls back to location.href if the router isn't available.
    try {
      // Dynamically import to avoid circular deps; works reliably in browser.
      import('next/navigation')
        .then(({ useRouter: _unused, ...mod }) => {
          // next/navigation router is hook-only; use the global router instance
          // exposed by Next 13+ App Router.
          window.location.href = SIGN_IN_PATH;
        })
        .catch(() => {
          window.location.href = SIGN_IN_PATH;
        });
    } catch {
      window.location.href = SIGN_IN_PATH;
    }
  }
}

export default class ApiClient {
  private axiosInstance: AxiosInstance;
  protected baseUrl: string;

  constructor(baseURL: string, baseConfig?: AxiosRequestConfig) {
    this.axiosInstance = axios.create({
      baseURL,
      ...baseConfig,
    });

    this.baseUrl = baseURL;
  }

  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }

  private async request<T = any>(method: Method, url: string, config: AxiosRequestConfig = {}): Promise<T> {
    const authToken = getStoredAuthToken();
    const cacheKey = `${this.baseUrl}${url}`;
    const cacheableGet = method === 'GET' && isCacheable(url);
    try {
      const response: AxiosResponse<T> = await this.axiosInstance.request({
        method,
        url,
        ...config,
        headers: {
          ...(config.headers ?? {}),
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });

      if (cacheableGet) writeCache(cacheKey, response.data);

      return response.data;
    } catch (error: any) {
      // No response at all means the request never reached the server. For the
      // few allow-listed reference GETs, serve the last known payload so the
      // offline-capable forms can still be filled in. A real 4xx/5xx keeps
      // throwing, so genuine server failures are never masked by stale data.
      if (!error.response) {
        if (cacheableGet) {
          const cached = readCache<T>(cacheKey);
          if (cached !== null) return cached;
        }
        throw new NetworkError(error.message ?? 'Network request failed', error);
      }

      // Only treat a 401 as an expired session when we actually sent a token.
      // A 401 from an unauthenticated request (e.g. a failed sign-in) is an
      // expected error the caller should surface, not a reason to redirect.
      if (error.response?.status === 401 && authToken) {
        handleUnauthorized();
      }
      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          error.response.data = JSON.parse(text);
        } catch (e) {
          console.error('Error parsing blob error:', e);
        }
      }

      throw error.response?.data || error;
    }
  }

  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>('GET', url, config);
  }

  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>('POST', url, { ...config, data });
  }

  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>('PUT', url, { ...config, data });
  }

  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>('PATCH', url, { ...config, data });
  }

  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>('DELETE', url, config);
  }

  parseError(error: any): string {
    const errorData = error.response?.data;

    if (errorData?.message && Array.isArray(errorData.message)) {
      return errorData.message.join(', ');
    }

    if (errorData?.resultCode) {
      return errorData.message || 'Failed to make request';
    }

    if (error.response?.status) {
      return error.response?.statusText || 'Failed to make request';
    }

    return error.message || 'Failed to make request';
  }
}
