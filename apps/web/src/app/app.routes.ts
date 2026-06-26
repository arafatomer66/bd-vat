import { Routes } from '@angular/router';
import { Dashboard } from './features/dashboard/dashboard';
import { Transactions } from './features/transactions/transactions';

export const routes: Routes = [
  { path: '', component: Dashboard },
  { path: 'transactions', component: Transactions },
  { path: '**', redirectTo: '' }
];
