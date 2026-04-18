import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Eye,
  FolderOpen,
  FileText,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { clientsApi, dossiersApi, downloadDossiersExport } from '@/services/api';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell';
import { DOCUMENT_TYPES } from '@/constants/documentTypes';
import { useAuth, type Role } from '@/contexts/AuthContext';

type DossierStatut =
  | 'En cours'
  | 'Complet'
  | 'Terminé'
  | 'En attente'
  | 'Rejeté'
  | 'Accepté'
  | 'Refusé'
  | 'Visa obtenu'
  | 'Visa refusé'
  | 'En attente visa';

interface DossierListItem {
  id: string;
  reference: string;
  client: string;
  clientId: string;
  destination?: string | null;
  type: string;
  statut: DossierStatut;
  date: string;
  documentCount: number;
}

interface DossierDetail extends DossierListItem {
  documents: Array<{ id: string; nom: string; type: string; date: string }>;
}

interface ClientOption {
  id: string;
  nom: string;
  prenom: string;
}

interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

type SortBy = 'reference' | 'client_name' | 'date_ouverture' | 'statut' | 'destination' | 'id';

const statusBadgeClass: Record<string, string> = {
  'En cours': 'border-orange-300 bg-orange-500/15 text-orange-900 dark:text-orange-100',
  Complet: 'border-blue-300 bg-blue-500/15 text-blue-900 dark:text-blue-100',
  Terminé: 'border-emerald-300 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100',
  'En attente': 'border-red-300 bg-red-500/15 text-red-900 dark:text-red-100',
  Rejeté: 'border-slate-300 bg-slate-500/10 text-slate-800 dark:text-slate-200',
  Accepté: 'border-emerald-300 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100',
  Refusé: 'border-rose-300 bg-rose-500/15 text-rose-900 dark:text-rose-100',
  'Visa obtenu': 'border-teal-300 bg-teal-500/15 text-teal-900 dark:text-teal-100',
  'Visa refusé': 'border-fuchsia-300 bg-fuchsia-500/15 text-fuchsia-900 dark:text-fuchsia-100',
  'En attente visa': 'border-amber-300 bg-amber-500/15 text-amber-900 dark:text-amber-100',
};

const STATUT_OPTIONS: DossierStatut[] = [
  'En cours',
  'Complet',
  'Terminé',
  'En attente',
  'Rejeté',
  'Accepté',
  'Refusé',
  'Visa obtenu',
  'Visa refusé',
  'En attente visa',
];

const DESTINATION_GROUPS: { value: string; label: string }[] = [
  { value: '', label: 'Toutes destinations' },
  { value: 'france', label: 'France' },
  { value: 'canada', label: 'Canada' },
  { value: 'maroc', label: 'Maroc' },
  { value: 'autres', label: 'Autres' },
];

const ROLES_CREATE_DOSSIER: Role[] = [
  'directrice',
  'responsable_admin',
  'conseillere_pedagogique',
  'informaticien',
  'commercial',
];
const ROLES_EDIT_DOSSIER: Role[] = ROLES_CREATE_DOSSIER;
const ROLES_DELETE_DOSSIER: Role[] = ['directrice', 'responsable_admin', 'informaticien'];

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 font-semibold text-slate-800 hover:text-slate-950 dark:text-slate-100 ${className ?? ''}`}
    >
      {label}
      <ArrowUpDown
        className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-emerald-600' : 'text-slate-400 opacity-60'}`}
        aria-hidden
      />
      {active && <span className="sr-only">{dir === 'asc' ? 'croissant' : 'décroissant'}</span>}
    </button>
  );
}

export default function Dossiers() {
  const { hasAccess } = useAuth();
  const canCreateDossier = hasAccess(ROLES_CREATE_DOSSIER);
  const canEditDossier = hasAccess(ROLES_EDIT_DOSSIER);
  const canDeleteDossier = hasAccess(ROLES_DELETE_DOSSIER);

  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const setPage = useCallback(
    (value: number | ((prev: number) => number)) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const cur = Math.max(1, parseInt(prev.get('page') || '1', 10) || 1);
          const val = typeof value === 'function' ? value(cur) : value;
          next.set('page', String(Math.max(1, val)));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [dossiers, setDossiers] = useState<DossierListItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedDossier, setSelectedDossier] = useState<DossierDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editForm, setEditForm] = useState({ type: '', statut: 'En cours' as DossierStatut, date_ouverture: '' });
  const [newDossier, setNewDossier] = useState({ client_id: '', type: '', statut: 'En cours' as DossierStatut });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const [filterStatut, setFilterStatut] = useState('');
  const [filterDestinationGroup, setFilterDestinationGroup] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('reference');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const filtersMounted = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    setPage(1);
  }, [debouncedSearch, filterStatut, filterDestinationGroup, filterDateFrom, filterDateTo, setPage]);

  const listParams = useMemo(
    () => ({
      per_page: '10',
      page: String(page),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(filterStatut ? { statut: filterStatut } : {}),
      ...(filterDestinationGroup ? { destination_group: filterDestinationGroup } : {}),
      ...(filterDateFrom ? { date_ouverture_from: filterDateFrom } : {}),
      ...(filterDateTo ? { date_ouverture_to: filterDateTo } : {}),
      sort_by: sortBy,
      sort_dir: sortDir,
    }),
    [
      page,
      debouncedSearch,
      filterStatut,
      filterDestinationGroup,
      filterDateFrom,
      filterDateTo,
      sortBy,
      sortDir,
    ],
  );

  const exportFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      statut: filterStatut || undefined,
      destination_group: filterDestinationGroup || undefined,
      date_ouverture_from: filterDateFrom || undefined,
      date_ouverture_to: filterDateTo || undefined,
      sort_by: sortBy,
      sort_dir: sortDir,
    }),
    [
      debouncedSearch,
      filterStatut,
      filterDestinationGroup,
      filterDateFrom,
      filterDateTo,
      sortBy,
      sortDir,
    ],
  );

  const loadClients = useCallback(async () => {
    try {
      const clientsRes = await clientsApi.getOptions({
        limit: '200',
        ...(clientSearch.trim() ? { search: clientSearch.trim() } : {}),
      });
      setClients((clientsRes.data?.data ?? []) as ClientOption[]);
    } catch {
      /* menu création */
    }
  }, [clientSearch]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await dossiersApi.getAll(listParams);
      const payload = res.data as {
        data?: DossierListItem[];
        meta?: PaginationMeta;
      };
      setDossiers((payload.data ?? []) as DossierListItem[]);
      setMeta(payload.meta ?? null);
    } catch {
      setError('Impossible de charger les dossiers.');
      setDossiers([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [listParams]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = async (row: DossierListItem) => {
    setDetailLoading(true);
    setSelectedDossier(null);
    setError('');
    try {
      const res = await dossiersApi.getById(row.id);
      const d = res.data?.data as DossierDetail | undefined;
      if (d) {
        setSelectedDossier(d);
        setEditForm({
          type: d.type || '',
          statut: d.statut,
          date_ouverture: d.date || '',
        });
      }
    } catch {
      setError('Impossible de charger le détail du dossier.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newDossier.client_id) return;
    setSaving(true);
    try {
      await dossiersApi.create({
        client_id: Number(newDossier.client_id),
        type: newDossier.type || null,
        statut: newDossier.statut,
      });
      setNewDossier({ client_id: '', type: '', statut: 'En cours' });
      await loadList();
    } catch {
      setError("Impossible de créer le dossier.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedDossier) return;
    setSavingEdit(true);
    setError('');
    try {
      await dossiersApi.update(selectedDossier.id, {
        type: editForm.type.trim() || null,
        statut: editForm.statut,
        date_ouverture: editForm.date_ouverture || null,
      });
      await loadList();
      const res = await dossiersApi.getById(selectedDossier.id);
      const d = res.data?.data as DossierDetail | undefined;
      if (d) setSelectedDossier(d);
    } catch {
      setError('Impossible d’enregistrer les modifications.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteDossier = async () => {
    if (!selectedDossier) return;
    if (
      !window.confirm(
        `Supprimer définitivement le dossier ${selectedDossier.reference} ? Les documents resteront en base sans lien dossier.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError('');
    try {
      await dossiersApi.delete(selectedDossier.id);
      setSelectedDossier(null);
      await loadList();
    } catch {
      setError('Impossible de supprimer ce dossier.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSort = (col: SortBy) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'reference' || col === 'id' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const handleExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setExporting(true);
    setError('');
    try {
      await downloadDossiersExport(format, exportFilters);
    } catch {
      setError("L'export a échoué.");
    } finally {
      setExporting(false);
    }
  };

  const lastPage = meta?.last_page ?? 1;
  const total = meta?.total ?? 0;
  const from = meta?.from ?? (total === 0 ? 0 : (page - 1) * 10 + 1);
  const to = meta?.to ?? Math.min(page * 10, total);

  const pageNumbers = useMemo(() => {
    const cur = meta?.current_page ?? page;
    const last = Math.max(1, lastPage);
    const windowStart = Math.max(1, cur - 2);
    const windowEnd = Math.min(last, cur + 2);
    const nums: number[] = [];
    for (let i = windowStart; i <= windowEnd; i++) nums.push(i);
    return nums;
  }, [meta?.current_page, page, lastPage]);

  return (
    <DashboardPageShell
      title="Dossiers"
      subtitle="Suivi des dossiers étudiants et voyages"
      stripLabel="Liste paginée, filtres et exports"
      headerActions={
        canCreateDossier ? (
          <form
            onSubmit={handleCreate}
            className="flex max-w-full flex-wrap items-end gap-3 rounded-xl border border-white/15 bg-white/5 p-3 backdrop-blur-sm sm:p-4"
          >
            <div>
              <label className="mb-1 block text-xs text-white/80">Client</label>
              <select
                className="h-10 rounded-md border border-white/25 bg-white/10 px-3 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                value={newDossier.client_id}
                onChange={(e) => setNewDossier((p) => ({ ...p, client_id: e.target.value }))}
                required
              >
                <option value="" className="text-slate-900">
                  Sélectionner
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id} className="text-slate-900">
                    {c.prenom} {c.nom}
                  </option>
                ))}
              </select>
              <Input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Rechercher un client..."
                className="mt-2 h-9 border-white/25 bg-white/95 text-slate-900 placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/80">Type</label>
              <Input
                value={newDossier.type}
                onChange={(e) => setNewDossier((p) => ({ ...p, type: e.target.value }))}
                placeholder="Visa étudiant..."
                className="w-48 border-white/25 bg-white/95 text-slate-900 placeholder:text-slate-500 shadow-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/80">Statut</label>
              <select
                className="h-10 rounded-md border border-white/25 bg-white/10 px-3 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                value={newDossier.statut}
                onChange={(e) => setNewDossier((p) => ({ ...p, statut: e.target.value as DossierStatut }))}
              >
                {STATUT_OPTIONS.map((s) => (
                  <option key={s} value={s} className="text-slate-900">
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="submit"
              disabled={saving}
              size="default"
              className="h-10 shrink-0 border-0 bg-white text-slate-900 shadow-md ring-1 ring-white/20 hover:bg-white/95"
            >
              <FolderOpen size={16} className="mr-2" aria-hidden />
              {saving ? 'Création...' : 'Nouveau dossier'}
            </Button>
          </form>
        ) : undefined
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end">
        <div className="relative min-w-[min(100%,20rem)] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="bg-card pl-9 shadow-sm"
            placeholder="Client, e-mail, téléphone… Réf. exacte : D-2026-001 ou REF-…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Recherche rapide"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Statut</label>
            <select
              className="h-10 min-w-[10rem] rounded-md border border-input bg-card px-3 text-sm shadow-sm"
              value={filterStatut}
              onChange={(e) => {
                setFilterStatut(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous</option>
              {STATUT_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Destination</label>
            <select
              className="h-10 min-w-[11rem] rounded-md border border-input bg-card px-3 text-sm shadow-sm"
              value={filterDestinationGroup}
              onChange={(e) => {
                setFilterDestinationGroup(e.target.value);
                setPage(1);
              }}
            >
              {DESTINATION_GROUPS.map((d) => (
                <option key={d.value || 'all'} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Ouverture du</label>
            <Input
              type="date"
              className="h-10 w-40 bg-card"
              value={filterDateFrom}
              onChange={(e) => {
                setFilterDateFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Au</label>
            <Input
              type="date"
              className="h-10 w-40 bg-card"
              value={filterDateTo}
              onChange={(e) => {
                setFilterDateTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div className="space-y-1 xl:ml-auto">
          <span className="block text-xs font-medium text-muted-foreground">Exporter</span>
          <div
            className="inline-flex divide-x divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm"
            role="group"
            aria-label="Exporter la liste"
          >
            <Button
              type="button"
              variant="ghost"
              disabled={exporting}
              onClick={() => void handleExport('csv')}
              className="h-10 rounded-none px-4 font-medium text-foreground shadow-none hover:bg-muted/80"
            >
              <Download className="h-4 w-4" aria-hidden />
              CSV
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={exporting}
              onClick={() => void handleExport('xlsx')}
              className="h-10 rounded-none px-4 font-medium text-foreground shadow-none hover:bg-muted/80"
            >
              <Download className="h-4 w-4" aria-hidden />
              Excel
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={exporting}
              onClick={() => void handleExport('pdf')}
              className="h-10 rounded-none px-4 font-medium text-foreground shadow-none hover:bg-muted/80"
            >
              <Download className="h-4 w-4" aria-hidden />
              PDF
            </Button>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {loading
          ? 'Chargement…'
          : total === 0
            ? 'Aucun dossier pour ces critères.'
            : `Affichage ${from}–${to} sur ${total} dossier${total > 1 ? 's' : ''}`}
      </p>

      <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3">
                <SortHeader
                  label="Référence"
                  active={sortBy === 'reference'}
                  dir={sortDir}
                  onClick={() => handleSort('reference')}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Client"
                  active={sortBy === 'client_name'}
                  dir={sortDir}
                  onClick={() => handleSort('client_name')}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Destination"
                  active={sortBy === 'destination'}
                  dir={sortDir}
                  onClick={() => handleSort('destination')}
                />
              </th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Statut"
                  active={sortBy === 'statut'}
                  dir={sortDir}
                  onClick={() => handleSort('statut')}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Date ouverture"
                  active={sortBy === 'date_ouverture'}
                  dir={sortDir}
                  onClick={() => handleSort('date_ouverture')}
                />
              </th>
              <th className="px-4 py-3 text-right">Docs</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-border/60">
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-36" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Skeleton className="ml-auto h-4 w-8" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Skeleton className="ml-auto h-8 w-8 rounded-md" />
                  </td>
                </tr>
              ))}
            {!loading &&
              dossiers.map((d) => (
                <tr key={d.id} className="border-b border-border/60 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium tabular-nums">{d.reference}</td>
                  <td className="px-4 py-3">{d.client}</td>
                  <td className="px-4 py-3 text-muted-foreground">{d.destination ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{d.type || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={statusBadgeClass[d.statut] ?? statusBadgeClass['En cours']}>
                      {d.statut}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{d.date}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{d.documentCount}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" type="button" onClick={() => void openDetail(d)}>
                      <Eye size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {lastPage > 1 && (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Précédent
          </Button>
          <div className="flex flex-wrap items-center justify-center gap-1">
            {pageNumbers.map((n) => (
              <Button
                key={n}
                type="button"
                variant={n === (meta?.current_page ?? page) ? 'default' : 'outline'}
                size="sm"
                className="min-w-9"
                disabled={loading}
                onClick={() => setPage(n)}
              >
                {n}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= lastPage || loading}
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
          >
            Suivant
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      <Dialog
        open={!!selectedDossier || detailLoading}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDossier(null);
            setDetailLoading(false);
          }
        }}
      >
        <DialogContent className="flex max-h-[min(90vh,880px)] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden border-border bg-background p-0 text-foreground shadow-2xl sm:rounded-xl">
          {detailLoading && (
            <div className="p-8 text-center text-muted-foreground">Chargement du dossier…</div>
          )}
          {selectedDossier && !detailLoading && (
            <>
              <DialogHeader className="shrink-0 space-y-1 border-b border-border/80 bg-gradient-to-br from-slate-50/90 to-emerald-50/40 px-6 py-4 pr-14 text-left dark:from-slate-950/80 dark:to-emerald-950/20">
                <DialogTitle className="text-lg font-semibold tracking-tight sm:text-xl">
                  Dossier {selectedDossier.reference}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {selectedDossier.client || 'Client'} · {selectedDossier.documents?.length ?? 0} document
                  {(selectedDossier.documents?.length ?? 0) !== 1 ? 's' : ''}
                </DialogDescription>
                <div className="mt-2">
                  <Badge
                    variant="outline"
                    className={statusBadgeClass[selectedDossier.statut] ?? statusBadgeClass['En cours']}
                  >
                    {selectedDossier.statut}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
                <div className="space-y-6">
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client</span>
                      <p className="mt-0.5 font-medium text-foreground">{selectedDossier.client || '—'}</p>
                    </div>
                    {!canEditDossier && (
                      <>
                        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</span>
                          <p className="mt-0.5 font-medium text-foreground">{selectedDossier.type || '—'}</p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Ouverture
                          </span>
                          <p className="mt-0.5 font-medium text-foreground">{selectedDossier.date || '—'}</p>
                        </div>
                      </>
                    )}
                  </div>

                  {canEditDossier && (
                    <form
                      onSubmit={handleSaveEdit}
                      className="space-y-4 rounded-xl border border-emerald-200/60 bg-emerald-50/30 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/25"
                    >
                      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                          <Pencil size={16} aria-hidden />
                        </span>
                        Modifier le dossier
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Type</label>
                          <Input
                            value={editForm.type}
                            onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}
                            placeholder="Ex. Bulletins, Visa…"
                            className="bg-background"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Date d’ouverture</label>
                          <Input
                            type="date"
                            value={editForm.date_ouverture}
                            onChange={(e) => setEditForm((p) => ({ ...p, date_ouverture: e.target.value }))}
                            className="bg-background"
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-xs font-medium text-muted-foreground">Statut</label>
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                            value={editForm.statut}
                            onChange={(e) => setEditForm((p) => ({ ...p, statut: e.target.value as DossierStatut }))}
                          >
                            {STATUT_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button type="submit" size="sm" disabled={savingEdit} className="bg-emerald-600 hover:bg-emerald-700">
                          {savingEdit ? 'Enregistrement…' : 'Enregistrer'}
                        </Button>
                        {canDeleteDossier && (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={deleting}
                            onClick={() => void handleDeleteDossier()}
                          >
                            <Trash2 size={14} className="mr-1.5" aria-hidden />
                            {deleting ? 'Suppression…' : 'Supprimer le dossier'}
                          </Button>
                        )}
                      </div>
                    </form>
                  )}

                  <Separator className="bg-border/80" />

                  <div>
                    <div className="mb-3">
                      <h3 className="text-base font-semibold text-foreground">
                        Documents ({selectedDossier.documents?.length ?? 0})
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Utilisez la zone de défilement de la fenêtre pour parcourir tout le contenu.
                      </p>
                    </div>

                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Checklist des pièces
                    </p>
                    <div className="mb-4 rounded-lg border border-border/60 bg-muted/15 p-2">
                      <div className="flex flex-wrap gap-2">
                        {DOCUMENT_TYPES.map((type) => {
                          const has = selectedDossier.documents?.some((doc) => doc.type === type);
                          return (
                            <span
                              key={type}
                              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                                has
                                  ? 'border-emerald-300/80 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100'
                                  : 'border-border bg-card text-muted-foreground'
                              }`}
                            >
                              <span className="shrink-0">{has ? '✓' : '○'}</span>
                              <span className="min-w-0 truncate">{type}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {selectedDossier.documents && selectedDossier.documents.length > 0 ? (
                      <div className="space-y-2 rounded-xl border border-border/70 bg-card/50 p-2">
                        <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">Fichiers joints</p>
                        <ul className="space-y-1.5">
                          {selectedDossier.documents.map((doc) => (
                            <li
                              key={doc.id}
                              className="flex min-w-0 items-start gap-3 rounded-lg border border-transparent bg-background/80 px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/40"
                            >
                              <FileText size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                              <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-medium leading-snug text-foreground">{doc.nom}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {doc.type} · {doc.date}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                        <p className="text-sm font-medium text-foreground">Aucun document dans ce dossier</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Ajoutez des documents depuis la page Documents pour compléter ce dossier.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardPageShell>
  );
}
