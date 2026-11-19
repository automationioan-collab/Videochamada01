import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Edit3,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { CallPlan } from '../types/studio';

interface CallPlansManagerProps {
  plans: CallPlan[];
  onSavePlan: (input: {
    id?: string;
    name: string;
    description: string;
    durationMinutes: number;
    priceCents: number;
    active: boolean;
    sortOrder: number;
  }) => Promise<void>;
  onDeletePlan: (planId: string) => Promise<void>;
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const CallPlansManager: React.FC<CallPlansManagerProps> = ({
  plans,
  onSavePlan,
  onDeletePlan,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('15');
  const [priceBrl, setPriceBrl] = useState('129.00');
  const [sortOrder, setSortOrder] = useState('1');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const activeCount = useMemo(
    () => plans.filter((p) => p.active).length,
    [plans]
  );

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setDurationMinutes('15');
    setPriceBrl('129.00');
    setSortOrder(String(plans.length + 1));
    setShowForm(false);
  };

  const openEdit = (plan: CallPlan) => {
    setEditingId(plan.id);
    setName(plan.name);
    setDescription(plan.description);
    setDurationMinutes(String(plan.durationMinutes));
    setPriceBrl((plan.priceCents / 100).toFixed(2));
    setSortOrder(String(plan.sortOrder));
    setShowForm(true);
    setFeedback(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const cleanName = name.trim();
    const cleanDesc = description.trim();
    if (!cleanName || !cleanDesc) return;

    const mins = Math.max(1, Math.min(240, Number(durationMinutes) || 10));
    const parsedPrice = Number(priceBrl.replace(',', '.'));
    const cents = Math.max(
      100,
      Math.round((Number.isFinite(parsedPrice) ? parsedPrice : 1) * 100)
    );
    const order = Math.max(0, Math.min(100, Number(sortOrder) || 1));

    const existing = editingId ? plans.find((p) => p.id === editingId) : null;

    setSaving(true);
    setFeedback(null);
    try {
      await onSavePlan({
        ...(editingId ? { id: editingId } : {}),
        name: cleanName,
        description: cleanDesc,
        durationMinutes: mins,
        priceCents: cents,
        active: existing ? existing.active : true,
        sortOrder: order,
      });
      setFeedback(
        editingId
          ? `Plano "${cleanName}" atualizado.`
          : `Novo plano "${cleanName}" criado e disponível para visitantes.`
      );
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (plan: CallPlan) => {
    if (saving) return;
    if (plan.active && activeCount <= 1) {
      setFeedback(
        'Mantenha pelo menos 1 plano ativo para cobrar as videochamadas dos internautas.'
      );
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await onSavePlan({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        durationMinutes: plan.durationMinutes,
        priceCents: plan.priceCents,
        active: !plan.active,
        sortOrder: plan.sortOrder,
      });
      setFeedback(
        !plan.active
          ? `Plano "${plan.name}" reativado.`
          : `Plano "${plan.name}" pausado.`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (plan: CallPlan) => {
    if (saving) return;
    if (plan.active && activeCount <= 1) {
      setFeedback(
        'Não é possível excluir o único plano ativo. Crie ou ative outro plano antes.'
      );
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await onDeletePlan(plan.id);
      if (editingId === plan.id) resetForm();
      setFeedback(`Plano "${plan.name}" removido.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="call-plans-heading"
      className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden"
    >
      <div className="p-6 border-b border-[#F4C2D7]/15 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#F4C2D7] shrink-0" />
            <h2
              id="call-plans-heading"
              className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]"
            >
              Planos Pré-Definidos de Videochamada
            </h2>
          </div>
          <p className="text-xs text-[#C9BAC4]">
            Todas as videochamadas de internautas exigem a escolha e pré-autorização de um dos pacotes abaixo ({activeCount} ativo{activeCount === 1 ? '' : 's'}).
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (showForm) {
              resetForm();
            } else {
              setEditingId(null);
              setName('');
              setDescription('');
              setDurationMinutes('15');
              setPriceBrl('129.00');
              setSortOrder(String(plans.length + 1));
              setShowForm(true);
            }
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer"
        >
          {showForm ? (
            <>
              <X className="w-3.5 h-3.5" />
              <span>Fechar Formulário</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Plano</span>
            </>
          )}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-6 bg-[#150D1D] border-b border-[#F4C2D7]/15 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-5 space-y-1.5">
              <label
                htmlFor="plan-name"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Nome do plano
              </label>
              <input
                id="plan-name"
                type="text"
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Sessão Privada · 30 min"
                className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label
                htmlFor="plan-duration"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Duração (min)
              </label>
              <input
                id="plan-duration"
                type="number"
                required
                min={1}
                max={240}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <label
                htmlFor="plan-price"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Valor (R$)
              </label>
              <input
                id="plan-price"
                type="text"
                required
                value={priceBrl}
                onChange={(e) => setPriceBrl(e.target.value)}
                placeholder="159.00"
                className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label
                htmlFor="plan-order"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Ordem
              </label>
              <input
                id="plan-order"
                type="number"
                min={0}
                max={100}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1 space-y-1.5">
              <label
                htmlFor="plan-desc"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Descrição exibida ao internauta
              </label>
              <input
                id="plan-desc"
                type="text"
                required
                maxLength={200}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Atendimento exclusivo 1-para-1 em vídeo HD e chat privado."
                className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 transition-all whitespace-nowrap shrink-0 cursor-pointer h-[38px]"
            >
              {saving
                ? 'Salvando...'
                : editingId
                  ? 'Atualizar Plano'
                  : 'Cadastrar Plano'}
            </button>
          </div>
        </form>
      )}

      {feedback && (
        <div
          role="status"
          className="px-6 py-3 bg-[#16A34A]/10 border-b border-[#16A34A]/30 text-xs text-[#86EFAC] flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {plans.length === 0 ? (
        <div className="p-10 text-center space-y-1.5">
          <p className="text-sm font-medium text-[#FAF4F7]">
            Nenhum plano cadastrado ainda.
          </p>
          <p className="text-xs text-[#C9BAC4]">
            Adicione um plano acima para liberar a cobrança das videochamadas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#F4C2D7]/15">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-medium ${
                      plan.active ? 'text-[#86EFAC]' : 'text-[#938291]'
                    }`}
                  >
                    {plan.active ? 'Ativo na vitrine' : 'Pausado'}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-[#F4C2D7]">
                    {plan.durationMinutes} min
                  </span>
                </div>
                <h3 className="font-display text-xl font-semibold text-[#FAF4F7]">
                  {plan.name}
                </h3>
                <p className="text-2xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
                  {BRL_FORMATTER.format(plan.priceCents / 100)}
                </p>
                <p className="text-xs text-[#C9BAC4] leading-relaxed">
                  {plan.description}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#F4C2D7]/15">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleToggleActive(plan)}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {plan.active ? 'Pausar' : 'Ativar'}
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => openEdit(plan)}
                    aria-label={`Editar ${plan.name}`}
                    className="p-1.5 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleDelete(plan)}
                    aria-label={`Excluir ${plan.name}`}
                    className="p-1.5 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
