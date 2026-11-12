import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = { 
  current: number; 
  pageSize: number; 
  total: number; 
  onChange: (page: number, size: number) => void 
};

export default function PaginationBar({ current, pageSize, total, onChange }: Props) {
  const totalPages = Math.ceil(total / pageSize);
  
  // Calculate range text
  const startItem = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const endItem = Math.min(current * pageSize, total);
  
  // Generate page numbers to show (simple windowing)
  const getPages = () => {
    const pages = [];
    let start = Math.max(1, current - 2);
    let end = Math.min(totalPages, start + 4);
    
    if (end - start < 4 && totalPages > 4) {
      start = Math.max(1, end - 4);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  if (total === 0) return null;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-[var(--at-line)] pt-4 mt-2">
      {/* Items Range Info */}
      <div className="text-[10px] font-mono text-[var(--at-muted)] uppercase hidden md:block" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
        Showing {startItem}-{endItem} of {total}
      </div>

      <div className="flex items-center gap-2 mx-auto md:mx-0">
        {/* Prev Button */}
        <button 
          onClick={() => current > 1 && onChange(current - 1, pageSize)}
          disabled={current === 1}
          className="h-8 w-8 flex items-center justify-center rounded-sm border border-[var(--at-line)] bg-[var(--at-panel)] text-[var(--at-muted)] transition-colors hover:bg-[var(--at-line)] hover:text-[var(--at-text)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={14} />
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1">
          {getPages().map(page => (
            <button
              key={page}
              onClick={() => onChange(page, pageSize)}
              className={`h-8 w-8 flex items-center justify-center text-xs font-mono font-bold rounded-sm border transition-all duration-200 ${
                page === current 
                  ? 'bg-[var(--at-accent)]/10 border-[var(--at-accent)] text-[var(--at-link)] shadow-[0_0_10px_rgba(56,189,248,0.2)]' 
                  : 'bg-[var(--at-panel)] border-[var(--at-line)] text-[var(--at-muted)] hover:bg-[var(--at-line)] hover:text-[var(--at-text)]'
              }`}
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              {page}
            </button>
          ))}
        </div>

        {/* Next Button */}
        <button 
          onClick={() => current < totalPages && onChange(current + 1, pageSize)}
          disabled={current === totalPages}
          className="h-8 w-8 flex items-center justify-center rounded-sm border border-[var(--at-line)] bg-[var(--at-panel)] text-[var(--at-muted)] transition-colors hover:bg-[var(--at-line)] hover:text-[var(--at-text)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Page Size Selector (Optional display for larger screens) */}
      <div className="hidden md:flex items-center gap-2">
        <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase" style={{ fontFamily: '"JetBrains Mono", monospace' }}>Per page</span>
        <select 
          value={pageSize}
          onChange={(e) => onChange(1, Number(e.target.value))}
          className="h-8 px-2 bg-[var(--at-panel)] border border-[var(--at-line)] text-xs font-mono text-[var(--at-text)] outline-none cursor-pointer hover:border-[#5f636b] transition-colors"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </div>
    </nav>
  );
}
