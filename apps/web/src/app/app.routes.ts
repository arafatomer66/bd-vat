import { Routes } from '@angular/router';
import { Dashboard } from './features/dashboard/dashboard';
import { Transactions } from './features/transactions/transactions';
import { Adjustments } from './features/adjustments/adjustments';
import { Returns } from './features/returns/returns';
import { Login } from './features/auth/login';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: '', component: Dashboard, canActivate: [authGuard] },
  { path: 'transactions', component: Transactions, canActivate: [authGuard] },
  { path: 'adjustments', component: Adjustments, canActivate: [authGuard] },
  { path: 'returns', component: Returns, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
