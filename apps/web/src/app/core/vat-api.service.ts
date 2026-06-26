import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

const API_BASE = 'http://localhost:4000';

export interface Company {
  id: string;
  name: string;
  bin: string;
  tin?: string;
  address?: string;
}

export interface Party {
  id: string;
  name: string;
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  bin?: string;
  address?: string;
}

export interface TxnLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  sdRate?: number;
}

export interface Transaction {
  id: string;
  kind: 'SALE' | 'PURCHASE';
  status: string;
  mushakNo?: string;
  issuedAt: string;
  partyId?: string;
  party?: Party;
  netTotal: string;
  sdTotal: string;
  vatTotal: string;
  grandTotal: string;
  lines: (TxnLine & { netValue: string; vatAmount: string; lineTotal: string })[];
}

export interface VdsCertificate {
  id: string;
  certificateNo: string;
  withheldOnOurSales: boolean;
  amount: string;
  issuedAt: string;
}

export interface Adjustment {
  id: string;
  kind: 'INCREASING' | 'DECREASING';
  form?: string;
  refNo?: string;
  reason?: string;
  amount: string;
  issuedAt: string;
  party?: Party;
}

export interface VatReturn {
  id: string;
  year: number;
  month: number;
  status: 'DRAFT' | 'FINALISED' | 'SUBMITTED';
  outputVat: string;
  outputSd: string;
  inputVatRebate: string;
  vdsWithheldOnSales: string;
  increasingAdjustment: string;
  decreasingAdjustment: string;
  openingRebateBalance: string;
  treasuryDeposits: string;
  netPayable: string;
  carryForward: string;
  challanNo?: string;
}

export interface DashboardSummary {
  months: { period: string; output: number; input: number; net: number }[];
  vds: { receivable: string; payable: string };
  deadline: { period: string; dueDate: string; daysRemaining: number; filed: boolean };
}

@Injectable({ providedIn: 'root' })
export class VatApiService {
  readonly companies = signal<Company[]>([]);
  readonly currentTenantId = signal<string | null>(null);
  private tenantLoaded?: Promise<void>;

  constructor(private readonly http: HttpClient) {}

  private headers() {
    return new HttpHeaders({ 'x-tenant-id': this.currentTenantId() ?? '' });
  }

  health() {
    return firstValueFrom(this.http.get<{ ok: boolean }>(`${API_BASE}/health`));
  }

  /** Load companies once and select the first as the active tenant (pre-auth bootstrap). */
  ensureTenant(): Promise<void> {
    if (!this.tenantLoaded) {
      this.tenantLoaded = firstValueFrom(
        this.http.get<Company[]>(`${API_BASE}/api/companies`)
      ).then((list) => {
        this.companies.set(list);
        if (list.length && !this.currentTenantId()) this.currentTenantId.set(list[0].id);
      });
    }
    return this.tenantLoaded;
  }

  setTenant(id: string) {
    this.currentTenantId.set(id);
  }

  listParties() {
    return firstValueFrom(
      this.http.get<Party[]>(`${API_BASE}/api/parties`, { headers: this.headers() })
    );
  }

  createParty(body: Partial<Party>) {
    return firstValueFrom(
      this.http.post<Party>(`${API_BASE}/api/parties`, body, { headers: this.headers() })
    );
  }

  listTransactions(kind?: 'SALE' | 'PURCHASE') {
    const q = kind ? `?kind=${kind}` : '';
    return firstValueFrom(
      this.http.get<Transaction[]>(`${API_BASE}/api/transactions${q}`, { headers: this.headers() })
    );
  }

  createTransaction(body: {
    kind: 'SALE' | 'PURCHASE';
    partyId?: string;
    mushakNo?: string;
    issuedAt: string;
    lines: TxnLine[];
  }) {
    return firstValueFrom(
      this.http.post<Transaction>(`${API_BASE}/api/transactions`, body, { headers: this.headers() })
    );
  }

  /** Fetch the Mushak 6.3 PDF (auth header required) and open it in a new tab. */
  async openMushak63(id: string) {
    const blob = await firstValueFrom(
      this.http.get(`${API_BASE}/api/transactions/${id}/mushak-6.3`, {
        headers: this.headers(),
        responseType: 'blob',
      })
    );
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  listVds() {
    return firstValueFrom(
      this.http.get<VdsCertificate[]>(`${API_BASE}/api/vds`, { headers: this.headers() })
    );
  }

  createVds(body: {
    certificateNo: string;
    withheldOnOurSales: boolean;
    amount: number;
    issuedAt: string;
  }) {
    return firstValueFrom(
      this.http.post<VdsCertificate>(`${API_BASE}/api/vds`, body, { headers: this.headers() })
    );
  }

  listAdjustments() {
    return firstValueFrom(
      this.http.get<Adjustment[]>(`${API_BASE}/api/adjustments`, { headers: this.headers() })
    );
  }

  createAdjustment(body: {
    kind: 'INCREASING' | 'DECREASING';
    refNo?: string;
    reason?: string;
    amount: number;
    issuedAt: string;
  }) {
    return firstValueFrom(
      this.http.post<Adjustment>(`${API_BASE}/api/adjustments`, body, { headers: this.headers() })
    );
  }

  dashboardSummary() {
    return firstValueFrom(
      this.http.get<DashboardSummary>(`${API_BASE}/api/dashboard/summary`, { headers: this.headers() })
    );
  }

  listReturns() {
    return firstValueFrom(
      this.http.get<VatReturn[]>(`${API_BASE}/api/returns`, { headers: this.headers() })
    );
  }

  compileReturn(year: number, month: number) {
    return firstValueFrom(
      this.http.post<{ return: VatReturn }>(
        `${API_BASE}/api/returns/compile`,
        { year, month },
        { headers: this.headers() }
      )
    );
  }

  setReturnStatus(id: string, status: 'DRAFT' | 'FINALISED' | 'SUBMITTED') {
    return firstValueFrom(
      this.http.patch<VatReturn>(
        `${API_BASE}/api/returns/${id}/status`,
        { status },
        { headers: this.headers() }
      )
    );
  }

  setChallan(id: string, body: { challanNo: string; treasuryDeposits: number; challanDate?: string }) {
    return firstValueFrom(
      this.http.patch<{ return: VatReturn }>(
        `${API_BASE}/api/returns/${id}/challan`,
        body,
        { headers: this.headers() }
      )
    );
  }

  async openMushak91(id: string) {
    const blob = await firstValueFrom(
      this.http.get(`${API_BASE}/api/returns/${id}/mushak-9.1`, {
        headers: this.headers(),
        responseType: 'blob',
      })
    );
    window.open(URL.createObjectURL(blob), '_blank');
  }

  async downloadNbrPackage(id: string, year: number, month: number) {
    const blob = await firstValueFrom(
      this.http.get(`${API_BASE}/api/returns/${id}/nbr-package`, {
        headers: this.headers(),
        responseType: 'blob',
      })
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nbr-9.1-${year}-${month}.json`;
    a.click();
  }

  nbrSubmit(id: string) {
    return firstValueFrom(
      this.http.post<{ accepted: boolean; mode: string; message: string }>(
        `${API_BASE}/api/returns/${id}/nbr-submit`,
        {},
        { headers: this.headers() }
      )
    );
  }

  async downloadRegister(year: number, month: number, type: '6.1' | '6.2') {
    const blob = await firstValueFrom(
      this.http.get(`${API_BASE}/api/returns/registers?type=${type}&year=${year}&month=${month}`, {
        headers: this.headers(),
        responseType: 'blob',
      })
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mushak-${type}-${year}-${month}.csv`;
    a.click();
  }
}
