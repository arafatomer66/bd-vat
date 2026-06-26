import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VatApiService, VatReturn } from '../../core/vat-api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard {
  protected readonly apiOnline = signal<boolean | null>(null);
  protected readonly returns = signal<VatReturn[]>([]);
  protected readonly error = signal<string | null>(null);

  constructor(private readonly api: VatApiService) {
    void this.refresh();
  }

  async refresh() {
    try {
      await this.api.health();
      this.apiOnline.set(true);
      this.returns.set(await this.api.listReturns());
      this.error.set(null);
    } catch {
      this.apiOnline.set(false);
      this.error.set('API not reachable on :4000 — start it with `npm run dev:api`.');
    }
  }
}
