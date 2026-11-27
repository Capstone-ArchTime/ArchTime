import { formatCredits, type Order } from '@/features/billing-api';
import { useMessages } from '@/i18n/define';
import { BILL } from './messages';

/** What an order bought, in the page language. */
export function useItemLabel() {
  const m = useMessages(BILL);
  return (o: Order) => {
    const length = o.period === 'year' ? m('oneYear') : m('oneMonth');
    if (o.kind === 'topup') return m('itemTopup', { count: formatCredits(o.credits ?? 0) });
    if (o.kind === 'add-seats') return m('itemAdd', { count: o.seats ?? 0 });
    return o.plan === 'team' ? m('itemTeam', { count: o.seats ?? 0, length }) : m('itemPro', { length });
  };
}
