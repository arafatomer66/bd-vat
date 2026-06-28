import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VatApiService } from '../../core/vat-api.service';

@Component({
  selector: 'app-accounting',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './accounting.html',
  styleUrl: './accounting.scss',
})
export class Accounting {
  protected readonly tab = signal<'tb' | 'pl' | 'bs' | 'journal'>('tb');
  protected readonly tb = signal<any>(null);
  protected readonly pl = signal<any>(null);
  protected readonly bs = signal<any>(null);
  protected readonly journal = signal<any[]>([]);
  protected readonly error = signal<string | null>(null);

  constructor(private readonly api: VatApiService) {
    void this.load();
  }

  async load() {
    try {
      await this.api.ensureTenant();
      const [tb, pl, bs, journal] = await Promise.all([
        this.api.trialBalance(),
        this.api.profitLoss(),
        this.api.balanceSheet(),
        this.api.journal(),
      ]);
      this.tb.set(tb);
      this.pl.set(pl);
      this.bs.set(bs);
      this.journal.set(journal);
      this.error.set(null);
    } catch {
      this.error.set('API not reachable on :4000.');
    }
  }

  show(t: 'tb' | 'pl' | 'bs' | 'journal') { this.tab.set(t); }
}
