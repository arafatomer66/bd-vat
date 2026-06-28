import { Routes } from '@angular/router';
import { Dashboard } from './features/dashboard/dashboard';
import { Transactions } from './features/transactions/transactions';
import { Adjustments } from './features/adjustments/adjustments';
import { Returns } from './features/returns/returns';
import { MasterData } from './features/master-data/master-data';
import { FormsPage } from './features/forms/forms-page';
import { Login } from './features/auth/login';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: '', component: Dashboard, canActivate: [authGuard] },
  { path: 'transactions', component: Transactions, canActivate: [authGuard] },
  { path: 'adjustments', component: Adjustments, canActivate: [authGuard] },
  { path: 'returns', component: Returns, canActivate: [authGuard] },
  { path: 'forms', component: FormsPage, canActivate: [authGuard] },
  { path: 'master-data', component: MasterData, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
