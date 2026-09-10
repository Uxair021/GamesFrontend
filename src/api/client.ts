import axios from "axios";

const TOKEN_KEY = "texas-slots-token";

/**
 * VITE_API_URL is normally "http://localhost:4000" for local dev, which only resolves
 * correctly when the page itself is loaded from "localhost" — opened from a phone via
 * the dev machine's LAN IP instead, "localhost" would point at the phone. In that case,
 * fall back to talking to the same host the page was loaded from.
 */
function resolveApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  const pageIsLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (envUrl && (pageIsLocalhost || !envUrl.includes("localhost"))) {
    return envUrl;
  }
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

export const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
