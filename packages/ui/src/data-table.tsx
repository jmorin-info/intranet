'use client';

import React from 'react';
import { cn } from './utils';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from './button';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  page?: number;
  totalPages?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onRowClick?: (item: T) => void;
}

const DataTableRow = React.memo(function DataTableRow<T extends object>({
  item,
  idx,
  columns,
  onRowClick,
}: {
  item: T;
  idx: number;
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
}) {
  return (
    <tr
      className={cn(
        'transition-colors border-l-[3px] border-l-transparent hover:border-l-primary',
        idx % 2 === 0
          ? 'bg-white dark:bg-slate-900'
          : 'bg-gray-50/50 dark:bg-slate-800/30',
        'hover:bg-primary/[0.03] dark:hover:bg-primary/[0.05]',
        onRowClick && 'cursor-pointer',
      )}
      onClick={() => onRowClick?.(item)}
    >
      {columns.map((col) => (
        <td key={col.key} className={cn('px-4 py-3.5 text-seal-navy dark:text-slate-200', col.className)}>
          {col.render
            ? col.render(item)
            : ((item as Record<string, unknown>)[col.key] as React.ReactNode)}
        </td>
      ))}
    </tr>
  );
}) as <T extends object>(props: { item: T; idx: number; columns: Column<T>[]; onRowClick?: (item: T) => void }) => React.ReactElement;

export function DataTable<T extends object>({
  columns,
  data,
  keyExtractor,
  sortBy,
  sortOrder,
  onSort,
  page = 1,
  totalPages = 1,
  total,
  onPageChange,
  loading,
  emptyMessage = 'Aucun resultat',
  emptyIcon,
  onRowClick,
}: DataTableProps<T>) {
  const getSortIcon = (key: string) => {
    if (sortBy !== key) return <ArrowUpDown className="h-3.5 w-3.5 text-seal-gray-500" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-primary" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-primary" />
    );
  };

  return (
    <div className="overflow-hidden rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500',
                    'sticky top-0 bg-white dark:bg-slate-900 z-10',
                    col.sortable && 'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors',
                    col.className,
                  )}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  <div className="flex items-center gap-1.5">
                    {col.header}
                    {col.sortable && getSortIcon(col.key)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3.5">
                      <div
                        className="h-4 rounded-md bg-gray-200 dark:bg-slate-700"
                        style={{ width: `${55 + Math.random() * 30}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-seal-gray-500 dark:text-slate-400">
                    {emptyIcon}
                    <p>{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((item, idx) => (
                <DataTableRow
                  key={keyExtractor(item)}
                  item={item}
                  idx={idx}
                  columns={columns}
                  onRowClick={onRowClick}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/30 px-4 py-3">
          <span className="text-xs text-seal-gray-500 dark:text-slate-400">
            {total !== undefined ? `${total} resultats` : `Page ${page} sur ${totalPages}`}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onPageChange?.(1)}
              disabled={page <= 1}
              className="h-8 w-8"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onPageChange?.(page - 1)}
              disabled={page <= 1}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 py-1 text-sm font-semibold text-seal-navy dark:text-white rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onPageChange?.(page + 1)}
              disabled={page >= totalPages}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onPageChange?.(totalPages)}
              disabled={page >= totalPages}
              className="h-8 w-8"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
