import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { VatApiService, Party, Transaction } from '../../core/vat-api.service';

const VAT_RATES = [
  { label: '15% (standard)', value: 0.15 },
  { label: '10%', value: 0.1 },
  { label: '7.5%', value: 0.075 },
  { label: '5%', value: 0.05 },
  { label: '2.5%', value: 0.025 },
  { label: '1.5%', value: 0.015 },
  { label: '0% (exempt/zero)', value: 0 },
];

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './transactions.html',
  styleUrl: './transactions.scss',
})
export class Transactions {
  protected readonly vatRates = VAT_RATES;
  protected readonly parties = signal<Party[]>([]);
  protected readonly transactions = signal<Transaction[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected form: FormGroup;
  protected newParty: FormGroup;

  constructor(private readonly fb: FormBuilder, private readonly api: VatApiService) {
    this.newParty = this.fb.group({ name: [''], bin: [''] });
    this.form = this.fb.group({
      kind: ['SALE', Validators.required],
      partyId: [''],
      mushakNo: [''],
      issuedAt: [new Date().toISOString().slice(0, 10), Validators.required],
      lines: this.fb.array([this.makeLine()]),
    });
    void this.load();
  }

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  private makeLine(): FormGroup {
    return this.fb.group({
      description: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.0001)]],
      unitPrice: [0, [Validators.required, Validators.min(0)]],
      vatRate: [0.15, Validators.required],
      sdRate: [0],
    });
  }

  addLine() {
    this.lines.push(this.makeLine());
  }

  removeLine(i: number) {
    if (this.lines.length > 1) this.lines.removeAt(i);
  }

  /** Client-side preview mirroring the server engine: SD layered before VAT. */
  lineVat(i: number): number {
    const l = this.lines.at(i).value;
    const net = (+l.quantity || 0) * (+l.unitPrice || 0);
    const sd = net * (+l.sdRate || 0);
    return (net + sd) * (+l.vatRate || 0);
  }

  lineTotal(i: number): number {
    const l = this.lines.at(i).value;
    const net = (+l.quantity || 0) * (+l.unitPrice || 0);
    const sd = net * (+l.sdRate || 0);
    return net + sd + this.lineVat(i);
  }

  get previewNet(): number {
    return this.lines.controls.reduce((s, _, i) => {
      const l = this.lines.at(i).value;
      return s + (+l.quantity || 0) * (+l.unitPrice || 0);
    }, 0);
  }

  get previewVat(): number {
    return this.lines.controls.reduce((s, _, i) => s + this.lineVat(i), 0);
  }

  get previewGrand(): number {
    return this.lines.controls.reduce((s, _, i) => s + this.lineTotal(i), 0);
  }

  async load() {
    try {
      await this.api.ensureTenant();
      const [parties, txns] = await Promise.all([
        this.api.listParties(),
        this.api.listTransactions(),
      ]);
      this.parties.set(parties);
      this.transactions.set(txns);
      this.error.set(null);
    } catch {
      this.error.set('API not reachable on :4000 — start it with `npm run dev:api`.');
    }
  }

  async addParty() {
    const v = this.newParty.value;
    if (!v.name) return;
    const party = await this.api.createParty({ name: v.name!, bin: v.bin || undefined, type: 'BOTH' });
    this.parties.set([...this.parties(), party]);
    this.form.patchValue({ partyId: party.id });
    this.newParty.reset();
  }

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const v = this.form.value;
      await this.api.createTransaction({
        kind: v.kind,
        partyId: v.partyId || undefined,
        mushakNo: v.mushakNo || undefined,
        issuedAt: new Date(v.issuedAt).toISOString(),
        lines: v.lines.map((l: any) => ({
          description: l.description,
          quantity: +l.quantity,
          unitPrice: +l.unitPrice,
          vatRate: +l.vatRate,
          sdRate: +l.sdRate || 0,
        })),
      });
      this.form.setControl('lines', this.fb.array([this.makeLine()]));
      this.form.patchValue({ mushakNo: '' });
      await this.load();
    } catch {
      this.error.set('Could not save the transaction.');
    } finally {
      this.saving.set(false);
    }
  }

  downloadPdf(txn: Transaction) {
    void this.api.openMushak63(txn.id);
  }
}
