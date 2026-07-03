/**
 * Contacts page at /automations/contacts.
 * A spreadsheet-style (CSV) table of the call_contacts phonebook. Phone numbers are
 * added by a Make.com automation (deduped against the unique phone constraint); the team
 * manages the list here — searching, sorting, inline-editing name / phone / business on
 * any row, manually adding contacts, and deleting rows. All writes go through the
 * callContacts tRPC router. Data and display follow the same light-theme patterns as the
 * other automation modules.
 *
 * Columns are user-toggleable: click a column header's × (or use the "Columns" menu) to
 * hide it, and re-enable it from the menu. Visibility is remembered per-browser via
 * localStorage. Hiding the "Times called" column does not affect sorting — the counter is
 * tracked regardless. The list defaults to sorting by most-called first.
 */
'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { api } from '@/trpc/react';
import type { CallContact } from '@/server/api/routers/callContacts';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const PAGE_SIZE = 25;

type SortKey =
  | 'most-called'
  | 'least-called'
  | 'newest'
  | 'oldest'
  | 'name'
  | 'recently-called';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'most-called', label: 'Most called' },
  { value: 'least-called', label: 'Least called' },
  { value: 'recently-called', label: 'Recently called' },
  { value: 'newest', label: 'Newest added' },
  { value: 'oldest', label: 'Oldest added' },
  { value: 'name', label: 'Name (A–Z)' },
];

// ─── Column model ────────────────────────────────────────────────────────────
// Every column except Name can be hidden. Name always stays so rows remain
// identifiable. The Actions column is fixed and lives outside this list.
type ColumnKey = 'name' | 'phone' | 'business' | 'call_count' | 'last_called' | 'added';

type Column = {
  key: ColumnKey;
  label: string;
  hideable: boolean;
  align: 'left' | 'right';
};

const COLUMNS: Column[] = [
  { key: 'name', label: 'Name', hideable: false, align: 'left' },
  { key: 'phone', label: 'Phone', hideable: true, align: 'left' },
  { key: 'business', label: 'Business', hideable: true, align: 'left' },
  { key: 'call_count', label: 'Times called', hideable: true, align: 'right' },
  { key: 'last_called', label: 'Last called', hideable: true, align: 'left' },
  { key: 'added', label: 'Added', hideable: true, align: 'left' },
];

type Visibility = Record<ColumnKey, boolean>;

const DEFAULT_VISIBILITY: Visibility = {
  name: true,
  phone: true,
  business: true,
  call_count: true,
  last_called: true,
  added: true,
};

const VISIBILITY_STORAGE_KEY = 'contacts-column-visibility';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'd MMM yyyy, h:mm a');
}

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('most-called');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved column visibility once on mount (client-only to avoid SSR mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VISIBILITY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Visibility>;
        setVisibility({ ...DEFAULT_VISIBILITY, ...parsed, name: true });
      }
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const setColumnVisible = (key: ColumnKey, visible: boolean) => {
    if (key === 'name') return; // Name can't be hidden.
    setVisibility((prev) => {
      const next = { ...prev, [key]: visible };
      try {
        window.localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota / unavailable storage */
      }
      return next;
    });
  };

  const visibleColumns = COLUMNS.filter((c) => visibility[c.key]);
  const colSpan = visibleColumns.length + 1; // +1 for the Actions column

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const utils = api.useUtils();
  const queryInput = { search: debouncedSearch || undefined };

  const {
    data: contacts = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = api.callContacts.getAll.useQuery(queryInput, { staleTime: 15_000 });

  const updateMutation = api.callContacts.update.useMutation({
    onSuccess: () => void utils.callContacts.getAll.invalidate(),
    onError: (err) => toast.error(err.message || 'Failed to save change'),
  });

  const deleteMutation = api.callContacts.delete.useMutation({
    onSuccess: () => {
      toast.success('Contact deleted');
      void utils.callContacts.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message || 'Failed to delete contact'),
  });

  const createMutation = api.callContacts.create.useMutation({
    onSuccess: () => {
      toast.success('Contact added');
      setAdding(false);
      void utils.callContacts.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message || 'Failed to add contact'),
  });

  // Sort client-side (search is handled server-side via the query input).
  const sorted = useMemo(() => {
    const copy = [...contacts];
    const callCount = (c: CallContact) => c.call_count ?? 0;
    const lastCalled = (c: CallContact) => new Date(c.last_called_at ?? 0).getTime();
    copy.sort((a, b) => {
      switch (sortKey) {
        case 'most-called':
          // Most calls first; break ties by most-recently called.
          return callCount(b) - callCount(a) || lastCalled(b) - lastCalled(a);
        case 'least-called':
          return callCount(a) - callCount(b) || lastCalled(a) - lastCalled(b);
        case 'name':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'recently-called':
          return lastCalled(b) - lastCalled(a);
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return copy;
  }, [contacts, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Keep the current page in range when the result set shrinks.
  useEffect(() => {
    const safePage = Math.min(page, totalPages) || 1;
    if (page !== safePage) setPage(safePage);
  }, [page, totalPages]);

  const handleSaveField = (
    contact: CallContact,
    field: 'name' | 'phone' | 'business',
    value: string,
  ) => {
    const trimmed = value.trim();
    const current = contact[field] ?? '';
    if (trimmed === (current ?? '')) return; // no change
    if ((field === 'name' || field === 'phone') && trimmed === '') {
      toast.error(`${field === 'name' ? 'Name' : 'Phone'} can't be empty`);
      return;
    }
    updateMutation.mutate({ id: contact.id, [field]: trimmed } as {
      id: string;
      name?: string;
      phone?: string;
      business?: string;
    });
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-light)] flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">
              Contacts
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5 leading-snug">
              Manage the call list — edit names &amp; businesses, add or remove numbers
            </p>
          </div>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add contact
        </button>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] shadow-sm p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none"
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search name, phone or business..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[var(--color-border-default)] bg-[var(--color-input-bg)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/20 focus:border-[var(--color-border-strong)] transition-colors"
          />
        </div>

        <div className="flex items-center gap-3">
          <ColumnsMenu visibility={visibility} onToggle={setColumnVisible} />
          <select
            value={sortKey}
            onChange={(e) => { setSortKey(e.target.value as SortKey); setPage(1); }}
            className="h-9 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-input-bg)] text-sm text-[var(--color-text-secondary)] px-3 pr-8 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/20 focus:border-[var(--color-border-strong)] transition-colors"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={() => void refetch()}
            disabled={isRefetching}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50 transition-colors"
          >
            <svg className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]">
                {visibleColumns.map((col) => (
                  <HeaderCell key={col.key} column={col} onHide={() => setColumnVisible(col.key, false)} />
                ))}
                <th className="text-right py-3 px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-text-faint)] w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {/* Inline add row */}
              {adding && (
                <AddRow
                  columns={visibleColumns}
                  onCancel={() => setAdding(false)}
                  onSave={(values) => createMutation.mutate(values)}
                  isSaving={createMutation.isPending}
                />
              )}

              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={colSpan} className="px-4 py-3">
                      <div className="h-6 rounded bg-[var(--color-bg-secondary)] animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={colSpan} className="py-12 text-center text-sm text-red-600">
                    Failed to load contacts. Try refreshing.
                  </td>
                </tr>
              ) : paginated.length === 0 && !adding ? (
                <tr>
                  <td colSpan={colSpan} className="py-16 text-center">
                    <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                      {debouncedSearch ? 'No contacts match your search' : 'No contacts yet'}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      {debouncedSearch
                        ? 'Try a different search term'
                        : 'Numbers added by your automation will appear here, or add one manually'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    columns={visibleColumns}
                    onSaveField={handleSaveField}
                    onDelete={() => deleteMutation.mutate({ id: contact.id })}
                    isDeleting={deleteMutation.isPending && deleteMutation.variables?.id === contact.id}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / pagination */}
        {!isLoading && !isError && sorted.length > 0 && (
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]">
            <p className="text-xs text-[var(--color-text-muted)]">
              {sorted.length} contact{sorted.length !== 1 ? 's' : ''}
              {sorted.length > PAGE_SIZE && (
                <>
                  {' '}· showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)}
                </>
              )}
            </p>
            {sorted.length > PAGE_SIZE && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-xs text-[var(--color-text-muted)]">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-[var(--color-text-faint)] leading-relaxed">
        Tip: click any name, phone or business cell to edit it inline. Click a column&apos;s ×
        (or use the Columns menu) to hide it — sorting still works even when a column is hidden.
      </p>
    </div>
  );
}

// ─── Columns menu ────────────────────────────────────────────────────────────
// Popover with a checkbox per hideable column, so hidden columns can be brought back.

function ColumnsMenu({
  visibility,
  onToggle,
}: {
  visibility: Visibility;
  onToggle: (key: ColumnKey, visible: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hiddenCount = COLUMNS.filter((c) => c.hideable && !visibility[c.key]).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
        <span className="hidden sm:inline">Columns</span>
        {hiddenCount > 0 && (
          <span className="text-[10px] font-semibold rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent-primary)] px-1.5 py-0.5">
            {hiddenCount} hidden
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] shadow-lg p-1.5">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-text-faint)]">
            Show columns
          </p>
          {COLUMNS.map((col) => {
            const checked = visibility[col.key];
            return (
              <label
                key={col.key}
                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm ${
                  col.hideable
                    ? 'cursor-pointer text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                    : 'cursor-not-allowed text-[var(--color-text-faint)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!col.hideable}
                  onChange={(e) => onToggle(col.key, e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[var(--color-border-strong)] text-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary)]/30"
                />
                <span>{col.label}</span>
                {!col.hideable && <span className="ml-auto text-[10px]">always on</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Header cell ─────────────────────────────────────────────────────────────
// Hideable columns get a × that appears on hover to hide the column directly.

function HeaderCell({ column, onHide }: { column: Column; onHide: () => void }) {
  return (
    <th
      className={`py-3 px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-text-faint)] ${
        column.align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <span
        className={`group/th inline-flex items-center gap-1.5 ${
          column.align === 'right' ? 'flex-row-reverse' : ''
        }`}
      >
        {column.label}
        {column.hideable && (
          <button
            type="button"
            onClick={onHide}
            title={`Hide ${column.label}`}
            aria-label={`Hide ${column.label} column`}
            className="opacity-0 group-hover/th:opacity-100 focus:opacity-100 rounded p-0.5 text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-opacity"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </span>
    </th>
  );
}

// ─── Contact Row ─────────────────────────────────────────────────────────────

function ContactRow({
  contact,
  columns,
  onSaveField,
  onDelete,
  isDeleting,
}: {
  contact: CallContact;
  columns: Column[];
  onSaveField: (contact: CallContact, field: 'name' | 'phone' | 'business', value: string) => void;
  onDelete: () => void;
  isDeleting?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const renderCell = (col: Column) => {
    switch (col.key) {
      case 'name':
        return (
          <td key={col.key} className="px-4 py-2">
            <EditableCell
              value={contact.name}
              placeholder="Add name…"
              onSave={(v) => onSaveField(contact, 'name', v)}
              className="font-medium text-[var(--color-text-primary)]"
            />
          </td>
        );
      case 'phone':
        return (
          <td key={col.key} className="px-4 py-2">
            <EditableCell
              value={contact.phone}
              placeholder="Add phone…"
              onSave={(v) => onSaveField(contact, 'phone', v)}
              mono
              className="text-[var(--color-text-secondary)]"
            />
          </td>
        );
      case 'business':
        return (
          <td key={col.key} className="px-4 py-2">
            <EditableCell
              value={contact.business ?? ''}
              placeholder="Add business…"
              onSave={(v) => onSaveField(contact, 'business', v)}
              className="text-[var(--color-text-secondary)]"
            />
          </td>
        );
      case 'call_count':
        return (
          <td key={col.key} className="px-4 py-2 text-right">
            <CallCountBadge count={contact.call_count ?? 0} />
          </td>
        );
      case 'last_called':
        return (
          <td key={col.key} className="px-4 py-2 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
            {formatDate(contact.last_called_at)}
          </td>
        );
      case 'added':
        return (
          <td key={col.key} className="px-4 py-2 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
            {formatDate(contact.created_at)}
          </td>
        );
    }
  };

  return (
    <tr className={`hover:bg-[var(--color-bg-hover)] transition-colors ${isDeleting ? 'opacity-50' : ''}`}>
      {columns.map(renderCell)}
      <td className="px-4 py-2 text-right">
        {confirmDelete ? (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="px-2 py-1 text-[11px] font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 text-[11px] font-medium rounded-md border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            title="Delete contact"
            className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Call count badge ────────────────────────────────────────────────────────

function CallCountBadge({ count }: { count: number }) {
  if (count <= 0) {
    return <span className="text-xs text-[var(--color-text-faint)] tabular-nums">0</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--color-accent-primary)]">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
      {count}
    </span>
  );
}

// ─── Editable Cell ───────────────────────────────────────────────────────────

function EditableCell({
  value,
  placeholder,
  onSave,
  mono,
  className,
}: {
  value: string;
  placeholder: string;
  onSave: (value: string) => void;
  mono?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        className={`w-full min-w-[120px] px-2 py-1 rounded-md border border-[var(--color-accent-primary)] bg-[var(--color-input-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/20 ${mono ? 'font-mono text-xs tabular-nums' : 'text-sm'}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      title="Click to edit"
      className={`group/cell w-full text-left px-2 py-1 rounded-md hover:bg-[var(--color-bg-secondary)] border border-transparent hover:border-[var(--color-border-default)] transition-colors flex items-center gap-1.5 ${mono ? 'font-mono text-xs tabular-nums' : 'text-sm'}`}
    >
      <span className={`truncate ${value ? (className ?? '') : 'text-[var(--color-text-faint)] italic'}`}>
        {value || placeholder}
      </span>
      <svg className="w-3 h-3 shrink-0 text-[var(--color-text-faint)] opacity-0 group-hover/cell:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    </button>
  );
}

// ─── Add Row ─────────────────────────────────────────────────────────────────

function AddRow({
  columns,
  onCancel,
  onSave,
  isSaving,
}: {
  columns: Column[];
  onCancel: () => void;
  onSave: (values: { name: string; phone: string; business?: string }) => void;
  isSaving?: boolean;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [business, setBusiness] = useState('');

  const submit = () => {
    if (!name.trim() || !phone.trim()) {
      toast.error('Name and phone are required');
      return;
    }
    onSave({ name: name.trim(), phone: phone.trim(), business: business.trim() || undefined });
  };

  const inputClass =
    'w-full min-w-[120px] px-2 py-1.5 rounded-md border border-[var(--color-border-default)] bg-[var(--color-input-bg)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/20 focus:border-[var(--color-border-strong)]';

  const renderCell = (col: Column) => {
    switch (col.key) {
      case 'name':
        return (
          <td key={col.key} className="px-4 py-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
              placeholder="Name *"
              className={inputClass}
            />
          </td>
        );
      case 'phone':
        return (
          <td key={col.key} className="px-4 py-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
              placeholder="Phone *"
              className={`${inputClass} font-mono text-xs`}
            />
          </td>
        );
      case 'business':
        return (
          <td key={col.key} className="px-4 py-2">
            <input
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
              placeholder="Business (optional)"
              className={inputClass}
            />
          </td>
        );
      // Non-editable columns: empty placeholder cells so the row stays aligned.
      default:
        return <td key={col.key} className="px-4 py-2" />;
    }
  };

  return (
    <tr className="bg-[var(--color-accent-light)]/40">
      {columns.map(renderCell)}
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={submit}
            disabled={isSaving}
            className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}
