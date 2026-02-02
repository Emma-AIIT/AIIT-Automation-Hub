'use client';

import { type FC, useState, useMemo, useRef, useEffect } from 'react';
import { type Client } from '@/types/database';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AvatarInitials } from '@/components/shared/AvatarInitials';
import { formatDistanceToNow } from 'date-fns';

interface ClientTableProps {
  clients: Client[];
  onClientClick?: (clientId: string) => void;
}

type SortField = 'name' | 'current_balance' | 'week_change' | 'streak_days' | 'status' | 'last_contact_date' | 'last_call_outcome';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

const STATUS_ORDER: Record<string, number> = {
  suspended: 0,
  critical: 1,
  warning: 2,
  current: 3,
};

const CALL_OUTCOME_ORDER: Record<string, number> = {
  'Answered': 0,
  'Voicemail': 1,
  'No Answer': 2,
};

export const ClientTable: FC<ClientTableProps> = ({ clients, onClientClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [balanceFilter, setBalanceFilter] = useState<string>('all');
  const [streakFilter, setStreakFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<SortField>('streak_days');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close filters when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilters(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedClients = useMemo(() => {
    const result = clients.filter(client => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        client.name.toLowerCase().includes(searchLower) ||
        (client.company?.toLowerCase().includes(searchLower) ?? false) ||
        client.email.toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === 'all' || client.status === statusFilter;

      let matchesBalance = true;
      if (balanceFilter === 'under1k') matchesBalance = client.current_balance < 1000;
      else if (balanceFilter === '1k-5k') matchesBalance = client.current_balance >= 1000 && client.current_balance < 5000;
      else if (balanceFilter === '5k-10k') matchesBalance = client.current_balance >= 5000 && client.current_balance < 10000;
      else if (balanceFilter === 'over10k') matchesBalance = client.current_balance >= 10000;

      let matchesStreak = true;
      if (streakFilter === '0') matchesStreak = client.streak_days === 0;
      else if (streakFilter === '1-7') matchesStreak = client.streak_days >= 1 && client.streak_days <= 7;
      else if (streakFilter === '8-14') matchesStreak = client.streak_days >= 8 && client.streak_days <= 14;
      else if (streakFilter === '15+') matchesStreak = client.streak_days >= 15;

      return matchesSearch && matchesStatus && matchesBalance && matchesStreak;
    });

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'current_balance':
          comparison = a.current_balance - b.current_balance;
          break;
        case 'week_change':
          comparison = (a.current_balance - a.previous_balance) - (b.current_balance - b.previous_balance);
          break;
        case 'streak_days':
          comparison = a.streak_days - b.streak_days;
          break;
        case 'status':
          comparison = (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4);
          break;
        case 'last_contact_date':
          const dateA = a.last_contact_date ? new Date(a.last_contact_date).getTime() : 0;
          const dateB = b.last_contact_date ? new Date(b.last_contact_date).getTime() : 0;
          comparison = dateA - dateB;
          break;
        case 'last_call_outcome':
          comparison = (CALL_OUTCOME_ORDER[a.last_call_outcome ?? ''] ?? 3) - (CALL_OUTCOME_ORDER[b.last_call_outcome ?? ''] ?? 3);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [clients, searchTerm, statusFilter, balanceFilter, streakFilter, sortField, sortDirection]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredAndSortedClients.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedClients = filteredAndSortedClients.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleBalanceChange = (value: string) => {
    setBalanceFilter(value);
    setCurrentPage(1);
  };

  const handleStreakChange = (value: string) => {
    setStreakFilter(value);
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setBalanceFilter('all');
    setStreakFilter('all');
    setCurrentPage(1);
  };

  const activeFilterCount = [
    statusFilter !== 'all',
    balanceFilter !== 'all',
    streakFilter !== 'all',
    searchTerm !== '',
  ].filter(Boolean).length;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(amount);
  };

  const getBalanceChange = (current: number, previous: number) => {
    const change = current - previous;
    if (change === 0) return { text: 'No change', color: 'text-[var(--color-text-faint)]', icon: '—' };
    if (change < 0) return { text: formatCurrency(Math.abs(change)), color: 'text-emerald-400', icon: '↓' };
    return { text: formatCurrency(change), color: 'text-rose-400', icon: '↑' };
  };

  const SortableHeader = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th className={`px-4 lg:px-6 py-4 text-left ${className}`}>
      <button
        onClick={() => handleSort(field)}
        className="group flex items-center gap-1.5 text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.15em] hover:text-[var(--color-text-muted)] transition-colors"
      >
        <span>{children}</span>
        <span className={`flex flex-col -space-y-1 transition-opacity ${sortField === field ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-colors ${sortField === field && sortDirection === 'asc' ? 'text-blue-400' : ''}`}
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-colors ${sortField === field && sortDirection === 'desc' ? 'text-blue-400' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
    </th>
  );

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-faint)]">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search clients, companies, emails..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full bg-[var(--color-input-bg)] border border-[var(--color-border-default)] rounded-xl pl-11 pr-4 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)] focus:ring-1 focus:ring-[var(--color-border-strong)] transition-all duration-200"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex gap-2">
          {/* Status Filter - Always visible */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="appearance-none bg-[var(--color-input-bg)] border border-[var(--color-border-default)] rounded-xl pl-4 pr-10 py-3 text-sm text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-border-strong)] focus:ring-1 focus:ring-[var(--color-border-strong)] transition-all duration-200 cursor-pointer min-w-[120px]"
            >
              <option value="all">All Status</option>
              <option value="current">Current</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
              <option value="suspended">Suspended</option>
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-faint)]">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>

          {/* More Filters Button */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all duration-200 ${
                showFilters || activeFilterCount > 1
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  : 'bg-[var(--color-input-bg)] border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
              <span className="text-sm hidden sm:inline">Filters</span>
              {activeFilterCount > 1 && (
                <span className="flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-blue-500 text-white rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Filter Dropdown */}
            {showFilters && (
              <div className="absolute right-0 mt-2 w-72 bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-2xl shadow-2xl shadow-black/30 z-50 overflow-hidden animate-scale-in">
                <div className="p-4 border-b border-[var(--color-border-subtle)]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Filters</h3>
                    {activeFilterCount > 0 && (
                      <button
                        onClick={clearAllFilters}
                        className="text-xs text-[var(--color-text-muted)] hover:text-blue-400 transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* Balance Filter */}
                  <div>
                    <label className="block text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.15em] mb-2">
                      Balance Range
                    </label>
                    <select
                      value={balanceFilter}
                      onChange={(e) => handleBalanceChange(e.target.value)}
                      className="w-full appearance-none bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer"
                    >
                      <option value="all">All Balances</option>
                      <option value="under1k">Under $1,000</option>
                      <option value="1k-5k">$1,000 - $5,000</option>
                      <option value="5k-10k">$5,000 - $10,000</option>
                      <option value="over10k">Over $10,000</option>
                    </select>
                  </div>

                  {/* Streak Filter */}
                  <div>
                    <label className="block text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.15em] mb-2">
                      Streak Days
                    </label>
                    <select
                      value={streakFilter}
                      onChange={(e) => handleStreakChange(e.target.value)}
                      className="w-full appearance-none bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer"
                    >
                      <option value="all">All Streaks</option>
                      <option value="0">No streak (0 days)</option>
                      <option value="1-7">1-7 days</option>
                      <option value="8-14">8-14 days</option>
                      <option value="15+">15+ days</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Filters Pills */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {searchTerm && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)]">
              Search: &ldquo;{searchTerm}&rdquo;
              <button onClick={() => setSearchTerm('')} className="text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </span>
          )}
          {statusFilter !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)]">
              Status: {statusFilter}
              <button onClick={() => setStatusFilter('all')} className="text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </span>
          )}
          {balanceFilter !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)]">
              Balance: {balanceFilter === 'under1k' ? 'Under $1k' : balanceFilter === '1k-5k' ? '$1k-$5k' : balanceFilter === '5k-10k' ? '$5k-$10k' : 'Over $10k'}
              <button onClick={() => setBalanceFilter('all')} className="text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </span>
          )}
          {streakFilter !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)]">
              Streak: {streakFilter === '0' ? '0 days' : `${streakFilter} days`}
              <button onClick={() => setStreakFilter('all')} className="text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </span>
          )}
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden lg:block relative overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-gradient-to-b from-[var(--color-bg-card)] to-[var(--color-bg-secondary)]">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--color-border-strong)] to-transparent" />

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)]">
                <SortableHeader field="name">Client</SortableHeader>
                <SortableHeader field="current_balance">Outstanding</SortableHeader>
                <SortableHeader field="week_change">Week Change</SortableHeader>
                <SortableHeader field="streak_days">Streak</SortableHeader>
                <SortableHeader field="status">Status</SortableHeader>
                <SortableHeader field="last_contact_date">Last Contact</SortableHeader>
                <SortableHeader field="last_call_outcome">Last Call</SortableHeader>
              </tr>
            </thead>
            <tbody>
              {paginatedClients.map((client, index) => {
                const balanceChange = getBalanceChange(client.current_balance, client.previous_balance);

                return (
                  <tr
                    key={client.id}
                    onClick={() => onClientClick?.(client.id)}
                    className={`
                      group border-b border-[var(--color-border-subtle)] last:border-b-0
                      transition-all duration-200 ease-out
                      ${onClientClick ? 'cursor-pointer hover:bg-[var(--color-bg-hover)]' : ''}
                    `}
                    style={{ animationDelay: `${index * 30}ms` }}
                    role={onClientClick ? 'button' : undefined}
                    tabIndex={onClientClick ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (onClientClick && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onClientClick(client.id);
                      }
                    }}
                    aria-label={onClientClick ? `View details for ${client.name}` : undefined}
                  >
                    <td className="px-4 lg:px-6 py-4">
                      <div className="flex items-center gap-3">
                        <AvatarInitials name={client.name} className="group-hover:border-[var(--color-border-strong)] transition-colors" />
                        <div>
                          <div className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-text-primary)] transition-colors">
                            {client.name}
                          </div>
                          <div className="text-xs text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)] transition-colors">
                            {client.company ?? '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      <div className="text-sm font-mono text-[var(--color-text-primary)] tracking-tight">
                        {formatCurrency(client.current_balance)}
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      <div className={`text-sm font-medium flex items-center gap-1.5 ${balanceChange.color}`}>
                        <span className="text-xs opacity-70">{balanceChange.icon}</span>
                        <span className="font-mono tracking-tight">{balanceChange.text}</span>
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-semibold ${
                          client.streak_days === 0
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : client.streak_days <= 14
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {client.streak_days}
                        </span>
                        {client.streak_days > 0 && (
                          <span className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wide">days</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      <StatusBadge status={client.status} />
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      <span className="text-sm text-[var(--color-text-muted)]">
                        {client.last_contact_date
                          ? formatDistanceToNow(new Date(client.last_contact_date), { addSuffix: true })
                          : '—'}
                      </span>
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      <span className={`text-sm font-medium ${
                        client.last_call_outcome === 'Answered'
                          ? 'text-emerald-400'
                          : client.last_call_outcome === 'Voicemail'
                            ? 'text-amber-400'
                            : client.last_call_outcome === 'No Answer'
                              ? 'text-rose-400'
                              : 'text-[var(--color-text-faint)]'
                      }`}>
                        {client.last_call_outcome ?? '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty State - Desktop */}
        {paginatedClients.length === 0 && (
          <div className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-faint)]">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">No clients match your filters</p>
            <button
              onClick={clearAllFilters}
              className="mt-3 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors underline underline-offset-2"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-3">
        {/* Sort Control for Mobile */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-[var(--color-text-faint)]">
            {filteredAndSortedClients.length} clients
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-faint)]">Sort:</span>
            <select
              value={`${sortField}-${sortDirection}`}
              onChange={(e) => {
                const [field, direction] = e.target.value.split('-') as [SortField, SortDirection];
                setSortField(field);
                setSortDirection(direction);
              }}
              className="appearance-none bg-[var(--color-input-bg)] border border-[var(--color-border-default)] rounded-lg px-2 py-1 text-xs text-[var(--color-text-secondary)] focus:outline-none cursor-pointer"
            >
              <option value="streak_days-desc">Streak (High)</option>
              <option value="streak_days-asc">Streak (Low)</option>
              <option value="current_balance-desc">Balance (High)</option>
              <option value="current_balance-asc">Balance (Low)</option>
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="status-asc">Status (Critical First)</option>
              <option value="last_contact_date-desc">Recently Contacted</option>
            </select>
          </div>
        </div>

        {/* Client Cards */}
        {paginatedClients.map((client, index) => {
          const balanceChange = getBalanceChange(client.current_balance, client.previous_balance);

          return (
            <div
              key={client.id}
              onClick={() => onClientClick?.(client.id)}
              className={`
                relative overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] p-4
                transition-all duration-200 ease-out
                ${onClientClick ? 'cursor-pointer active:scale-[0.98]' : ''}
              `}
              style={{ animationDelay: `${index * 50}ms` }}
              role={onClientClick ? 'button' : undefined}
              tabIndex={onClientClick ? 0 : undefined}
            >
              {/* Top accent */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--color-border-strong)] to-transparent opacity-50" />

              {/* Header Row */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <AvatarInitials name={client.name} className="w-12 h-12 rounded-xl text-sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                      {client.name}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] truncate">
                      {client.company ?? client.email}
                    </div>
                  </div>
                </div>
                <StatusBadge status={client.status} />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                {/* Balance */}
                <div className="bg-[var(--color-bg-elevated)]/50 rounded-xl p-3 border border-[var(--color-border-subtle)]">
                  <div className="text-[10px] font-medium text-[var(--color-text-faint)] uppercase tracking-wide mb-1">Balance</div>
                  <div className="text-sm font-mono font-semibold text-[var(--color-text-primary)]">
                    {formatCurrency(client.current_balance)}
                  </div>
                </div>

                {/* Week Change */}
                <div className="bg-[var(--color-bg-elevated)]/50 rounded-xl p-3 border border-[var(--color-border-subtle)]">
                  <div className="text-[10px] font-medium text-[var(--color-text-faint)] uppercase tracking-wide mb-1">Change</div>
                  <div className={`text-sm font-medium flex items-center gap-1 ${balanceChange.color}`}>
                    <span className="text-xs opacity-70">{balanceChange.icon}</span>
                    <span className="font-mono truncate">{balanceChange.icon === '—' ? 'None' : balanceChange.text}</span>
                  </div>
                </div>

                {/* Streak */}
                <div className="bg-[var(--color-bg-elevated)]/50 rounded-xl p-3 border border-[var(--color-border-subtle)]">
                  <div className="text-[10px] font-medium text-[var(--color-text-faint)] uppercase tracking-wide mb-1">Streak</div>
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold ${
                      client.streak_days === 0
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : client.streak_days <= 14
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-rose-500/15 text-rose-400'
                    }`}>
                      {client.streak_days}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-faint)]">days</span>
                  </div>
                </div>
              </div>

              {/* Footer Row */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--color-border-subtle)]">
                <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                  </svg>
                  <span className={
                    client.last_call_outcome === 'Answered'
                      ? 'text-emerald-400'
                      : client.last_call_outcome === 'Voicemail'
                        ? 'text-amber-400'
                        : client.last_call_outcome === 'No Answer'
                          ? 'text-rose-400'
                          : ''
                  }>
                    {client.last_call_outcome ?? 'No calls'}
                  </span>
                </div>
                <div className="text-xs text-[var(--color-text-faint)]">
                  {client.last_contact_date
                    ? formatDistanceToNow(new Date(client.last_contact_date), { addSuffix: true })
                    : 'Never contacted'}
                </div>
              </div>

              {/* Tap indicator */}
              {onClientClick && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </div>
              )}
            </div>
          );
        })}

        {/* Empty State - Mobile */}
        {paginatedClients.length === 0 && (
          <div className="py-12 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-faint)]">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">No clients found</p>
            <button
              onClick={clearAllFilters}
              className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {filteredAndSortedClients.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-1">
          <div className="flex items-center gap-4">
            <p className="text-xs text-[var(--color-text-faint)]">
              <span className="hidden sm:inline">Showing </span>
              <span className="text-[var(--color-text-muted)] font-medium">{startIndex + 1}</span>–
              <span className="text-[var(--color-text-muted)] font-medium">{Math.min(endIndex, filteredAndSortedClients.length)}</span>
              <span className="hidden sm:inline"> of</span>
              <span className="sm:hidden">/</span>{' '}
              <span className="text-[var(--color-text-muted)] font-medium">{filteredAndSortedClients.length}</span>
              <span className="hidden sm:inline"> clients</span>
            </p>
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-faint)]">Per page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                className="appearance-none bg-[var(--color-input-bg)] border border-[var(--color-border-default)] rounded-lg px-2 py-1 text-xs text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer"
              >
                {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* First page */}
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-input-bg)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-input-bg)] disabled:hover:text-[var(--color-text-muted)] transition-all"
              aria-label="First page"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="11 17 6 12 11 7"></polyline>
                <polyline points="18 17 13 12 18 7"></polyline>
              </svg>
            </button>

            {/* Previous page */}
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-input-bg)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-input-bg)] disabled:hover:text-[var(--color-text-muted)] transition-all"
              aria-label="Previous page"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>

            {/* Page indicator */}
            <div className="px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="text-[var(--color-text-secondary)] font-medium">{currentPage}</span>
              <span className="mx-1">/</span>
              <span>{totalPages || 1}</span>
            </div>

            {/* Next page */}
            <button
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-input-bg)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-input-bg)] disabled:hover:text-[var(--color-text-muted)] transition-all"
              aria-label="Next page"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>

            {/* Last page */}
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-input-bg)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-input-bg)] disabled:hover:text-[var(--color-text-muted)] transition-all"
              aria-label="Last page"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="13 17 18 12 13 7"></polyline>
                <polyline points="6 17 11 12 6 7"></polyline>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
