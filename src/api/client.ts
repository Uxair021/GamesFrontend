import axios from "axios";

const TOKEN_KEY = "texas-slots-token";

function resolveApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;

  if (envUrl) {
    return envUrl.replace(/\/+$/, "");
  }

  // Production
  if (import.meta.env.PROD) {
    return "https://gameback.dexacode.online";
  }

  // Local development
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