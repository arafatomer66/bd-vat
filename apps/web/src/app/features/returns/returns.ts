import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VatApiService, VatReturn } from '../../core/vat-api.service';

@Component({
  selector: 'app-returns',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './returns.html',
  styleUrl: './returns.scss',
})
export class Returns {
  protected readonly returns = signal<VatReturn[]>([]);
  protected readonly selected = signal<VatReturn | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected year = new Date().getFullYear();
  protected month = new Date().getMonth() + 1;
  protected challanNo = '';
  protected treasuryDeposits = 0;
  protected nbrMessage = signal<string | null>(null);

  constructor(private readonly api: VatApiService) {
    void this.load();
  }

  async load() {
    try {
      await this.api.ensureTenant();
      this.returns.set(await this.api.listReturns());
      this.error.set(null);
    } catch {
      this.error.set('API not reachable on :4000 — start it with `npm run dev:api`.');
    }
  }

  async compile() {
    this.busy.set(true);
    try {
      const { return: r } = await this.api.compileReturn(+this.year, +this.month);
      await this.load();
      this.select(r);
    } finally {
      this.busy.set(false);
    }
  }

  select(r: VatReturn) {
    this.selected.set(r);
    this.challanNo = r.challanNo ?? '';
    this.treasuryDeposits = +r.treasuryDeposits || 0;
    this.nbrMessage.set(null);
  }

  async setStatus(status: 'DRAFT' | 'FINALISED' | 'SUBMITTED') {
    const r = this.selected();
    if (!r) return;
    const updated = await this.api.setReturnStatus(r.id, status);
    this.selected.set(updated);
    await this.load();
  }

  async saveChallan() {
    const r = this.selected();
    if (!r || !this.challanNo) return;
    const { return: updated } = await this.api.setChallan(r.id, {
      challanNo: this.challanNo,
      treasuryDeposits: +this.treasuryDeposits,
    });
    this.selected.set(updated);
    await this.load();
  }

  pdf() {
    const r = this.selected();
    if (r) void this.api.openMushak91(r.id);
  }

  register(type: '6.1' | '6.2') {
    const r = this.selected();
    if (r) void this.api.downloadRegister(r.year, r.month, type);
  }

  nbrPackage() {
    const r = this.selected();
    if (r) void this.api.downloadNbrPackage(r.id, r.year, r.month);
  }

  async nbrSubmit() {
    const r = this.selected();
    if (!r) return;
    const result = await this.api.nbrSubmit(r.id);
    this.nbrMessage.set(result.message);
  }

  async verifyChallan() {
    const r = this.selected();
    if (!r) return;
    const { result } = await this.api.verifyChallan(r.id);
    this.nbrMessage.set(result.note);
  }

  monthName(m: number) {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  }
}
