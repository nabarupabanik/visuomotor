import axios from 'axios';

let inMemoryAccessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  inMemoryAccessToken = token;
};

export const getAccessToken = (): string | null => {
  return inMemoryAccessToken;
};

// Create Axios API instance
export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach in-memory JWT bearer token
api.interceptors.request.use((config) => {
  if (inMemoryAccessToken && config.headers) {
    config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  }
  return config;
});

// Response interceptor: handle 401 with token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const storedRefreshToken = localStorage.getItem('wl_refresh_token');
      if (storedRefreshToken) {
        try {
          const res = await axios.post('/api/auth/refresh', {}, {
            headers: {
              Authorization: `Bearer ${storedRefreshToken}`,
            },
          });
          const newAccessToken = res.data.access_token;
          setAccessToken(newAccessToken);
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        } catch (refreshErr) {
          localStorage.removeItem('wl_refresh_token');
          setAccessToken(null);
          return Promise.reject(refreshErr);
        }
      }
    }
    return Promise.reject(error);
  }
);

export interface UserProfile {
  id: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  message: string;
  user: UserProfile;
  access_token: string;
  refresh_token: string;
}

export const authService = {
  async register(email: string, password: string): Promise<AuthResponse> {
    const res = await api.post<AuthResponse>('/auth/register', { email, password });
    setAccessToken(res.data.access_token);
    localStorage.setItem('wl_refresh_token', res.data.refresh_token);
    return res.data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await api.post<AuthResponse>('/auth/login', { email, password });
    setAccessToken(res.data.access_token);
    localStorage.setItem('wl_refresh_token', res.data.refresh_token);
    return res.data;
  },

  async getMe(): Promise<{ user: UserProfile }> {
    const res = await api.get<{ user: UserProfile }>('/auth/me');
    return res.data;
  },

  async logout(): Promise<void> {
    setAccessToken(null);
    localStorage.removeItem('wl_refresh_token');
  },
};
