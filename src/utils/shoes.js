/**
 * Armário de sapatilhas — quilometragem acumulada e desgaste.
 *
 * Migrado para @formulas/shoes.ts (T1) na Fase C — reexportado aqui para
 * não quebrar os importadores existentes. Deixou de ser cópia: coach-chat
 * (que reimplementava o fator de peso, mas sem o limiar "atenção" a 75%) e
 * a constante REFERENCE_WEIGHT_KG de estimate-shoe-lifespan agora importam
 * do mesmo ficheiro. Ver specs/formulas-checklist.md Fase C.
 */
export {
  REFERENCE_WEIGHT_KG,
  WEAR_ATTENTION_PCT,
  WEAR_REPLACE_PCT,
  WEAR_LEVEL_LABELS,
  weightFactor,
  effectiveLifespanKm,
  accumulatedKm,
  wearStatus,
  shoeLabel,
  shoesNeedingAttention,
} from '@formulas/shoes.ts';
