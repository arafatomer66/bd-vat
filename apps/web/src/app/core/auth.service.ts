import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from './api-base';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: 'OWNER' | 'ACCOUNTANT' | 'VIEWER';
}
export interface AuthCompany {
  id: string;
  name: string;
  bin: string;
}
interface AuthResponse {
  token: string;
  user: AuthUser;
  company: AuthCompany;
}

const TOKEN_KEY = 'bdvat.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<AuthUser | null>(null);
  readonly company = signal<AuthCompany | null>(null);
  readonly isAuthenticated = computed(() => !!this.user());
  readonly canWrite = computed(() => {
    const r = this.user()?.role;
    return r === 'OWNER' || r === 'ACCOUNTANT';
  });

  private loaded?: Promise<void>;

  constructor(private readonly http: HttpClient) {}

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  async signup(body: {
    companyName: string;
    bin: string;
    tin?: string;
    name?: string;
    email: string;
    password: string;
  }) {
    const res = await firstValueFrom(this.http.post<AuthResponse>(`${API_BASE}/api/auth/signup`, body));
    this.apply(res);
  }

  async login(email: string, password: string) {
    const res = await firstValueFrom(
      this.http.post<AuthResponse>(`${API_BASE}/api/auth/login`, { email, password })
    );
    this.apply(res);
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    this.user.set(null);
    this.company.set(null);
    this.loaded = undefined;
  }

  /** Load /me once if a token exists but the user isn't in memory yet. */
  ensureLoaded(): Promise<void> {
    if (!this.token) return Promise.resolve();
    if (!this.loaded) {
      this.loaded = firstValueFrom(
        this.http.get<{ user: AuthUser; company: AuthCompany }>(`${API_BASE}/api/auth/me`)
      )
        .then((me) => {
          this.user.set(me.user);
          this.company.set(me.company);
        })
        .catch(() => this.logout());
    }
    return this.loaded;
  }

  private apply(res: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, res.token);
    this.user.set(res.user);
    this.company.set(res.company);
    this.loaded = Promise.resolve();
  }
}
