import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VatApiService, Party } from '../../core/vat-api.service';

@Component({
  selector: 'app-ledgers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ledgers.html',
  styleUrl: './ledgers.scss',
})
export class Ledgers {
  protected readonly stock = signal<any[]>([]);
  protected readonly aging = signal<any>(null);
  protected readonly agingType = signal<'receivable' | 'payable'>('receivable');
  protected readonly parties = signal<Party[]>([]);
  protected readonly ledger = signal<any>(null);
  protected readonly error = signal<string | null>(null);

  // payment form
  protected payParty = '';
  protected payKind: 'RECEIPT' | 'PAYMENT' = 'RECEIPT';
  protected payAmount = 0;
  protected payDate = new Date().toISOString().slice(0, 10);
  protected ledgerParty = '';

  constructor(private readonly api: VatApiService) {
    void this.load();
  }

  async load() {
    try {
      await this.api.ensureTenant();
      const [stock, aging, parties] = await Promise.all([
        this.api.stock(),
        this.api.aging(this.agingType()),
        this.api.listParties(),
      ]);
      this.stock.set(stock);
      this.aging.set(aging);
      this.parties.set(parties);
      this.error.set(null);
    } catch {
      this.error.set('API not reachable on :4000.');
    }
  }

  async switchAging(type: 'receivable' | 'payable') {
    this.agingType.set(type);
    this.aging.set(await this.api.aging(type));
  }

  async addPayment() {
    if (!this.payAmount) return;
    await this.api.createPayment({
      partyId: this.payParty || undefined,
      kind: this.payKind,
      amount: +this.payAmount,
      date: new Date(this.payDate).toISOString(),
    });
    this.payAmount = 0;
    await this.load();
  }

  async viewLedger() {
    if (this.ledgerParty) this.ledger.set(await this.api.partyLedger(this.ledgerParty));
  }
}
