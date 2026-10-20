import React, { useState } from 'react';
import { BookmarkPlus } from 'lucide-react';
import Button from '../shared/Button';
import MealTemplateSheet from '../Pantry/MealTemplateSheet';
import { mealTypeLabel } from '../../utils/nutrition';
import { suggestedTemplateName } from '../../utils/pantry';

/* "Guardar como refeição" (fase 2 do #63; bug #78, 2026-10-20: mais
   destaque, e também no ecrã da análise): a refeição registada, com os
   alimentos e as gramas, numa refeição predefinida. Um botão cheio na cor da
   Nutrição, com a ficha da despensa já preenchida. Usado no cartão da refeição
   e no "Registo Guardado". Sem alimentos não aparece. */
export default function SaveAsMealButton({ meal }) {
  const [open, setOpen] = useState(false);
  const items = meal?.meal_items || [];
  if (!items.length) return null;
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
