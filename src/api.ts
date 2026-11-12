import type { Dataset } from "./data";
export const hosted = import.meta.env.MODE === "hosted";
export const privateHost =
  hosted || (location.hostname === "127.0.0.1" && location.port === "4178");
export type Status = {
  authenticated: boolean;
  connected?: boolean;
  canSync?: boolean;
  hasData?: boolean;
  lastSync?: string;
  error?: string;
  setupRequired?: boolean;
  syncing?: boolean;
};
export async function api<T>(route: string, body?: object): Promise<T> {
  const response = await fetch("/api/" + route, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "요청을 완료할 수 없습니다.");
  return result;
}
export const readData = () => api<Dataset>("data");
