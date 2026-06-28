import { Injectable, signal } from '@angular/core';

type Lang = 'en' | 'bn';

/** Lightweight runtime i18n. Extend the dictionaries to translate more of the UI. */
const DICT: Record<Lang, Record<string, string>> = {
  en: {
    dashboard: 'Dashboard',
    transactions: 'Transactions',
    vdsNotes: 'VDS & Notes',
    returns: 'Returns',
    forms: 'Forms',
    accounting: 'Accounting',
    ledgers: 'Ledgers',
    automation: 'Automation',
    masterData: 'Master data',
    signOut: 'Sign out',
  },
  bn: {
    dashboard: 'ড্যাশবোর্ড',
    transactions: 'লেনদেন',
    vdsNotes: 'উৎসে কর ও নোট',
    returns: 'রিটার্ন',
    forms: 'ফরম',
    accounting: 'হিসাব',
    ledgers: 'খতিয়ান',
    automation: 'অটোমেশন',
    masterData: 'মাস্টার ডেটা',
    signOut: 'সাইন আউট',
  },
};

const LANG_KEY = 'bdvat.lang';

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>((localStorage.getItem(LANG_KEY) as Lang) || 'en');

  t(key: string): string {
    return DICT[this.lang()][key] ?? DICT.en[key] ?? key;
  }

  toggle() {
    const next: Lang = this.lang() === 'en' ? 'bn' : 'en';
    this.lang.set(next);
    localStorage.setItem(LANG_KEY, next);
  }
}
