import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { VatApiService, VatReturn, DashboardSummary } from '../../core/vat-api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  protected readonly apiOnline = signal<boolean | null>(null);
  protected readonly returns = signal<VatReturn[]>([]);
  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor(private readonly api: VatApiService) {
    void this.refresh();
  }

  async refresh() {
    try {
      await this.api.health();
      this.apiOnline.set(true);
      await this.api.ensureTenant();
      const [returns, summary] = await Promise.all([
        this.api.listReturns(),
        this.api.dashboardSummary(),
      ]);
      this.returns.set(returns);
      this.summary.set(summary);
      this.error.set(null);
    } catch {
      this.apiOnline.set(false);
      this.error.set('API not reachable on :4000 — start it with `npm run dev:api`.');
    }
  }

  /** Bar height as a % of the largest output/input value across months. */
  barPct(value: number): number {
    const s = this.summary();
    if (!s) return 0;
    const max = Math.max(1, ...s.months.flatMap((m) => [m.output, m.input]));
    return Math.round((value / max) * 100);
  }
}
