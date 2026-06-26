import { Routes } from '@angular/router';
import { Dashboard } from './features/dashboard/dashboard';
import { Transactions } from './features/transactions/transactions';
import { Adjustments } from './features/adjustments/adjustments';
import { Returns } from './features/returns/returns';

export const routes: Routes = [
  { path: '', component: Dashboard },
  { path: 'transactions', component: Transactions },
  { path: 'adjustments', component: Adjustments },
  { path: 'returns', component: Returns },
  { path: '**', redirectTo: '' }
];
