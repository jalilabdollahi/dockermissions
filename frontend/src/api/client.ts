export const apiBase = "";
const tokenKey = "dockermissions.token";
const playerNameKey = "dockermissions.playerName";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = window.localStorage.getItem(tokenKey);
  const playerName = window.localStorage.getItem(playerNameKey);
  const response = await fetch(`${apiBase}${url}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(playerName ? { "X-Player-Name": playerName } : {}),
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  request,
  tokenKey,
  playerNameKey
};
