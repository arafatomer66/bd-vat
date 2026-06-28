import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from './core/auth.service';
import { I18nService } from './core/i18n.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly companies = signal<{ id: string; name: string; bin: string; role: string }[]>([]);
  protected activeId = '';

  constructor(
    protected readonly auth: AuthService,
    protected readonly i18n: I18nService,
    private readonly router: Router
  ) {}

  async ngOnInit() {
    await this.auth.ensureLoaded();
    if (this.auth.isAuthenticated()) {
      this.companies.set(await this.auth.memberships());
      this.activeId = this.auth.company()?.id ?? '';
    }
  }

  async onSwitch() {
    if (this.activeId && this.activeId !== this.auth.company()?.id) {
      await this.auth.switchCompany(this.activeId);
      window.location.reload();
    }
  }

  async logout() {
    this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
