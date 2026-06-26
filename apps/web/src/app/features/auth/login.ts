import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  protected mode = signal<'login' | 'signup'>('login');
  protected error = signal<string | null>(null);
  protected busy = signal(false);

  // shared
  protected email = '';
  protected password = '';
  // signup
  protected companyName = '';
  protected bin = '';
  protected tin = '';
  protected name = '';

  constructor(private readonly auth: AuthService, private readonly router: Router) {}

  toggle() {
    this.mode.set(this.mode() === 'login' ? 'signup' : 'login');
    this.error.set(null);
  }

  async submit() {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.mode() === 'login') {
        await this.auth.login(this.email, this.password);
      } else {
        await this.auth.signup({
          companyName: this.companyName,
          bin: this.bin,
          tin: this.tin || undefined,
          name: this.name || undefined,
          email: this.email,
          password: this.password,
        });
      }
      await this.router.navigateByUrl('/');
    } catch (e: any) {
      this.error.set(e?.error?.error?.formErrors?.[0] ?? e?.error?.error ?? 'Something went wrong.');
    } finally {
      this.busy.set(false);
    }
  }
}
