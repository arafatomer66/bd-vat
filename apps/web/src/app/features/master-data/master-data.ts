import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VatApiService, Product } from '../../core/vat-api.service';
import { parseCsv } from '../../core/csv';

@Component({
  selector: 'app-master-data',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './master-data.html',
  styleUrl: './master-data.scss',
})
export class MasterData {
  protected readonly products = signal<Product[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected name = '';
  protected unit = '';
  protected vatRate = 0.15;
  protected sdRate = 0;

  constructor(private readonly api: VatApiService) {
    void this.load();
  }

  async load() {
    try {
      await this.api.ensureTenant();
      this.products.set(await this.api.listProducts());
      this.error.set(null);
    } catch {
      this.error.set('API not reachable on :4000 — start it with `npm run dev:api`.');
    }
  }

  exportBackup() { void this.api.exportBackup(); }

  async addProduct() {
    if (!this.name) return;
    await this.api.createProduct({
      name: this.name,
      unit: this.unit || undefined,
      vatRate: +this.vatRate,
      sdRate: +this.sdRate,
    });
    this.name = '';
    this.unit = '';
    await this.load();
  }

  async importProducts(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const rows = parseCsv(await file.text()).map((r) => ({
      name: r['name'],
      unit: r['unit'] || undefined,
      hsCode: r['hscode'] || r['hs_code'] || undefined,
      vatRate: r['vatrate'] ? Number(r['vatrate']) : 0.15,
      sdRate: r['sdrate'] ? Number(r['sdrate']) : 0,
    })).filter((r) => r.name);
    if (!rows.length) return this.error.set('No valid product rows found.');
    try {
      const { imported } = await this.api.importProducts(rows);
      this.message.set(`Imported ${imported} products.`);
      await this.load();
    } catch {
      this.error.set('Product import failed — check the CSV columns.');
    }
  }

  async importParties(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const rows = parseCsv(await file.text()).map((r) => ({
      name: r['name'],
      bin: r['bin'] || undefined,
      type: (r['type']?.toUpperCase() as 'CUSTOMER' | 'SUPPLIER' | 'BOTH') || 'BOTH',
      address: r['address'] || undefined,
    })).filter((r) => r.name);
    if (!rows.length) return this.error.set('No valid party rows found.');
    try {
      const { imported } = await this.api.importParties(rows);
      this.message.set(`Imported ${imported} parties.`);
    } catch {
      this.error.set('Party import failed — check the CSV columns.');
    }
  }
}
