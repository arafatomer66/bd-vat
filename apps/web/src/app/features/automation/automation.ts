import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VatApiService } from '../../core/vat-api.service';

@Component({
  selector: 'app-automation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './automation.html',
  styleUrl: './automation.scss',
})
export class Automation {
  protected readonly rates = signal<any[]>([]);
  protected readonly recurring = signal<any[]>([]);
  protected readonly notifications = signal<any[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  // recurring form
  protected desc = '';
  protected unitPrice = 0;
  protected rate = 0.15;
  protected nextRun = new Date().toISOString().slice(0, 10);

  constructor(private readonly api: VatApiService) {
    void this.load();
  }

  async load() {
    try {
      await this.api.ensureTenant();
      const [rates, recurring, notifications] = await Promise.all([
        this.api.rates(),
        this.api.recurringList(),
        this.api.notifications(),
      ]);
      this.rates.set(rates);
      this.recurring.set(recurring);
      this.notifications.set(notifications);
      this.error.set(null);
    } catch {
      this.error.set('API not reachable on :4000.');
    }
  }

  async checkDeadline() {
    const r = await this.api.deadlineCheck();
    this.message.set(r.sent ? `Reminder logged for ${r.period} (due ${r.dueDate})` : r.reason);
    await this.load();
  }

  async addRecurring() {
    if (!this.desc) return;
    await this.api.recurringCreate({
      kind: 'SALE',
      dayOfMonth: 1,
      nextRunAt: new Date(this.nextRun).toISOString(),
      lines: [{ description: this.desc, quantity: 1, unitPrice: +this.unitPrice, vatRate: +this.rate }],
    });
    this.desc = '';
    this.unitPrice = 0;
    await this.load();
  }

  async runRecurring() {
    const r = await this.api.recurringRun();
    this.message.set(`Generated ${r.generated} transaction(s) from due templates.`);
    await this.load();
  }
}
