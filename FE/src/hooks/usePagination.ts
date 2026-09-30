import { useState } from 'react';
import { paginate } from '@/lib/pagination';

export function usePagination<T>(items: readonly T[], filterKey = '', defaultSize = 10) {
  const [state, setState] = useState({ page: 1, size: defaultSize, filterKey });
  const page = paginate(items, state.filterKey === filterKey ? state.page : 1, state.size);
  if (state.filterKey !== filterKey || state.page !== page.current) {
    setState({ ...state, filterKey, page: page.current });
  }
  return { ...page, onChange: (current: number, size: number) => setState({ filterKey, page: size !== state.size ? 1 : current, size }) };
}
