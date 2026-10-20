import React, { useState } from 'react';
import PremiumModal from '../shared/PremiumModal';
import { useAppStore } from '../../store';
import { useToast } from '../shared/ToastProvider';
import { deleteFoodRule, isQuantityRule, QUANTITY_SUFFIX, ruleLabel, saveFoodRule } from '../../utils/pantry';

/* Corrigir — ou dizer à Carol — como se cozinha uma coisa (bug #52, fase C;
   mockup "Despensa e perguntas da Carol", ecrã 7). Uma regra escrita aqui
   fica confirmada logo, e só o atleta a muda: nem as observações nem as
   respostas lhe mexem (analyze-meal/pantry.ts, nextRuleRow). */
export default function FoodRuleSheet({ rule = null, onClose }) {
  const { profile, loadPantry } = useAppStore();
  const { showToast } = useToast();
  // Fase C dos #58/#66: "Como cozinho" ou "Quanto ponho" — uma de quantidade
  // grava-se com o tema "<alimento> · quantidade", como as que a Carol aprende.
  const [kind, setKind] = useState(rule && isQuantityRule(rule) ? 'quantidade' : 'preparacao');
  const [topic, setTopic] = useState(rule ? ruleLabel(rule) : '');
  const isQty = kind === 'quantidade';
  // Sem "quantidade" escrito à mão no nome — o sufixo põe-se uma vez só.
  const qtyFood = topic.replace(/\s*·?\s*quantidades?\s*$/i, '').trim();
  const savedTopic = rule ? rule.topic : (isQty ? `${qtyFood}${QUANTITY_SUFFIX}` : topic);
  const [value, setValue] = useState(rule?.status === 'varia' ? '' : (rule?.value ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn, done) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await loadPantry?.();
      showToast(done);
      onClose();
    } catch (e) {
      setError(e?.message || 'Não consegui guardar.');
      setBusy(false);
    }
  };

  const input = (id, label, val, set, props = {}) => (
    <label className="block" htmlFor={id}>
      <span className="block text-[11px] mb-1.5" style={{ color: 'var(--text-3)' }}>{label}</span>
      <input
        id={id}
        value={val}
        onChange={(e) => set(e.target.value)}
        className="w-full min-h-[46px] rounded-xl px-3 text-[15px] font-bold outline-none disabled:opacity-60"
        style={{ border: '1px solid var(--border-glass)', background: 'var(--surface-soft)', color: 'var(--text-1)' }}
        {...props}
      />
    </label>
  );

  return (
    <PremiumModal isOpen onClose={onClose} title={rule ? `${ruleLabel(rule)}${isQuantityRule(rule) ? ' · quantidade' : ''}` : (isQty ? 'Quanto costumas pôr' : 'Como cozinhas')} subtitle={rule ? 'O que a Carol usa sem perguntar' : 'A Carol passa a usar isto sem perguntar'} theme="coach" variant="bottom-sheet" maxWidth="max-w-md">
      <div className="px-5 py-4 space-y-3" data-testid="food-rule-sheet">
        {!rule && (
          <div role="group" aria-label="Que tipo de hábito" className="grid grid-cols-2 gap-2">
            {[['preparacao', 'Como cozinho'], ['quantidade', 'Quanto ponho']].map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className="min-h-[44px] rounded-xl text-[13px] font-extrabold"
                style={kind === k
                  ? { background: 'rgba(34,211,238,.16)', border: '1px solid rgba(34,211,238,.6)', color: 'var(--coach)' }
                  : { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.16)', color: 'var(--text-2)' }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {!rule && input('rule-topic', isQty ? 'De quê, e em quê (ex.: azeite na salada, manteiga no pão)' : 'O quê, e em quê (ex.: tempero da salada, ovos fritos)', topic, setTopic, { maxLength: isQty ? 27 : 40 })}
        {input('rule-value', rule?.status === 'varia' ? 'Varia — se afinal é sempre igual, diz como' : isQty ? 'Quanto (ex.: camada fina, um lado (~5 g))' : 'Como (ex.: azeite, azeite e vinagre, sem açúcar)', value, setValue, { maxLength: 60, autoFocus: true })}
        {error && <p role="alert" className="text-[12.5px]" style={{ color: 'var(--danger)' }}>{error}</p>}
        <button
          type="button"
          disabled={busy || !(isQty && !rule ? qtyFood : topic.trim()) || !value.trim()}
          onClick={() => run(() => saveFoodRule({ userId: profile?.id, topic: savedTopic, value, existing: rule }), 'Guardado — a Carol já não pergunta')}
          className="w-full min-h-[48px] rounded-xl text-[14px] font-black disabled:opacity-50"
          style={{ background: 'var(--coach)', color: '#062a33' }}
        >
          Guardar
        </button>
        {rule && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => deleteFoodRule(rule.id), 'Esquecido — a Carol volta a perguntar')}
            className="w-full min-h-[46px] rounded-xl text-[13.5px] font-extrabold"
            style={{ border: '1px solid var(--tint-danger-bd)', color: 'var(--danger)' }}
          >
            Esquecer — volta a perguntar
          </button>
        )}
      </div>
    </PremiumModal>
  );
}
