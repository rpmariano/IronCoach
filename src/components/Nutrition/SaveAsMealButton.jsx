import React, { useEffect, useState } from 'react';
import { BookmarkPlus, BookmarkCheck } from 'lucide-react';
import { useAppStore } from '../../store';
import Button from '../shared/Button';
import MealTemplateSheet from '../Pantry/MealTemplateSheet';
import { mealTypeLabel } from '../../utils/nutrition';
import { suggestedTemplateName, templateForMeal } from '../../utils/pantry';

/* "Guardar como refeição" (fase 2 do #63; bug #78, 2026-10-20: mais
   destaque, e também no ecrã da análise): a refeição registada, com os
   alimentos e as gramas, numa refeição predefinida. Um botão cheio na cor da
   Nutrição, com a ficha da despensa já preenchida. Usado no cartão da refeição
   e no "Registo Guardado". Sem alimentos não aparece.
   Bug #83 (2026-10-25): numa refeição que já corresponde a uma predefinida
   (os mesmos alimentos; as gramas não contam) o botão dá lugar a "Guardada
   como «X»" — guardar outra vez só dava o erro de nome repetido. Editada a
   refeição e mudados os alimentos, o botão volta. */
export default function SaveAsMealButton({ meal }) {
  const [open, setOpen] = useState(false);
  const { mealTemplates, pantryLoaded, loadPantry } = useAppStore();
  useEffect(() => { if (!pantryLoaded) loadPantry?.(); }, [pantryLoaded, loadPantry]);
  const items = meal?.meal_items || [];
  if (!items.length) return null;
  const saved = templateForMeal(mealTemplates, meal);
  if (saved) {
    return (
      <p data-testid="meal-already-saved" className="flex items-center justify-center gap-1.5 text-[12.5px] font-semibold py-2" style={{ color: 'var(--text-2)' }}>
        <BookmarkCheck size={16} aria-hidden="true" style={{ color: 'var(--nutrition)' }} />
        <span>Guardada como «{saved.name}»</span>
      </p>
    );
  }
  return (
    <>
      <Button
        variant="module"
        moduleColor="var(--nutrition)"
        onClick={() => setOpen(true)}
        className="w-full text-sm"
        icon={<BookmarkPlus size={16} />}
      >
        Guardar como refeição
      </Button>
      {open && (
        <MealTemplateSheet
          initial={{
            name: suggestedTemplateName(mealTypeLabel(meal.meal_type), items),
            default_meal_type: meal.meal_type || null,
            items: items.map((it) => ({ name: it.name, grams: it.quantity_grams })),
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
