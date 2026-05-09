import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  Plus,
  Pencil,
  Trash2,
  FileDown,
  Mail,
  MessageCircle,
  Send,
  Table,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  accountingApi,
  clientsApi,
  downloadExport,
  expensesApi,
  invoicesApi,
  paymentsApi,
} from '@/services/api';
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell';
import { DashboardMetricCard, type DashboardMetricSpec } from '@/components/dashboard/DashboardMetricCard';
import { DASH_GREEN, DASH_CORAL, DASH_METRIC_STYLES, DASH_PURPLE, DASH_BLUE, DASH_ORANGE, DASH_AMBER } from '@/lib/dashboardTheme';
import { APP_CURRENCY_CODE, APP_CURRENCY_LABEL, formatMoneyWithLabel, labelForCurrencyCode } from '@/lib/currency';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface PaymentItem {
  id: string;
  clientId: string;
  amount: string;
  currency: string;
  method: string;
  paidAt: string;
  createdAt: string;
}

interface ExpenseItem {
  id: string;
  libelle: string;
  amount: string;
  currency: string;
  categorie: string | null;
  spentAt: string;
  createdAt: string;
}

interface InvoiceItem {
  id: string;
  clientId: string;
  numero: string;
  dateEmission: string;
  dateEcheance: string | null;
  statut: string;
  montantTtc: string;
  currency: string;
  notes: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  createdAt: string;
}

type InvoiceDeliveryChannel = 'email' | 'whatsapp';

interface InvoiceDeliveryResult {
  channel: 'email' | 'whatsapp' | 'none';
  status: 'sent' | 'pending' | 'missing_contact';
  message: string;
  pdfUrl?: string | null;
  whatsappUrl?: string | null;
}

interface ClientItem {
  id: string;
  nom: string;
  prenom: string;
}

interface MonthlyRow {
  month: string;
  label: string;
  revenue: number;
  expenses: number;
}

interface MethodRow {
  method: string;
  total: number;
}

interface AccountingSummary {
  pending_invoices: number;
  monthly: MonthlyRow[];
  payments_by_method: MethodRow[];
}

interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

const INVOICE_STATUT_LABELS: Record<string, string> = {
  brouillon: 'Brouillon',
  envoyee: 'En attente de paiement',
  payee: 'Payée',
  annulee: 'Annulée',
};

const PIE_COLORS = [DASH_GREEN, DASH_BLUE, DASH_PURPLE, DASH_ORANGE, DASH_AMBER, DASH_CORAL];

export default function Comptabilite() {
  const { toast } = useToast();
  const [tab, setTab] = useState('overview');
  const [pagePayments, setPagePayments] = useState(1);
  const [pageExpenses, setPageExpenses] = useState(1);
  const [pageInvoices, setPageInvoices] = useState(1);

  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletePayment, setDeletePayment] = useState<PaymentItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [paymentsMeta, setPaymentsMeta] = useState<PaginationMeta | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseDialogMode, setExpenseDialogMode] = useState<'create' | 'edit'>('create');
  const [expenseEditingId, setExpenseEditingId] = useState<string | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<ExpenseItem | null>(null);
  const [expenseDeleting, setExpenseDeleting] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [expensesMeta, setExpensesMeta] = useState<PaginationMeta | null>(null);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    libelle: '',
    amount: '',
    spent_at: '',
    categorie: '',
  });

  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoiceDialogMode, setInvoiceDialogMode] = useState<'create' | 'edit'>('create');
  const [invoiceEditingId, setInvoiceEditingId] = useState<string | null>(null);
  const [deleteInvoice, setDeleteInvoice] = useState<InvoiceItem | null>(null);
  const [invoiceDeleting, setInvoiceDeleting] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [invoicesMeta, setInvoicesMeta] = useState<PaginationMeta | null>(null);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    client_id: '',
    date_emission: '',
    date_echeance: '',
    statut: 'brouillon',
    amount: '',
    notes: '',
    numero: '',
    auto_send: true,
    send_email: true,
    send_whatsapp: true,
  });

  const [clients, setClients] = useState<ClientItem[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    client_id: '',
    amount: '',
    paid_at: '',
    method: 'Virement',
  });

  const emptyPaymentForm = () => ({
    client_id: '',
    amount: '',
    paid_at: '',
    method: 'Virement',
  });

  const emptyExpenseForm = () => ({
    libelle: '',
    amount: '',
    spent_at: '',
    categorie: '',
  });

  const emptyInvoiceForm = () => ({
    client_id: '',
    date_emission: '',
    date_echeance: '',
    statut: 'brouillon',
    amount: '',
    notes: '',
    numero: '',
    auto_send: true,
    send_email: true,
    send_whatsapp: true,
  });

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setError('');
    try {
      const res = await accountingApi.summary();
      const s = res.data as AccountingSummary;
      setSummary({
        pending_invoices: Number(s?.pending_invoices ?? 0),
        monthly: Array.isArray(s?.monthly) ? s.monthly : [],
        payments_by_method: Array.isArray(s?.payments_by_method) ? s.payments_by_method : [],
      });
    } catch {
      setSummary({
        pending_invoices: 0,
        monthly: [],
        payments_by_method: [],
      });
      setError('Impossible de charger la synthèse comptable.');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadClients = useCallback(async () => {
    if (clientsLoaded) return;
    try {
      const res = await clientsApi.getOptions({ limit: '200' });
      setClients((res.data?.data ?? []) as ClientItem[]);
      setClientsLoaded(true);
    } catch {
      setError('Impossible de charger la liste des clients.');
    }
  }, [clientsLoaded]);

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const res = await paymentsApi.getAll({ per_page: '20', page: String(pagePayments) });
      setPayments((res.data?.data ?? []) as PaymentItem[]);
      setPaymentsMeta((res.data?.meta ?? null) as PaginationMeta | null);
    } catch {
      setPayments([]);
      setPaymentsMeta(null);
      setError('Impossible de charger les paiements.');
    } finally {
      setPaymentsLoading(false);
    }
  }, [pagePayments]);

  const loadExpenses = useCallback(async () => {
    setExpensesLoading(true);
    try {
      const res = await expensesApi.getAll({ per_page: '20', page: String(pageExpenses) });
      setExpenses((res.data?.data ?? []) as ExpenseItem[]);
      setExpensesMeta((res.data?.meta ?? null) as PaginationMeta | null);
    } catch {
      setExpenses([]);
      setExpensesMeta(null);
      setError('Impossible de charger les dépenses.');
    } finally {
      setExpensesLoading(false);
    }
  }, [pageExpenses]);

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const res = await invoicesApi.getAll({ per_page: '20', page: String(pageInvoices) });
      setInvoices((res.data?.data ?? []) as InvoiceItem[]);
      setInvoicesMeta((res.data?.meta ?? null) as PaginationMeta | null);
    } catch {
      setInvoices([]);
      setInvoicesMeta(null);
      setError('Impossible de charger les factures.');
    } finally {
      setInvoicesLoading(false);
    }
  }, [pageInvoices]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (tab === 'payments') {
      void loadClients();
      void loadPayments();
    } else if (tab === 'expenses') {
      void loadExpenses();
    } else if (tab === 'invoices') {
      void loadClients();
      void loadInvoices();
    }
  }, [tab, loadClients, loadPayments, loadExpenses, loadInvoices]);

  const clientNames = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.id, `${c.prenom} ${c.nom}`));
    return map;
  }, [clients]);

  const totalRevenue = (summary?.monthly ?? []).reduce((sum, m) => sum + Number(m.revenue || 0), 0);
  const totalExpenseAmount = (summary?.monthly ?? []).reduce((sum, m) => sum + Number(m.expenses || 0), 0);
  const pendingCount = summary?.pending_invoices ?? 0;
  const netProfit = totalRevenue - totalExpenseAmount;

  const stats = useMemo((): DashboardMetricSpec[] => {
    return [
      {
        label: 'Revenus totaux',
        value: formatMoneyWithLabel(totalRevenue),
        icon: TrendingUp,
        ...DASH_METRIC_STYLES.green,
      },
      {
        label: 'Dépenses',
        value: formatMoneyWithLabel(totalExpenseAmount),
        icon: TrendingDown,
        ...DASH_METRIC_STYLES.coral,
      },
      { label: 'Factures en attente', value: String(pendingCount), icon: Receipt, ...DASH_METRIC_STYLES.amber },
      {
        label: 'Bénéfice net',
        value: formatMoneyWithLabel(netProfit),
        icon: DollarSign,
        ...DASH_METRIC_STYLES.orange,
      },
    ];
  }, [totalRevenue, totalExpenseAmount, pendingCount, netProfit]);

  const monthlyRevenueChart = useMemo(
    () => (summary?.monthly ?? []).map((m) => ({ label: m.label, revenus: m.revenue })),
    [summary?.monthly]
  );

  const monthlyExpenseChart = useMemo(
    () => (summary?.monthly ?? []).map((m) => ({ label: m.label, depenses: m.expenses })),
    [summary?.monthly]
  );

  const compareChart = useMemo(
    () =>
      (summary?.monthly ?? []).map((m) => ({
        label: m.label,
        revenus: m.revenue,
        depenses: m.expenses,
      })),
    [summary?.monthly]
  );

  const pieByMethod = useMemo(() => {
    const rows = summary?.payments_by_method ?? [];
    return rows
      .filter((r) => r.total > 0)
      .map((r, i) => ({
        name: r.method,
        value: r.total,
        color: PIE_COLORS[i % PIE_COLORS.length],
      }));
  }, [summary?.payments_by_method]);

  const openCreatePayment = () => {
    setDialogMode('create');
    setEditingId(null);
    setForm(emptyPaymentForm());
    setDialogOpen(true);
  };

  const openEditPayment = (p: PaymentItem) => {
    setDialogMode('edit');
    setEditingId(p.id);
    setForm({
      client_id: p.clientId,
      amount: String(p.amount),
      paid_at: p.paidAt || '',
      method: p.method,
    });
    setDialogOpen(true);
  };

  const handleSubmitPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.client_id) return;
    setSaving(true);
    try {
      const payload = {
        client_id: Number(form.client_id),
        amount: Number(form.amount),
        paid_at: form.paid_at || null,
        method: form.method,
        currency: APP_CURRENCY_CODE,
      };
      if (dialogMode === 'create') {
        await paymentsApi.create(payload);
      } else if (editingId) {
        await paymentsApi.update(editingId, payload);
      }
      setDialogOpen(false);
      setForm(emptyPaymentForm());
      setDialogMode('create');
      setEditingId(null);
      await Promise.all([loadPayments(), loadSummary()]);
    } catch {
      setError(dialogMode === 'create' ? "Impossible d'enregistrer le paiement." : 'Impossible de mettre à jour le paiement.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeletePayment = async () => {
    if (!deletePayment) return;
    setDeleting(true);
    try {
      await paymentsApi.delete(deletePayment.id);
      setDeletePayment(null);
      await Promise.all([loadPayments(), loadSummary()]);
    } catch {
      setError('Impossible de supprimer le paiement.');
    } finally {
      setDeleting(false);
    }
  };

  const openCreateExpense = () => {
    setExpenseDialogMode('create');
    setExpenseEditingId(null);
    setExpenseForm(emptyExpenseForm());
    setExpenseDialogOpen(true);
  };

  const openEditExpense = (x: ExpenseItem) => {
    setExpenseDialogMode('edit');
    setExpenseEditingId(x.id);
    setExpenseForm({
      libelle: x.libelle,
      amount: String(x.amount),
      spent_at: x.spentAt || '',
      categorie: x.categorie ?? '',
    });
    setExpenseDialogOpen(true);
  };

  const handleSubmitExpense = async (e: FormEvent) => {
    e.preventDefault();
    if (!expenseForm.libelle) return;
    setSaving(true);
    try {
      const payload = {
        libelle: expenseForm.libelle,
        amount: Number(expenseForm.amount),
        spent_at: expenseForm.spent_at || null,
        categorie: expenseForm.categorie || null,
        currency: APP_CURRENCY_CODE,
      };
      if (expenseDialogMode === 'create') {
        await expensesApi.create(payload);
      } else if (expenseEditingId) {
        await expensesApi.update(expenseEditingId, payload);
      }
      setExpenseDialogOpen(false);
      setExpenseForm(emptyExpenseForm());
      setExpenseDialogMode('create');
      setExpenseEditingId(null);
      await Promise.all([loadExpenses(), loadSummary()]);
    } catch {
      setError(
        expenseDialogMode === 'create' ? "Impossible d'enregistrer la dépense." : 'Impossible de mettre à jour la dépense.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteExpense = async () => {
    if (!deleteExpense) return;
    setExpenseDeleting(true);
    try {
      await expensesApi.delete(deleteExpense.id);
      setDeleteExpense(null);
      await Promise.all([loadExpenses(), loadSummary()]);
    } catch {
      setError('Impossible de supprimer la dépense.');
    } finally {
      setExpenseDeleting(false);
    }
  };

  const openCreateInvoice = () => {
    setInvoiceDialogMode('create');
    setInvoiceEditingId(null);
    setInvoiceForm(emptyInvoiceForm());
    setInvoiceDialogOpen(true);
  };

  const openEditInvoice = (inv: InvoiceItem) => {
    setInvoiceDialogMode('edit');
    setInvoiceEditingId(inv.id);
    setInvoiceForm({
      client_id: inv.clientId,
      date_emission: inv.dateEmission || '',
      date_echeance: inv.dateEcheance || '',
      statut: inv.statut,
      amount: String(inv.montantTtc),
      notes: inv.notes ?? '',
      numero: inv.numero,
      auto_send: true,
      send_email: true,
      send_whatsapp: true,
    });
    setInvoiceDialogOpen(true);
  };

  const sendInvoiceToChannels = async (invoiceId: string, channels: InvoiceDeliveryChannel[]) => {
    if (channels.length === 0) return;
    const tasks = channels.map(async (channel) => {
      if (channel === 'email') {
        await invoicesApi.sendEmail(invoiceId);
        return 'email';
      }
      const res = await invoicesApi.getShareLinks(invoiceId);
      const url = (res.data?.data?.whatsappUrl ?? '') as string;
      if (!url) {
        throw new Error('WHATSAPP_UNAVAILABLE');
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      return 'whatsapp';
    });

    const results = await Promise.allSettled(tasks);
    const success = results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<string>).value);
    const failed = results.filter((r) => r.status === 'rejected');

    if (success.length > 0) {
      toast({
        title: 'Envoi préparé',
        description: `Canal${success.length > 1 ? 'x' : ''} prêt${success.length > 1 ? 's' : ''}: ${success.join(', ')}`,
      });
    }
    if (failed.length > 0) {
      setError("Une partie de l'envoi du reçu a échoué.");
    }
  };

  const handleAutoDeliveryResult = (delivery: InvoiceDeliveryResult | null, opts?: { openWhatsapp?: boolean }) => {
    if (!delivery) return;

    if (delivery.channel === 'email' && delivery.status === 'sent') {
      toast({
        title: 'Facture envoyée',
        description: delivery.message,
      });
      return;
    }

    if (delivery.channel === 'whatsapp' && delivery.whatsappUrl) {
      if (opts?.openWhatsapp) {
        window.open(delivery.whatsappUrl, '_blank', 'noopener,noreferrer');
      }
      toast({
        title: 'Envoi WhatsApp prêt',
        description: delivery.message,
      });
      return;
    }

    if (delivery.channel === 'none' || delivery.status === 'missing_contact') {
      setError(delivery.message || "Aucun contact client disponible pour l'envoi.");
    }
  };

  const handleSubmitInvoice = async (e: FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.client_id) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        client_id: Number(invoiceForm.client_id),
        date_emission: invoiceForm.date_emission || null,
        date_echeance: invoiceForm.date_echeance || null,
        statut: invoiceForm.statut,
        amount: Number(invoiceForm.amount),
        notes: invoiceForm.notes || null,
        currency: APP_CURRENCY_CODE,
      };
      if (invoiceDialogMode === 'edit' && invoiceForm.numero) {
        payload.numero = invoiceForm.numero;
      }
      let invoiceIdForSend: string | null = null;
      let createDelivery: InvoiceDeliveryResult | null = null;
      if (invoiceDialogMode === 'create') {
        const created = await invoicesApi.create(payload);
        invoiceIdForSend = (created.data?.data?.id ?? null) as string | null;
        createDelivery = (created.data?.delivery ?? null) as InvoiceDeliveryResult | null;
      } else if (invoiceEditingId) {
        const updated = await invoicesApi.update(invoiceEditingId, payload);
        invoiceIdForSend = (updated.data?.data?.id ?? invoiceEditingId) as string | null;
      }

      if (invoiceDialogMode === 'create') {
        handleAutoDeliveryResult(createDelivery, { openWhatsapp: invoiceForm.auto_send && invoiceForm.send_whatsapp });
      }

      const shouldAutoSend = invoiceForm.auto_send && ['envoyee', 'payee'].includes(invoiceForm.statut);
      // Pour une création, l'API envoie déjà automatiquement (email/whatsapp) et renvoie `delivery`.
      // On conserve l'envoi manuel automatique uniquement en mode édition.
      if (invoiceDialogMode === 'edit' && shouldAutoSend && invoiceIdForSend) {
        const channels: InvoiceDeliveryChannel[] = [];
        if (invoiceForm.send_email) channels.push('email');
        if (invoiceForm.send_whatsapp) channels.push('whatsapp');
        await sendInvoiceToChannels(invoiceIdForSend, channels);
      }
      setInvoiceDialogOpen(false);
      setInvoiceForm(emptyInvoiceForm());
      setInvoiceDialogMode('create');
      setInvoiceEditingId(null);
      await Promise.all([loadInvoices(), loadSummary()]);
    } catch {
      setError(
        invoiceDialogMode === 'create' ? "Impossible d'enregistrer la facture." : 'Impossible de mettre à jour la facture.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteInvoice = async () => {
    if (!deleteInvoice) return;
    setInvoiceDeleting(true);
    try {
      await invoicesApi.delete(deleteInvoice.id);
      setDeleteInvoice(null);
      await Promise.all([loadInvoices(), loadSummary()]);
    } catch {
      setError('Impossible de supprimer la facture.');
    } finally {
      setInvoiceDeleting(false);
    }
  };

  const handleDownloadInvoicePdf = async (id: string, numero: string) => {
    try {
      const res = await invoicesApi.downloadPdf(id);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `facture-${numero}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Impossible de télécharger le PDF.');
    }
  };

  const handleSendInvoice = async (id: string, channels: InvoiceDeliveryChannel[]) => {
    try {
      await sendInvoiceToChannels(id, channels);
    } catch {
      setError("Impossible d'envoyer le recu.");
    }
  };

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {tab === 'overview' && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-200 bg-white text-slate-900 hover:bg-slate-50 hover:text-slate-900"
            onClick={() => void downloadExport('/exports/payments.csv', 'paiements.csv')}
          >
            <Table size={14} className="mr-1.5 shrink-0" />
            CSV paiements
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-200 bg-white text-slate-900 hover:bg-slate-50 hover:text-slate-900"
            onClick={() => void downloadExport('/exports/expenses.csv', 'depenses.csv')}
          >
            <Table size={14} className="mr-1.5 shrink-0" />
            CSV dépenses
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-200 bg-white text-slate-900 hover:bg-slate-50 hover:text-slate-900"
            onClick={() => void downloadExport('/exports/accounting.xlsx', 'comptabilite.xlsx')}
          >
            Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-200 bg-white text-slate-900 hover:bg-slate-50 hover:text-slate-900"
            onClick={() => void downloadExport('/exports/accounting.pdf', 'rapport.pdf')}
          >
            PDF rapport
          </Button>
        </>
      )}
      {tab === 'payments' && (
        <Button
          type="button"
          className="border-0 bg-white text-slate-900 shadow-sm hover:bg-slate-50 hover:text-slate-900"
          onClick={openCreatePayment}
        >
          <Plus size={16} className="mr-2 shrink-0" />
          Nouveau paiement
        </Button>
      )}
      {tab === 'expenses' && (
        <Button
          type="button"
          className="border-0 bg-white text-slate-900 shadow-sm hover:bg-slate-50 hover:text-slate-900"
          onClick={openCreateExpense}
        >
          <Plus size={16} className="mr-2 shrink-0" />
          Nouvelle dépense
        </Button>
      )}
      {tab === 'invoices' && (
        <Button
          type="button"
          className="border-0 bg-white text-slate-900 shadow-sm hover:bg-slate-50 hover:text-slate-900"
          onClick={openCreateInvoice}
        >
          <Plus size={16} className="mr-2 shrink-0" />
          Nouvelle facture
        </Button>
      )}
    </div>
  );

  return (
    <DashboardPageShell
      title="Comptabilité"
      subtitle="Suivi financier et facturation"
      stripLabel="Indicateurs et graphiques"
      headerActions={headerActions}
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      <AlertDialog open={!!deletePayment} onOpenChange={(open) => !open && setDeletePayment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce paiement ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le montant enregistré sera retiré des statistiques. Cette action est définitive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleConfirmDeletePayment()}
            >
              {deleting ? 'Suppression…' : 'Supprimer'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteExpense} onOpenChange={(open) => !open && setDeleteExpense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette dépense ?</AlertDialogTitle>
            <AlertDialogDescription>Action irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={expenseDeleting}>Annuler</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={expenseDeleting}
              onClick={() => void handleConfirmDeleteExpense()}
            >
              {expenseDeleting ? 'Suppression…' : 'Supprimer'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteInvoice} onOpenChange={(open) => !open && setDeleteInvoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette facture ?</AlertDialogTitle>
            <AlertDialogDescription>Action irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={invoiceDeleting}>Annuler</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={invoiceDeleting}
              onClick={() => void handleConfirmDeleteInvoice()}
            >
              {invoiceDeleting ? 'Suppression…' : 'Supprimer'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setForm(emptyPaymentForm());
            setDialogMode('create');
            setEditingId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? 'Enregistrer un paiement' : 'Modifier le paiement'}</DialogTitle>
          </DialogHeader>
          <form className="form-surface space-y-4 mt-2 p-4" onSubmit={handleSubmitPayment}>
            <div className="space-y-1.5">
              <Label>Client</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.client_id}
                onChange={(e) => setForm((p) => ({ ...p, client_id: e.target.value }))}
                required
              >
                <option value="">Sélectionner</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.prenom} {c.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Montant ({APP_CURRENCY_LABEL})</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.paid_at}
                  onChange={(e) => setForm((p) => ({ ...p, paid_at: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Méthode de paiement</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.method}
                onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}
              >
                <option>Virement</option>
                <option>Espèces</option>
                <option>Chèque</option>
                <option>Carte</option>
              </select>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Enregistrement...' : dialogMode === 'create' ? 'Enregistrer' : 'Mettre à jour'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={expenseDialogOpen}
        onOpenChange={(open) => {
          setExpenseDialogOpen(open);
          if (!open) {
            setExpenseForm(emptyExpenseForm());
            setExpenseDialogMode('create');
            setExpenseEditingId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{expenseDialogMode === 'create' ? 'Nouvelle dépense' : 'Modifier la dépense'}</DialogTitle>
          </DialogHeader>
          <form className="form-surface space-y-4 mt-2 p-4" onSubmit={handleSubmitExpense}>
            <div className="space-y-1.5">
              <Label>Libellé</Label>
              <Input
                value={expenseForm.libelle}
                onChange={(e) => setExpenseForm((p) => ({ ...p, libelle: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Montant ({APP_CURRENCY_LABEL})</Label>
                <Input
                  type="number"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={expenseForm.spent_at}
                  onChange={(e) => setExpenseForm((p) => ({ ...p, spent_at: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Catégorie (optionnel)</Label>
              <Input
                value={expenseForm.categorie}
                onChange={(e) => setExpenseForm((p) => ({ ...p, categorie: e.target.value }))}
                placeholder="Ex. Loyer, Logiciels…"
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Enregistrement...' : expenseDialogMode === 'create' ? 'Enregistrer' : 'Mettre à jour'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={invoiceDialogOpen}
        onOpenChange={(open) => {
          setInvoiceDialogOpen(open);
          if (!open) {
            setInvoiceForm(emptyInvoiceForm());
            setInvoiceDialogMode('create');
            setInvoiceEditingId(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{invoiceDialogMode === 'create' ? 'Nouvelle facture' : 'Modifier la facture'}</DialogTitle>
          </DialogHeader>
          <form className="form-surface space-y-4 mt-2 p-4" onSubmit={handleSubmitInvoice}>
            {invoiceDialogMode === 'edit' && (
              <div className="space-y-1.5">
                <Label>Numéro</Label>
                <Input value={invoiceForm.numero} onChange={(e) => setInvoiceForm((p) => ({ ...p, numero: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Client</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={invoiceForm.client_id}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, client_id: e.target.value }))}
                required
              >
                <option value="">Sélectionner</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.prenom} {c.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Date d&apos;émission</Label>
                <Input
                  type="date"
                  value={invoiceForm.date_emission}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, date_emission: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Échéance (optionnel)</Label>
                <Input
                  type="date"
                  value={invoiceForm.date_echeance}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, date_echeance: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={invoiceForm.statut}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, statut: e.target.value }))}
                >
                  <option value="brouillon">Brouillon</option>
                  <option value="envoyee">En attente de paiement</option>
                  <option value="payee">Payée</option>
                  <option value="annulee">Annulée</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Montant TTC ({APP_CURRENCY_LABEL})</Label>
                <Input
                  type="number"
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, amount: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optionnel)</Label>
              <Input value={invoiceForm.notes} onChange={(e) => setInvoiceForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Envoi du reçu</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={invoiceForm.auto_send}
                    onCheckedChange={(v) => setInvoiceForm((p) => ({ ...p, auto_send: v === true }))}
                  />
                  Envoyer automatiquement après validation (statut envoyé/payée)
                </label>
                <div className="flex flex-wrap gap-4 pl-6">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={invoiceForm.send_email}
                      onCheckedChange={(v) => setInvoiceForm((p) => ({ ...p, send_email: v === true }))}
                    />
                    Email
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={invoiceForm.send_whatsapp}
                      onCheckedChange={(v) => setInvoiceForm((p) => ({ ...p, send_whatsapp: v === true }))}
                    />
                    WhatsApp
                  </label>
                </div>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Enregistrement...' : invoiceDialogMode === 'create' ? 'Enregistrer' : 'Mettre à jour'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-slate-100/90 p-1 sm:grid-cols-4">
          <TabsTrigger value="overview">Synthèse</TabsTrigger>
          <TabsTrigger value="payments">Paiements</TabsTrigger>
          <TabsTrigger value="expenses">Dépenses</TabsTrigger>
          <TabsTrigger value="invoices">Factures</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <DashboardMetricCard key={s.label} {...s} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="dashboard-chart-card">
              <h2 className="mb-1 text-sm font-semibold text-slate-800">Revenus mensuels</h2>
              <p className="mb-4 text-xs text-slate-500">Encaissements par période</p>
              {monthlyRevenueChart.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">Aucune donnée</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyRevenueChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(v: number) => `${v.toLocaleString('fr-FR')} ${APP_CURRENCY_LABEL}`} />
                    <Bar dataKey="revenus" fill={DASH_GREEN} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="dashboard-chart-card">
              <h2 className="mb-1 text-sm font-semibold text-slate-800">Dépenses mensuelles</h2>
              <p className="mb-4 text-xs text-slate-500">Sorties par période</p>
              {monthlyExpenseChart.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">Aucune donnée</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyExpenseChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(v: number) => `${v.toLocaleString('fr-FR')} ${APP_CURRENCY_LABEL}`} />
                    <Bar dataKey="depenses" fill={DASH_CORAL} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="dashboard-chart-card">
              <h2 className="mb-1 text-sm font-semibold text-slate-800">Paiements par méthode</h2>
              <p className="mb-4 text-xs text-slate-500">Répartition des montants encaissés</p>
              {pieByMethod.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">Aucune donnée</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieByMethod}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={88}
                      dataKey="value"
                      paddingAngle={2}
                      nameKey="name"
                    >
                      {pieByMethod.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="white" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${v.toLocaleString('fr-FR')} ${APP_CURRENCY_LABEL}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="dashboard-chart-card">
              <h2 className="mb-1 text-sm font-semibold text-slate-800">Revenus vs dépenses</h2>
              <p className="mb-4 text-xs text-slate-500">Comparaison mensuelle</p>
              {compareChart.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">Aucune donnée</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={compareChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip
                      formatter={(v: number, name: string) =>
                        [`${v.toLocaleString('fr-FR')} ${APP_CURRENCY_LABEL}`, name === 'revenus' ? 'Revenus' : 'Dépenses']
                      }
                    />
                    <Legend />
                    <Bar dataKey="revenus" fill={DASH_GREEN} name="revenus" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="depenses" fill={DASH_CORAL} name="depenses" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <div className="table-container overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-md">
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Paiements</h2>
            </div>
            <div className="max-h-[min(70vh,520px)] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 shadow-sm backdrop-blur-sm">
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Montant</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">Date</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Méthode</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Statut</th>
                  <th className="text-right p-3 font-medium text-muted-foreground w-[120px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paymentsLoading && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                      Chargement des paiements...
                    </td>
                  </tr>
                )}
                {payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{clientNames.get(p.clientId) ?? `Client #${p.clientId}`}</td>
                    <td className="p-3 font-semibold">
                      {Number(p.amount).toLocaleString('fr-FR')} {labelForCurrencyCode(p.currency)}
                    </td>
                    <td className="p-3 text-muted-foreground hidden sm:table-cell">{p.paidAt}</td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell">{p.method}</td>
                    <td className="p-3">
                      <span
                        className="text-xs px-2.5 py-1 rounded-full font-medium text-white"
                        style={{ backgroundColor: DASH_GREEN }}
                      >
                        Payé
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Modifier le paiement"
                          onClick={() => openEditPayment(p)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label="Supprimer le paiement"
                          onClick={() => setDeletePayment(p)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!paymentsLoading && payments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                      Aucun paiement
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
            {(paymentsMeta?.total ?? 0) > 0 && (
              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {paymentsMeta?.current_page ?? 1} sur {paymentsMeta?.last_page ?? 1} — {paymentsMeta?.total ?? 0} paiement
                  {(paymentsMeta?.total ?? 0) > 1 ? 's' : ''}
                </p>
                {(paymentsMeta?.last_page ?? 1) > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagePayments <= 1}
                      onClick={() => setPagePayments((x) => Math.max(1, x - 1))}
                      aria-label="Page précédente"
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="min-w-[5.5rem] text-center text-sm tabular-nums text-foreground">
                      {paymentsMeta?.current_page ?? 1} / {paymentsMeta?.last_page ?? 1}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagePayments >= (paymentsMeta?.last_page ?? 1)}
                      onClick={() => setPagePayments((x) => Math.min(paymentsMeta?.last_page ?? 1, x + 1))}
                      aria-label="Page suivante"
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="mt-6">
          <div className="table-container overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-md">
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Dépenses</h2>
            </div>
            <div className="max-h-[min(70vh,520px)] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 shadow-sm backdrop-blur-sm">
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Libellé</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Montant</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">Date</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Catégorie</th>
                  <th className="text-right p-3 font-medium text-muted-foreground w-[120px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expensesLoading && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      Chargement des dépenses...
                    </td>
                  </tr>
                )}
                {expenses.map((x) => (
                  <tr key={x.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{x.libelle}</td>
                    <td className="p-3 font-semibold">
                      {Number(x.amount).toLocaleString('fr-FR')} {labelForCurrencyCode(x.currency)}
                    </td>
                    <td className="p-3 text-muted-foreground hidden sm:table-cell">{x.spentAt}</td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell">{x.categorie ?? '—'}</td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Modifier"
                          onClick={() => openEditExpense(x)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label="Supprimer"
                          onClick={() => setDeleteExpense(x)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!expensesLoading && expenses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      Aucune dépense
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
            {(expensesMeta?.total ?? 0) > 0 && (
              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {expensesMeta?.current_page ?? 1} sur {expensesMeta?.last_page ?? 1} — {expensesMeta?.total ?? 0} dépense
                  {(expensesMeta?.total ?? 0) > 1 ? 's' : ''}
                </p>
                {(expensesMeta?.last_page ?? 1) > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pageExpenses <= 1}
                      onClick={() => setPageExpenses((x) => Math.max(1, x - 1))}
                      aria-label="Page précédente"
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="min-w-[5.5rem] text-center text-sm tabular-nums text-foreground">
                      {expensesMeta?.current_page ?? 1} / {expensesMeta?.last_page ?? 1}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pageExpenses >= (expensesMeta?.last_page ?? 1)}
                      onClick={() => setPageExpenses((x) => Math.min(expensesMeta?.last_page ?? 1, x + 1))}
                      aria-label="Page suivante"
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
          <div className="table-container overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-md">
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Factures</h2>
            </div>
            <div className="max-h-[min(70vh,520px)] overflow-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="sticky top-0 z-10 bg-muted/95 shadow-sm backdrop-blur-sm">
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">N°</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Émission</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Statut</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Montant TTC</th>
                    <th className="text-right p-3 font-medium text-muted-foreground w-[220px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoicesLoading && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-muted-foreground">
                        Chargement des factures...
                      </td>
                    </tr>
                  )}
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs">{inv.numero}</td>
                      <td className="p-3 font-medium">{clientNames.get(inv.clientId) ?? `Client #${inv.clientId}`}</td>
                      <td className="p-3 text-muted-foreground">{inv.dateEmission}</td>
                      <td className="p-3 text-xs">{INVOICE_STATUT_LABELS[inv.statut] ?? inv.statut}</td>
                      <td className="p-3 font-semibold">
                        {Number(inv.montantTtc).toLocaleString('fr-FR')} {labelForCurrencyCode(inv.currency)}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="PDF"
                            aria-label="Télécharger PDF"
                            onClick={() => void handleDownloadInvoicePdf(inv.id, inv.numero)}
                          >
                            <FileDown size={16} />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="outline" size="sm" className="h-8">
                                <Send size={14} className="mr-1.5" />
                                Envoyer
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => void handleSendInvoice(inv.id, ['email'])}>
                                <Mail size={14} className="mr-2" />
                                Envoyer par email
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handleSendInvoice(inv.id, ['whatsapp'])}>
                                <MessageCircle size={14} className="mr-2" />
                                Envoyer par WhatsApp
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handleSendInvoice(inv.id, ['email', 'whatsapp'])}>
                                <Send size={14} className="mr-2" />
                                Envoyer sur les deux
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Modifier"
                            onClick={() => openEditInvoice(inv)}
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label="Supprimer"
                            onClick={() => setDeleteInvoice(inv)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!invoicesLoading && invoices.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-muted-foreground">
                        Aucune facture
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {(invoicesMeta?.total ?? 0) > 0 && (
              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {invoicesMeta?.current_page ?? 1} sur {invoicesMeta?.last_page ?? 1} — {invoicesMeta?.total ?? 0} facture
                  {(invoicesMeta?.total ?? 0) > 1 ? 's' : ''}
                </p>
                {(invoicesMeta?.last_page ?? 1) > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pageInvoices <= 1}
                      onClick={() => setPageInvoices((x) => Math.max(1, x - 1))}
                      aria-label="Page précédente"
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="min-w-[5.5rem] text-center text-sm tabular-nums text-foreground">
                      {invoicesMeta?.current_page ?? 1} / {invoicesMeta?.last_page ?? 1}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pageInvoices >= (invoicesMeta?.last_page ?? 1)}
                      onClick={() => setPageInvoices((x) => Math.min(invoicesMeta?.last_page ?? 1, x + 1))}
                      aria-label="Page suivante"
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </DashboardPageShell>
  );
}
