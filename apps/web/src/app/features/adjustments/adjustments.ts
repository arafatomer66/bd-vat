import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { VatApiService, VdsCertificate, Adjustment } from '../../core/vat-api.service';

@Component({
  selector: 'app-adjustments',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './adjustments.html',
  styleUrl: './adjustments.scss',
})
export class Adjustments {
  protected readonly vds = signal<VdsCertificate[]>([]);
  protected readonly notes = signal<Adjustment[]>([]);
  protected readonly error = signal<string | null>(null);

  protected vdsForm: FormGroup;
  protected noteForm: FormGroup;

  constructor(private readonly fb: FormBuilder, private readonly api: VatApiService) {
    this.vdsForm = this.fb.group({
      certificateNo: ['', Validators.required],
      withheldOnOurSales: ['true', Validators.required],
      amount: [0, [Validators.required, Validators.min(0)]],
      issuedAt: [new Date().toISOString().slice(0, 10), Validators.required],
    });
    this.noteForm = this.fb.group({
      kind: ['DECREASING', Validators.required],
      refNo: [''],
      reason: [''],
      amount: [0, [Validators.required, Validators.min(0)]],
      issuedAt: [new Date().toISOString().slice(0, 10), Validators.required],
    });
    void this.load();
  }

  async load() {
    try {
      await this.api.ensureTenant();
      const [vds, notes] = await Promise.all([this.api.listVds(), this.api.listAdjustments()]);
      this.vds.set(vds);
      this.notes.set(notes);
      this.error.set(null);
    } catch {
      this.error.set('API not reachable on :4000 — start it with `npm run dev:api`.');
    }
  }

  async submitVds() {
    if (this.vdsForm.invalid) return this.vdsForm.markAllAsTouched();
    const v = this.vdsForm.value;
    await this.api.createVds({
      certificateNo: v.certificateNo,
      withheldOnOurSales: v.withheldOnOurSales === 'true',
      amount: +v.amount,
      issuedAt: new Date(v.issuedAt).toISOString(),
    });
    this.vdsForm.patchValue({ certificateNo: '', amount: 0 });
    await this.load();
  }

  async submitNote() {
    if (this.noteForm.invalid) return this.noteForm.markAllAsTouched();
    const v = this.noteForm.value;
    await this.api.createAdjustment({
      kind: v.kind,
      refNo: v.refNo || undefined,
      reason: v.reason || undefined,
      amount: +v.amount,
      issuedAt: new Date(v.issuedAt).toISOString(),
    });
    this.noteForm.patchValue({ refNo: '', reason: '', amount: 0 });
    await this.load();
  }
}
