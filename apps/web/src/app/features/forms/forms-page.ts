import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VatApiService } from '../../core/vat-api.service';

@Component({
  selector: 'app-forms-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './forms-page.html',
  styleUrl: './forms-page.scss',
})
export class FormsPage {
  protected readonly documents = signal<any[]>([]);
  protected readonly coefficients = signal<any[]>([]);
  protected readonly error = signal<string | null>(null);

  // document form
  protected form = '6.5';
  protected docNo = '';
  protected counterparty = '';
  protected fromLoc = '';
  protected toLoc = '';
  protected docDate = new Date().toISOString().slice(0, 10);
  protected value = 0;
  protected vat = 0;
  protected lineDesc = '';

  // coefficient form
  protected productName = '';
  protected inputName = '';
  protected inputQty = '';

  // period for VDS return
  protected year = new Date().getFullYear();
  protected month = new Date().getMonth() + 1;

  constructor(private readonly api: VatApiService) {
    void this.load();
  }

  async load() {
    try {
      await this.api.ensureTenant();
      const [docs, coefs] = await Promise.all([this.api.listDocuments(), this.api.listCoefficients()]);
      this.documents.set(docs);
      this.coefficients.set(coefs);
      this.error.set(null);
    } catch {
      this.error.set('API not reachable on :4000.');
    }
  }

  async addDocument() {
    if (!this.lineDesc) return;
    await this.api.createDocument({
      form: this.form,
      docNo: this.docNo || undefined,
      counterparty: this.counterparty || undefined,
      fromLocation: this.fromLoc || undefined,
      toLocation: this.toLoc || undefined,
      issuedAt: new Date(this.docDate).toISOString(),
      value: +this.value,
      vat: +this.vat,
      lines: [{ description: this.lineDesc, amount: String(this.value) }],
    });
    this.docNo = this.counterparty = this.fromLoc = this.toLoc = this.lineDesc = '';
    this.value = this.vat = 0;
    await this.load();
  }

  async addCoefficient() {
    if (!this.productName || !this.inputName) return;
    await this.api.createCoefficient({
      productName: this.productName,
      inputs: [{ name: this.inputName, quantity: this.inputQty || '1' }],
    });
    this.productName = this.inputName = this.inputQty = '';
    await this.load();
  }

  docPdf(id: string) { void this.api.openDocumentPdf(id); }
  coefPdf(id: string) { void this.api.openCoefficientPdf(id); }
  registration() { void this.api.openRegistration21(); }
  vdsReturn() { void this.api.openVdsReturn(+this.year, +this.month); }
}
