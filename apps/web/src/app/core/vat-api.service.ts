import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

const API_BASE = 'http://localhost:4000';

export interface VatReturn {
  id: string;
  year: number;
  month: number;
  status: string;
  outputVat: string;
  inputVatRebate: string;
  netPayable: string;
  carryForward: string;
}

@Injectable({ providedIn: 'root' })
export class VatApiService {
  /** Phase 1: tenant scope comes from a header; replaced by JWT auth later. */
  private readonly tenantId = signal<string>('demo-tenant');

  constructor(private readonly http: HttpClient) {}

  private headers() {
    return new HttpHeaders({ 'x-tenant-id': this.tenantId() });
  }

  setTenant(id: string) {
    this.tenantId.set(id);
  }

  health() {
    return firstValueFrom(this.http.get<{ ok: boolean }>(`${API_BASE}/health`));
  }

  listReturns() {
    return firstValueFrom(
      this.http.get<VatReturn[]>(`${API_BASE}/api/returns`, { headers: this.headers() })
    );
  }

  compileReturn(year: number, month: number) {
    return firstValueFrom(
      this.http.post<{ return: VatReturn; computed: unknown }>(
        `${API_BASE}/api/returns/compile`,
        { year, month },
        { headers: this.headers() }
      )
    );
  }
}
