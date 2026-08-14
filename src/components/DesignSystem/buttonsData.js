export const buttonsData = [
  {
    "className": "",
    "count": 8,
    "files": [
      "\\components\\Admin\\Admin.jsx",
      "\\components\\Body\\BodyDashboard.jsx",
      "\\components\\Nutrition\\MealRegistration.jsx",
      "\\components\\Perfil\\Perfil.jsx",
      "\\components\\Run\\RunCalendar.jsx"
    ],
    "sampleText": "setActiveTab(t.key)}\n            className={`shrink-0 flex items-center gap-1.5 border border-neutral-700 rounded-xl py-2 px-3 text-xs font-semibold transition ${\n              activeTab === t.key ? 'bg-[var(--accent)] shadow-md' : 'text-slate-400 hover:text-slate-200 bg-neutral-900/50'\n            }`}\n            style={activeTab === t.key ? { color: '#fff' } : undefined}\n          >\n             {t.label}"
  },
  {
    "className": "tap-44 flex items-center justify-center text-slate-400 hover:text-slate-800 transition",
    "count": 6,
    "files": [
      "\\components\\Body\\BodyCalendar.jsx",
      "\\components\\Gym\\GymCalendar.jsx",
      "\\components\\Nutrition\\NutritionCalendar.jsx"
    ],
    "sampleText": "setCurrentDate(subMonths(currentDate, 1))} className=\"tap-44 flex items-center justify-center text-slate-400 hover:text-slate-800 transition\">"
  },
  {
    "className": "tap-44 text-slate-400 hover:text-slate-600 shrink-0",
    "count": 4,
    "files": [
      "\\components\\Body\\BodyAssessmentCard.jsx",
      "\\components\\Gym\\GymSessionCard.jsx",
      "\\components\\Nutrition\\MealCard.jsx",
      "\\components\\Run\\RunCard.jsx"
    ],
    "sampleText": "{ e.stopPropagation(); setExpanded(prev => !prev); }}\r\n            type=\"button\"\r\n            aria-label={expanded ? 'Fechar detalhes da avaliação' : 'Ver detalhes da avaliação'}\r\n            aria-expanded={expanded}\r\n            className=\"tap-44 text-slate-400 hover:text-slate-600 shrink-0\"\r\n          >\r\n            {expanded ?  : }"
  },
  {
    "className": "flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition",
    "count": 4,
    "files": [
      "\\components\\Body\\BodyAssessmentCard.jsx",
      "\\components\\Gym\\GymSessionCard.jsx",
      "\\components\\Nutrition\\MealCard.jsx",
      "\\components\\Run\\RunCard.jsx"
    ],
    "sampleText": "onEdit(assessment.id)}\r\n                className=\"flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition\"\r\n              >\r\n                 Editar"
  },
  {
    "className": "flex-1 border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-600 font-bold text-xs rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition disabled:opacity-50",
    "count": 4,
    "files": [
      "\\components\\Body\\BodyAssessmentCard.jsx",
      "\\components\\Gym\\GymSessionCard.jsx",
      "\\components\\Nutrition\\MealCard.jsx",
      "\\components\\Run\\RunCard.jsx"
    ],
    "sampleText": "setShowDeleteConfirm(true)}\r\n              disabled={isDeleting}\r\n              className=\"flex-1 border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-600 font-bold text-xs rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition disabled:opacity-50\"\r\n            >\r\n              {isDeleting ?  : }\r\n              Eliminar avaliação"
  },
  {
    "className": "w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-[var(--accent)] disabled:opacity-30",
    "count": 4,
    "files": [
      "\\components\\Home\\Home.jsx",
      "\\components\\Home\\WeeklyPlanCard.jsx"
    ],
    "sampleText": "scrollTo(Math.min(upcoming.length - 1, currentIndex + 1))}\r\n              disabled={currentIndex === upcoming.length - 1}\r\n              className=\"w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-[var(--accent)] disabled:opacity-30\"\r\n            >"
  },
  {
    "className": "text-[12px] text-slate-500 hover:text-red-500 transition font-medium",
    "count": 3,
    "files": [
      "\\components\\Body\\BodyRegistration.jsx",
      "\\components\\Gym\\GymRegistration.jsx",
      "\\components\\Nutrition\\MealRegistration.jsx"
    ],
    "sampleText": "{ if (isFormDirty) setShowUnsavedModal(true); else onClose(); }}\r\n            type=\"button\"\r\n            className=\"text-[12px] text-slate-500 hover:text-red-500 transition font-medium\"\r\n          >\r\n            Cancelar"
  },
  {
    "className": "tap-44 absolute -top-1.5 -right-1.5 text-slate-500 hover:text-red-500 transition",
    "count": 3,
    "files": [
      "\\components\\Body\\BodyRegistration.jsx",
      "\\components\\Gym\\GymRegistration.jsx",
      "\\components\\Nutrition\\MealRegistration.jsx"
    ],
    "sampleText": "removePhoto(i)}\r\n                        aria-label={`Remover print ${i + 1}`}\r\n                        className=\"tap-44 absolute -top-1.5 -right-1.5 text-slate-500 hover:text-red-500 transition\"\r\n                      >"
  },
  {
    "className": "h-1.5 shrink-0 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-4 bg-[var(--accent)]' : 'w-1.5 bg-[var(--accent)] opacity-30",
    "count": 3,
    "files": [
      "\\components\\Home\\Home.jsx",
      "\\components\\Home\\WeeklyPlanCard.jsx"
    ],
    "sampleText": "scrollTo(idx)}\r\n              aria-label={`Ver cartão ${idx + 1}`}\r\n              className={`h-1.5 shrink-0 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-4 bg-[var(--accent)]' : 'w-1.5 bg-[var(--accent)] opacity-30'}`}\r\n            />\r\n          ))}\r\n        \r\n        \r\n           scrollTo(Math.max(0, currentIndex - 1))}\r\n            disabled={currentIndex === 0}\r\n            className=\"w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 disabled:opacity-30\"\r\n          >"
  },
  {
    "className": "wpc-btn wpc-btn-primary",
    "count": 3,
    "files": [
      "\\components\\Home\\WeeklyPlanCard.jsx"
    ],
    "sampleText": "onComplete(item)} className=\"wpc-btn wpc-btn-primary\">\r\n                               Concluído"
  },
  {
    "className": "wpc-btn wpc-btn-secondary",
    "count": 3,
    "files": [
      "\\components\\Home\\WeeklyPlanCard.jsx"
    ],
    "sampleText": "onCancel(item)} className=\"wpc-btn wpc-btn-secondary\">\r\n                               Cancelado"
  },
  {
    "className": "w-full py-3 rounded-xl font-semibold text-xs text-slate-400 hover:text-slate-200 transition disabled:opacity-60",
    "count": 3,
    "files": [
      "\\components\\Perfil\\Perfil.jsx",
      "\\components\\Run\\RunAgenda.jsx",
      "\\components\\shared\\ConfirmDeleteModal.jsx"
    ],
    "sampleText": "setLeavePrompt(null)} disabled={isSaving} type=\"button\"\r\n            className=\"w-full py-3 rounded-xl font-semibold text-xs text-slate-400 hover:text-slate-200 transition disabled:opacity-60\">\r\n            Cancelar"
  },
  {
    "className": "w-full bg-[var(--accent)] text-neutral-950 font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg",
    "count": 2,
    "files": [
      "\\components\\Body\\BodyCalendar.jsx",
      "\\components\\Nutrition\\NutritionCalendar.jsx"
    ],
    "sampleText": "setOpenCreationMode('assessment')}\r\n        className=\"w-full bg-[var(--accent)] text-neutral-950 font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg\"\r\n      >\r\n         Nova Avaliação"
  },
  {
    "className": "mb-1",
    "count": 2,
    "files": [
      "\\components\\Body\\BodyCalendar.jsx",
      "\\components\\Gym\\GymCalendar.jsx"
    ],
    "sampleText": "setSelectedDate(date)}\r\n                  className={`relative flex flex-col items-center justify-center w-10 h-10 rounded-xl text-xs transition ${\r\n                    isSelected ? 'bg-neutral-900 shadow-md' : 'text-slate-600 hover:bg-slate-100'\r\n                  }`}\r\n                  style={isSelected ? { color: '#0f172a' } : undefined}\r\n                >\r\n                  {format(date, 'd')}"
  },
  {
    "className": "w-9 h-9 flex items-center justify-center rounded-full border border-white/60 bg-white/50 text-slate-500 hover:text-slate-800 hover:bg-white transition shadow-sm",
    "count": 2,
    "files": [
      "\\components\\Calendar\\Calendar.jsx"
    ],
    "sampleText": "setCurrentDate(subMonths(currentDate, 1))} className=\"w-9 h-9 flex items-center justify-center rounded-full border border-white/60 bg-white/50 text-slate-500 hover:text-slate-800 hover:bg-white transition shadow-sm\">"
  },
  {
    "className": "text-[11px] font-medium text-slate-500 hover:text-slate-800 active:scale-95 transition-all shrink-0",
    "count": 2,
    "files": [
      "\\components\\Coach\\PlanProposalBottomSheet.jsx",
      "\\components\\Run\\MissingMetricsBottomSheet.jsx"
    ],
    "sampleText": "Cancelar"
  },
  {
    "className": "bc-chevron-btn",
    "count": 2,
    "files": [
      "\\components\\GraphicsLibrary\\BodyCard.jsx"
    ],
    "sampleText": "Ação / Ícone"
  },
  {
    "className": "ec-chevron-btn",
    "count": 2,
    "files": [
      "\\components\\GraphicsLibrary\\ExerciseCard.jsx"
    ],
    "sampleText": "Ação / Ícone"
  },
  {
    "className": "hydro-bell-item",
    "count": 2,
    "files": [
      "\\components\\GraphicsLibrary\\HydrationOptionA.jsx"
    ],
    "sampleText": "handleSnooze(e, 'next')}>\r\n              Ocultar próximo alarme"
  },
  {
    "className": "hydro-nrc-btn",
    "count": 2,
    "files": [
      "\\components\\GraphicsLibrary\\HydrationOptionA.jsx"
    ],
    "sampleText": "handleAddWater(e, 200)}>+ 200 ml"
  },
  {
    "className": "hydro-b-btn",
    "count": 2,
    "files": [
      "\\components\\GraphicsLibrary\\HydrationOptionB.jsx"
    ],
    "sampleText": "+ 200 ml"
  },
  {
    "className": "pc-nav-btn",
    "count": 2,
    "files": [
      "\\components\\GraphicsLibrary\\PremiumCalendar.jsx"
    ],
    "sampleText": "Ação / Ícone"
  },
  {
    "className": "rc-chevron-btn",
    "count": 2,
    "files": [
      "\\components\\GraphicsLibrary\\RunningCard.jsx"
    ],
    "sampleText": "Ação / Ícone"
  },
  {
    "className": "rounded-full px-3.5 py-1.5 text-[11px] font-medium border border-dashed border-slate-300 text-slate-500",
    "count": 2,
    "files": [
      "\\components\\Gym\\GymRegistration.jsx"
    ],
    "sampleText": "setCategoriesExpanded(true)}\r\n                type=\"button\"\r\n                className=\"rounded-full px-3.5 py-1.5 text-[11px] font-medium border border-dashed border-slate-300 text-slate-500\"\r\n              >\r\n                +{hiddenCount} mais"
  },
  {
    "className": "text-slate-400 hover:text-red-500 shrink-0",
    "count": 2,
    "files": [
      "\\components\\Gym\\GymRegistration.jsx"
    ],
    "sampleText": "removeExercise(ex.key)} type=\"button\" className=\"text-slate-400 hover:text-red-500 shrink-0\">"
  },
  {
    "className": "vbar-btn relative w-full min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 active:scale-95 transition cursor-pointer",
    "count": 2,
    "files": [
      "\\components\\Layout\\Layout.jsx"
    ],
    "sampleText": "setTab(tab)}\r\n      data-vert={tab}\r\n      aria-label={label}\r\n      aria-current={active ? 'page' : undefined}\r\n      className=\"vbar-btn relative w-full min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 active:scale-95 transition cursor-pointer\"\r\n      style={{ color: active ? activeColor : '#64748b', fontWeight: active ? 700 : 500 }}\r\n    >\r\n      {/* Pista não-cromática do estado ativo: as cores de módulo em texto de\r\n          10px não chegam ao contraste AA sobre o branco da barra, por isso o\r\n          estado não pode depender só da cor. Ver PRD 5.2. */}\r\n      {active && (\r\n        \r\n      )}\r\n      {icon}\r\n      {label}"
  },
  {
    "className": "tap-44 text-slate-400 hover:text-red-500 shrink-0",
    "count": 2,
    "files": [
      "\\components\\Nutrition\\MealRegistration.jsx",
      "\\components\\Run\\RunRegistration.jsx"
    ],
    "sampleText": "handleRemoveManualItem(item.key)}\r\n                      className=\"tap-44 text-slate-400 hover:text-red-500 shrink-0\"\r\n                      aria-label={`Remover ${item.name}`}\r\n                    >"
  },
  {
    "className": "tap-h-44 px-3 rounded-xl text-[11px] font-semibold text-slate-600 border border-slate-200 flex items-center justify-center gap-1.5 disabled:opacity-50 transition active:scale-95",
    "count": 2,
    "files": [
      "\\components\\Nutrition\\WaterTracker.jsx"
    ],
    "sampleText": "snoozeReminder('next')} disabled={isUpdating} type=\"button\"\r\n                  className=\"tap-h-44 px-3 rounded-xl text-[11px] font-semibold text-slate-600 border border-slate-200 flex items-center justify-center gap-1.5 disabled:opacity-50 transition active:scale-95\">\r\n                   Adiar próximo"
  },
  {
    "className": "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs bg-[var(--accent)] shadow-lg active:scale-95 transition disabled:opacity-60",
    "count": 2,
    "files": [
      "\\components\\Perfil\\Perfil.jsx",
      "\\components\\Run\\RunAgenda.jsx"
    ],
    "sampleText": "{isSaving ?  : null}\r\n            {isSaving ? 'A guardar...' : 'Gravar e sair'}"
  },
  {
    "className": "w-full py-3 rounded-xl font-semibold text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 transition disabled:opacity-60",
    "count": 2,
    "files": [
      "\\components\\Perfil\\Perfil.jsx",
      "\\components\\Run\\RunAgenda.jsx"
    ],
    "sampleText": "Sair sem gravar"
  },
  {
    "className": "w-full text-neutral-950 font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg",
    "count": 2,
    "files": [
      "\\components\\Run\\RunAgenda.jsx",
      "\\components\\Run\\RunCalendar.jsx"
    ],
    "sampleText": "handleOpenForm(null)}\r\n          className=\"w-full text-neutral-950 font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg\"\r\n          style={{ background: 'var(--accent)' }}\r\n        >\r\n          \r\n          Nova Prova"
  },
  {
    "className": "tap-44 flex items-center justify-center text-slate-400 hover:text-slate-700",
    "count": 2,
    "files": [
      "\\components\\Run\\RunCalendar.jsx"
    ],
    "sampleText": "changeMonth(-1)} className=\"tap-44 flex items-center justify-center text-slate-400 hover:text-slate-700\">"
  },
  {
    "className": "text-[11px] text-red-200 underline",
    "count": 1,
    "files": [
      "\\components\\Admin\\Admin.jsx"
    ],
    "sampleText": "Tentar novamente"
  },
  {
    "className": "text-[10px] bg-neutral-800 px-3 py-1.5 rounded-lg text-slate-300 font-semibold active:scale-95",
    "count": 1,
    "files": [
      "\\components\\Admin\\Admin.jsx"
    ],
    "sampleText": "Atualizar"
  },
  {
    "className": "w-full flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 active:scale-98 text-xs font-semibold py-2 px-3 rounded-xl text-slate-200 transition border border-neutral-700",
    "count": 1,
    "files": [
      "\\components\\Admin\\Admin.jsx"
    ],
    "sampleText": "handleOpenUnknownModal(item)}\n                        className=\"w-full flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 active:scale-98 text-xs font-semibold py-2 px-3 rounded-xl text-slate-200 transition border border-neutral-700\"\n                      >\n                         Consultar Imagem & Detalhes"
  },
  {
    "className": "p-1.5 rounded-full bg-neutral-800 text-slate-400 hover:text-slate-200",
    "count": 1,
    "files": [
      "\\components\\Admin\\Admin.jsx"
    ],
    "sampleText": "setSelectedUnknownLog(null)}\n                        className=\"p-1.5 rounded-full bg-neutral-800 text-slate-400 hover:text-slate-200\"\n                      >"
  },
  {
    "className": "flex-1 py-2.5 rounded-xl border border-neutral-700 text-xs font-semibold text-slate-300 hover:bg-neutral-800",
    "count": 1,
    "files": [
      "\\components\\Admin\\Admin.jsx"
    ],
    "sampleText": "setSelectedUnknownLog(null)}\n                          className=\"flex-1 py-2.5 rounded-xl border border-neutral-700 text-xs font-semibold text-slate-300 hover:bg-neutral-800\"\n                        >\n                          Cancelar"
  },
  {
    "className": "flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-xs font-bold text-white hover:opacity-90 flex items-center justify-center gap-1.5",
    "count": 1,
    "files": [
      "\\components\\Admin\\Admin.jsx"
    ],
    "sampleText": "{savingLog ? 'A guardar...' : 'Guardar Alterações'}"
  },
  {
    "className": "flex-1 border border-neutral-700 rounded-xl py-2 text-xs font-semibold transition ${metricsRange === r ? 'bg-[var(--accent)]' : 'text-slate-300",
    "count": 1,
    "files": [
      "\\components\\Admin\\Admin.jsx"
    ],
    "sampleText": "setMetricsRange(r)}\n                  className={`flex-1 border border-neutral-700 rounded-xl py-2 text-xs font-semibold transition ${metricsRange === r ? 'bg-[var(--accent)]' : 'text-slate-300'}`}\n                  style={metricsRange === r ? { color: '#fff' } : undefined}>\n                  {r === 'hoje' ? 'Hoje' : r === 'semana' ? 'Esta Semana' : 'Este Mês'}"
  },
  {
    "className": "flex-1 border border-neutral-700 rounded-xl py-2 text-xs font-semibold transition ${costRange === r ? 'bg-[var(--accent)]' : 'text-slate-300",
    "count": 1,
    "files": [
      "\\components\\Admin\\Admin.jsx"
    ],
    "sampleText": "setCostRange(r)}\n                  className={`flex-1 border border-neutral-700 rounded-xl py-2 text-xs font-semibold transition ${costRange === r ? 'bg-[var(--accent)]' : 'text-slate-300'}`}\n                  style={costRange === r ? { color: '#fff' } : undefined}>\n                  {r === 'hoje' ? 'Hoje' : r === 'semana' ? 'Esta Semana' : 'Este Mês'}"
  },
  {
    "className": "w-full bg-[var(--accent)] text-slate-950 font-bold text-sm rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50 shadow-sm",
    "count": 1,
    "files": [
      "\\components\\Auth\\Auth.jsx"
    ],
    "sampleText": "{loading && }\r\n            {authMode === 'signin' ? 'Entrar' : 'Criar Conta'}"
  },
  {
    "className": "w-full bg-white border border-slate-200 rounded-xl py-2.5 text-xs font-semibold text-slate-700 flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-[0.98] transition shadow-xs",
    "count": 1,
    "files": [
      "\\components\\Auth\\Auth.jsx"
    ],
    "sampleText": "Entrar com Google"
  },
  {
    "className": "w-full text-center text-xs text-slate-500 hover:text-slate-700 transition pt-1",
    "count": 1,
    "files": [
      "\\components\\Auth\\Auth.jsx"
    ],
    "sampleText": "{\r\n            setAuthMode(authMode === 'signin' ? 'signup' : 'signin');\r\n            setErrorMsg(null);\r\n            setInfoMsg(null);\r\n          }}\r\n          className=\"w-full text-center text-xs text-slate-500 hover:text-slate-700 transition pt-1\"\r\n        >\r\n          {authMode === 'signin' ? 'Ainda não tens conta? Criar conta' : 'Já tens conta? Entrar'}"
  },
  {
    "className": "tap-h-44 mt-4 bg-[var(--accent)] text-neutral-950 font-bold text-xs rounded-xl px-4 flex items-center gap-1.5 active:scale-[0.98] transition",
    "count": 1,
    "files": [
      "\\components\\Body\\BodyDashboard.jsx"
    ],
    "sampleText": "Ir para o Calendário"
  },
  {
    "className": "flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'foto' ? 'bg-[var(--mod-corpo-to)] border-[var(--mod-corpo-to)]' : 'bg-white border-slate-200 text-slate-500",
    "count": 1,
    "files": [
      "\\components\\Body\\BodyRegistration.jsx"
    ],
    "sampleText": "setEntryMethod('foto')}\r\n                style={entryMethod === 'foto' ? { color: '#fff' } : undefined}\r\n                className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'foto' ? 'bg-[var(--mod-corpo-to)] border-[var(--mod-corpo-to)]' : 'bg-white border-slate-200 text-slate-500'}`}\r\n              >\r\n                 Foto (IA)"
  },
  {
    "className": "flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'manual' ? 'bg-[var(--mod-corpo-to)] border-[var(--mod-corpo-to)]' : 'bg-white border-slate-200 text-slate-500",
    "count": 1,
    "files": [
      "\\components\\Body\\BodyRegistration.jsx"
    ],
    "sampleText": "setEntryMethod('manual')}\r\n                style={entryMethod === 'manual' ? { color: '#fff' } : undefined}\r\n                className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'manual' ? 'bg-[var(--mod-corpo-to)] border-[var(--mod-corpo-to)]' : 'bg-white border-slate-200 text-slate-500'}`}\r\n              >\r\n                 Manual"
  },
  {
    "className": "text-xs font-bold leading-none mt-[1px]",
    "count": 1,
    "files": [
      "\\components\\Calendar\\Calendar.jsx"
    ],
    "sampleText": "setSelectedDate(date)}\r\n                  className={`w-[42px] h-[46px] rounded-xl flex flex-col items-center justify-between py-1.5 border transition cursor-pointer outline-none ${\r\n                    isSelected \r\n                      ? 'bg-white border-slate-200 text-slate-900 shadow-[0_4px_15px_rgba(0,0,0,0.05)] scale-[1.02] font-black' \r\n                      : 'bg-white/50 border-white/70 text-slate-600 hover:bg-white/80'\r\n                  }`}\r\n                >\r\n                  {dayNum}\r\n                  \r\n                    {dayRuns.length > 0 && }\r\n                    {dayGym.length > 0 && }\r\n                    {dayMeals.length > 0 && }\r\n                    {dayBody.length > 0 && }\r\n                    \r\n                    {!dayRuns.length && !dayGym.length && !dayMeals.length && !dayBody.length && isSelected && (\r\n                       \r\n                    )}"
  },
  {
    "className": "text-[11px] text-slate-400 border border-neutral-800 rounded-xl px-2.5 py-1 hover:bg-neutral-800 active:scale-95 transition flex items-center gap-1",
    "count": 1,
    "files": [
      "\\components\\Coach\\Coach.jsx"
    ],
    "sampleText": "setShowClearModal(true)}\r\n            className=\"text-[11px] text-slate-400 border border-neutral-800 rounded-xl px-2.5 py-1 hover:bg-neutral-800 active:scale-95 transition flex items-center gap-1\"\r\n          >\r\n            \r\n            Limpar"
  },
  {
    "className": "w-full text-left text-xs rounded-xl px-3.5 py-2.5 transition font-medium",
    "count": 1,
    "files": [
      "\\components\\Coach\\Coach.jsx"
    ],
    "sampleText": "handleSend(s)}\r\n                  className=\"w-full text-left text-xs rounded-xl px-3.5 py-2.5 transition font-medium\"\r\n                  style={{\r\n                    color: 'var(--mod-coach-to)',\r\n                    border: '1px solid color-mix(in srgb, var(--mod-coach-to) 30%, transparent)',\r\n                    background: 'color-mix(in srgb, var(--mod-coach-to) 5%, transparent)'\r\n                  }}\r\n                >\r\n                  {s}"
  },
  {
    "className": "text-xs rounded-xl px-4 py-2.5 transition font-medium",
    "count": 1,
    "files": [
      "\\components\\Coach\\Coach.jsx"
    ],
    "sampleText": "setHoursToShow(prev => prev + 24)}\r\n              className=\"text-xs rounded-xl px-4 py-2.5 transition font-medium\"\r\n              style={{\r\n                color: 'var(--mod-coach-to)',\r\n                border: '1px solid color-mix(in srgb, var(--mod-coach-to) 30%, transparent)',\r\n                background: 'color-mix(in srgb, var(--mod-coach-to) 5%, transparent)'\r\n              }}\r\n            >\r\n              Carregar mensagens anteriores"
  },
  {
    "className": "text-left text-xs rounded-xl px-3 py-2 transition font-medium",
    "count": 1,
    "files": [
      "\\components\\Coach\\Coach.jsx"
    ],
    "sampleText": "handleSend(s)}\r\n                className=\"text-left text-xs rounded-xl px-3 py-2 transition font-medium\"\r\n                style={{\r\n                  color: 'var(--mod-coach-to)',\r\n                  border: '1px solid color-mix(in srgb, var(--mod-coach-to) 30%, transparent)',\r\n                  background: 'color-mix(in srgb, var(--mod-coach-to) 5%, transparent)'\r\n                }}\r\n              >\r\n                {s}"
  },
  {
    "className": "text-white font-bold text-xs rounded-full px-4 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center gap-2 transition active:scale-95 animate-bounce hover:opacity-90",
    "count": 1,
    "files": [
      "\\components\\Coach\\Coach.jsx"
    ],
    "sampleText": "{\r\n                if (pendingPlans.length > 0) setActiveProposalSheetPlan(pendingPlans[0]);\r\n                if (pendingGoalProposals.length > 0) setActiveGoalProposal(pendingGoalProposals[0]);\r\n              }}\r\n              className=\"text-white font-bold text-xs rounded-full px-4 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center gap-2 transition active:scale-95 animate-bounce hover:opacity-90\"\r\n              style={{ backgroundColor: 'var(--mod-coach-to)' }}\r\n            >\r\n              \r\n              \r\n                {pendingPlans.length > 0 && pendingGoalProposals.length > 0\r\n                  ? `Propostas por rever (${pendingPlans.length + pendingGoalProposals.length})`\r\n                  : pendingPlans.length > 0\r\n                  ? `Proposta de plano por rever (${pendingPlans.length})`\r\n                  : `Objetivos por rever (${pendingGoalProposals.length})`}"
  },
  {
    "className": "w-5 h-5 animate-spin",
    "count": 1,
    "files": [
      "\\components\\Coach\\Coach.jsx"
    ],
    "sampleText": "handleSend()}\r\n            disabled={!inputStr.trim() || coachLoading}\r\n            aria-label=\"Enviar pergunta ao Coach\"\r\n            className={`shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl flex items-center justify-center transition active:scale-95 ${\r\n              coachLoading || !inputStr.trim()\r\n                ? 'bg-neutral-800 text-slate-500 cursor-not-allowed'\r\n                : 'text-slate-950 font-bold'\r\n            }`}\r\n            style={{\r\n              background: !inputStr.trim() || coachLoading ? undefined : 'var(--mod-coach-to)'\r\n            }}\r\n          >\r\n            {coachLoading ? (\r\n              \r\n            ) : (\r\n              \r\n            )}"
  },
  {
    "className": "flex-1 border border-neutral-800 text-slate-400 text-xs font-semibold rounded-xl py-2.5 hover:bg-neutral-800 transition",
    "count": 1,
    "files": [
      "\\components\\Coach\\Coach.jsx"
    ],
    "sampleText": "setShowClearModal(false)}\r\n                className=\"flex-1 border border-neutral-800 text-slate-400 text-xs font-semibold rounded-xl py-2.5 hover:bg-neutral-800 transition\"\r\n              >\r\n                Cancelar"
  },
  {
    "className": "flex-1 bg-red-500/20 text-red-400 text-xs font-semibold rounded-xl py-2.5 border border-red-500/40 hover:bg-red-500/30 transition",
    "count": 1,
    "files": [
      "\\components\\Coach\\Coach.jsx"
    ],
    "sampleText": "Limpar"
  },
  {
    "className": "flex-1 py-2.5 px-3 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm hover:opacity-90",
    "count": 1,
    "files": [
      "\\components\\Coach\\PlanProposalBottomSheet.jsx"
    ],
    "sampleText": "handleRespondGoalAction(true)}\n                  className=\"flex-1 py-2.5 px-3 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm hover:opacity-90\"\n                  style={{ backgroundColor: 'var(--mod-coach-to)' }}\n                >\n                   Aceitar Objetivos"
  },
  {
    "className": "py-2.5 px-3 rounded-xl font-semibold text-xs text-slate-500 hover:text-rose-500 bg-white border border-slate-200 flex items-center justify-center gap-1 transition active:scale-95",
    "count": 1,
    "files": [
      "\\components\\Coach\\PlanProposalBottomSheet.jsx"
    ],
    "sampleText": "handleRespondGoalAction(false)}\n                  className=\"py-2.5 px-3 rounded-xl font-semibold text-xs text-slate-500 hover:text-rose-500 bg-white border border-slate-200 flex items-center justify-center gap-1 transition active:scale-95\"\n                >\n                   Recusar"
  },
  {
    "className": "flex-1 py-3.5 px-4 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition active:scale-95",
    "count": 1,
    "files": [
      "\\components\\Coach\\PlanProposalBottomSheet.jsx"
    ],
    "sampleText": "handleRespondPlanAction(true)}\n              className=\"flex-1 py-3.5 px-4 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition active:scale-95\"\n              style={{\n                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',\n              }}\n            >\n              \n              Aceitar Plano"
  },
  {
    "className": "py-3.5 px-4 rounded-2xl font-semibold text-sm text-slate-600 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 flex items-center justify-center gap-1.5 transition active:scale-95",
    "count": 1,
    "files": [
      "\\components\\Coach\\PlanProposalBottomSheet.jsx"
    ],
    "sampleText": "handleRespondPlanAction(false)}\n              className=\"py-3.5 px-4 rounded-2xl font-semibold text-sm text-slate-600 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 flex items-center justify-center gap-1.5 transition active:scale-95\"\n            >\n              \n              Recusar"
  },
  {
    "className": "text-[10px]",
    "count": 1,
    "files": [
      "\\components\\Dashboard\\Dashboard.jsx"
    ],
    "sampleText": "setActiveTab(t.key)}\r\n            className={`flex-1 flex flex-col items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-xl transition ${\r\n              activeModule === t.key ? 'shadow-md scale-[1.02]' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'\r\n            }`}\r\n            style={activeModule === t.key ? { background: t.color, color: '#fff' } : undefined}\r\n          >\r\n            {t.icon}\r\n            {t.label}"
  },
  {
    "className": "bc-exp-btn bc-exp-edit-btn",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\BodyCard.jsx"
    ],
    "sampleText": "Editar avaliação"
  },
  {
    "className": "bc-exp-btn bc-exp-delete-btn",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\BodyCard.jsx"
    ],
    "sampleText": "Eliminar avaliação"
  },
  {
    "className": "ec-exp-btn ec-exp-edit-btn",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\ExerciseCard.jsx"
    ],
    "sampleText": "Editar treino"
  },
  {
    "className": "ec-exp-btn ec-exp-delete-btn",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\ExerciseCard.jsx"
    ],
    "sampleText": "Eliminar treino"
  },
  {
    "className": "hydro-bell-btn",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\HydrationOptionA.jsx"
    ],
    "sampleText": "{isMutedToday ?  : }"
  },
  {
    "className": "btn-premium btn-p-gradient",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\PremiumButtons.jsx"
    ],
    "sampleText": "Criar Registo"
  },
  {
    "className": "btn-premium btn-p-glass",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\PremiumButtons.jsx"
    ],
    "sampleText": "Ver Histórico"
  },
  {
    "className": "btn-premium btn-p-module nutri",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\PremiumButtons.jsx"
    ],
    "sampleText": "Nova Refeição"
  },
  {
    "className": "btn-premium btn-p-module run",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\PremiumButtons.jsx"
    ],
    "sampleText": "Nova Corrida"
  },
  {
    "className": "btn-premium btn-p-module gym",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\PremiumButtons.jsx"
    ],
    "sampleText": "Novo Treino"
  },
  {
    "className": "btn-p-fab",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\PremiumButtons.jsx"
    ],
    "sampleText": "Ação / Ícone"
  },
  {
    "className": "pc-day-btn-capsule ${isSelected ? 'selected' : '",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\PremiumCalendar.jsx"
    ],
    "sampleText": "setSelectedDay(day)}\n                className={`pc-day-btn-capsule ${isSelected ? 'selected' : ''}`}\n              >\n                {day}\n                \n                \n                  {moduleType === \"nutrition\" ? (\n                    \n                      {/* Left Pill: Water status */}\n                      \n                      {/* Right Pill: Food/Calories status */}\n                      \n                    \n                  ) : (\n                    // Other modules: single indicator pill using the module's accentColor\n                    \n                  )}"
  },
  {
    "className": "rc-exp-btn rc-exp-edit-btn",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\RunningCard.jsx"
    ],
    "sampleText": "Editar treino"
  },
  {
    "className": "rc-exp-btn rc-exp-delete-btn",
    "count": 1,
    "files": [
      "\\components\\GraphicsLibrary\\RunningCard.jsx"
    ],
    "sampleText": "Eliminar treino"
  },
  {
    "className": "w-full bg-[var(--mod-ginasio-to)] font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg",
    "count": 1,
    "files": [
      "\\components\\Gym\\GymCalendar.jsx"
    ],
    "sampleText": "setOpenCreationMode('workout')}\r\n        className=\"w-full bg-[var(--mod-ginasio-to)] font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg\"\r\n        style={{ color: '#fff' }}\r\n      >\r\n         Novo Treino"
  },
  {
    "className": "range-chip flex-1 ${gymRange === r.k ? 'active' : '",
    "count": 1,
    "files": [
      "\\components\\Gym\\GymDashboard.jsx"
    ],
    "sampleText": "setGymRange(r.k)}\r\n            className={`range-chip flex-1 ${gymRange === r.k ? 'active' : ''}`}\r\n          >\r\n            {r.l}"
  },
  {
    "className": "flex-1 rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${isActive ? 'bg-[var(--mod-ginasio-to)] border-[var(--mod-ginasio-to)] shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600",
    "count": 1,
    "files": [
      "\\components\\Gym\\GymRegistration.jsx"
    ],
    "sampleText": "handleKindChange(k.key)}\r\n                type=\"button\"\r\n                style={isActive ? { color: '#fff' } : undefined}\r\n                className={`flex-1 rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${isActive ? 'bg-[var(--mod-ginasio-to)] border-[var(--mod-ginasio-to)] shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600'}`}\r\n              >\r\n                 {k.label}"
  },
  {
    "className": "rounded-full px-3.5 py-1.5 text-[11px] font-medium border transition-colors ${categories.includes(c) ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-white border-slate-200 text-slate-600",
    "count": 1,
    "files": [
      "\\components\\Gym\\GymRegistration.jsx"
    ],
    "sampleText": "handleToggleCategory(c)}\r\n                type=\"button\"\r\n                className={`rounded-full px-3.5 py-1.5 text-[11px] font-medium border transition-colors ${categories.includes(c) ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-white border-slate-200 text-slate-600'}`}\r\n              >\r\n                {c}"
  },
  {
    "className": "bg-sky-50 border border-sky-300 text-sky-700 rounded-full px-3.5 py-1.5 text-[11px] font-medium",
    "count": 1,
    "files": [
      "\\components\\Gym\\GymRegistration.jsx"
    ],
    "sampleText": "handleToggleCategory(c)}\r\n                type=\"button\"\r\n                className=\"bg-sky-50 border border-sky-300 text-sky-700 rounded-full px-3.5 py-1.5 text-[11px] font-medium\"\r\n              >\r\n                {c}"
  },
  {
    "className": "flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'foto' ? 'bg-[var(--mod-ginasio-to)] border-[var(--mod-ginasio-to)]' : 'bg-white border-slate-200 text-slate-500",
    "count": 1,
    "files": [
      "\\components\\Gym\\GymRegistration.jsx"
    ],
    "sampleText": "setEntryMethod('foto')}\r\n                style={entryMethod === 'foto' ? { color: '#fff' } : undefined}\r\n                className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'foto' ? 'bg-[var(--mod-ginasio-to)] border-[var(--mod-ginasio-to)]' : 'bg-white border-slate-200 text-slate-500'}`}\r\n              >\r\n                 Foto (IA)"
  },
  {
    "className": "flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'manual' ? 'bg-[var(--mod-ginasio-to)] border-[var(--mod-ginasio-to)]' : 'bg-white border-slate-200 text-slate-500",
    "count": 1,
    "files": [
      "\\components\\Gym\\GymRegistration.jsx"
    ],
    "sampleText": "setEntryMethod('manual')}\r\n                style={entryMethod === 'manual' ? { color: '#fff' } : undefined}\r\n                className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'manual' ? 'bg-[var(--mod-ginasio-to)] border-[var(--mod-ginasio-to)]' : 'bg-white border-slate-200 text-slate-500'}`}\r\n              >\r\n                 Manual"
  },
  {
    "className": "text-[11px] font-bold flex items-center gap-1",
    "count": 1,
    "files": [
      "\\components\\Gym\\GymRegistration.jsx"
    ],
    "sampleText": "Adicionar exercício"
  },
  {
    "className": "text-[11px] font-semibold",
    "count": 1,
    "files": [
      "\\components\\Gym\\GymRegistration.jsx"
    ],
    "sampleText": "addSet(ex.key)}\r\n                            type=\"button\"\r\n                            className=\"text-[11px] font-semibold\"\r\n                            style={{ color: 'var(--mod-ginasio-to)' }}\r\n                          >\r\n                             Série"
  },
  {
    "className": "cds-refresh",
    "count": 1,
    "files": [
      "\\components\\Home\\CoachDailySummaryCard.jsx"
    ],
    "sampleText": "Ação / Ícone"
  },
  {
    "className": "w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 hover:text-cyan-500 disabled:opacity-30 transition",
    "count": 1,
    "files": [
      "\\components\\Home\\CoachDailySummaryCard.jsx"
    ],
    "sampleText": "scrollTo(Math.max(0, index - 1))}\r\n              disabled={index === 0}\r\n              aria-label=\"Mensagem anterior\"\r\n              className=\"w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 hover:text-cyan-500 disabled:opacity-30 transition\"\r\n            >"
  },
  {
    "className": "w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-cyan-500 disabled:opacity-30 transition",
    "count": 1,
    "files": [
      "\\components\\Home\\CoachDailySummaryCard.jsx"
    ],
    "sampleText": "scrollTo(Math.min(messages.length - 1, index + 1))}\r\n              disabled={index === messages.length - 1}\r\n              aria-label=\"Próxima mensagem\"\r\n              className=\"w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-cyan-500 disabled:opacity-30 transition\"\r\n            >"
  },
  {
    "className": "cds-refresh shrink-0",
    "count": 1,
    "files": [
      "\\components\\Home\\CoachDailySummaryCard.jsx"
    ],
    "sampleText": "Ação / Ícone"
  },
  {
    "className": "w-full text-left rounded-2xl p-3.5 active:scale-[0.98] transition",
    "count": 1,
    "files": [
      "\\components\\Home\\Home.jsx"
    ],
    "sampleText": "onNav('corrida')} className=\"w-full text-left rounded-2xl p-3.5 active:scale-[0.98] transition\" style={statCardBg(color)}>\r\n      Próxima Prova\r\n      \r\n        \r\n          \r\n        \r\n        Sem provas agendadas — toca para adicionar uma na Agenda."
  },
  {
    "className": "h-1.5 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-4 bg-[var(--accent)]' : 'w-1.5 bg-[var(--accent)] opacity-30",
    "count": 1,
    "files": [
      "\\components\\Home\\Home.jsx"
    ],
    "sampleText": "scrollTo(idx)}\r\n                aria-label={`Ver prova ${idx + 1}`}\r\n                className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-4 bg-[var(--accent)]' : 'w-1.5 bg-[var(--accent)] opacity-30'}`}\r\n              />\r\n            ))}\r\n          \r\n          \r\n             scrollTo(Math.max(0, currentIndex - 1))}\r\n              disabled={currentIndex === 0}\r\n              className=\"w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 disabled:opacity-30\"\r\n            >"
  },
  {
    "className": "tap-44 wpc-chevron",
    "count": 1,
    "files": [
      "\\components\\Home\\WeeklyPlanCard.jsx"
    ],
    "sampleText": "{ e.stopPropagation(); toggle(); }}\r\n              >\r\n                {isExpanded ?  : }"
  },
  {
    "className": "wpc-pending-banner tap-scale",
    "count": 1,
    "files": [
      "\\components\\Home\\WeeklyPlanCard.jsx"
    ],
    "sampleText": "onNav('coach')} className=\"wpc-pending-banner tap-scale\" type=\"button\">\r\n      🕓 Tens {pendingCount} sugestão{pendingCount > 1 ? 'ões' : ''} do Coach por rever\r\n      Ver no chat →"
  },
  {
    "className": "wpc-card text-left tap-scale",
    "count": 1,
    "files": [
      "\\components\\Home\\WeeklyPlanCard.jsx"
    ],
    "sampleText": "onNav('coach')} className=\"wpc-card text-left tap-scale\" style={{ border: 'none', background: 'rgba(255, 255, 255, 0.4)' }}>\r\n          \r\n          \r\n            Plano\r\n            \r\n              Sem treinos acordados. Pede ao Coach um plano — as sugestões aparecem no chat para aceitares ou recusares."
  },
  {
    "className": "tap-44 flex items-center justify-center -ml-1 rounded-xl active:scale-95 transition",
    "count": 1,
    "files": [
      "\\components\\Layout\\Layout.jsx"
    ],
    "sampleText": "{ e.target.style.display='none'; }} />"
  },
  {
    "className": "tap-h-44 flex items-center gap-1 text-xs font-bold pl-3.5 pr-4 rounded-full active:scale-95 transition",
    "count": 1,
    "files": [
      "\\components\\Layout\\Layout.jsx"
    ],
    "sampleText": "setActiveTab('perfil')}\r\n            className=\"tap-h-44 flex items-center gap-1 text-xs font-bold pl-3.5 pr-4 rounded-full active:scale-95 transition\"\r\n            style={{ background: 'var(--chrome)', color: 'var(--text-main)' }}\r\n          >\r\n             Perfil"
  },
  {
    "className": "absolute left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-all bg-[var(--fab-bg)] border-[4px] border-white ring-[2.5px] ring-slate-900 shadow-xl text-slate-900 z-50 cursor-pointer",
    "count": 1,
    "files": [
      "\\components\\Layout\\Layout.jsx"
    ],
    "sampleText": "{\r\n            e.stopPropagation();\r\n            setFabOpen(v => !v);\r\n          }}\r\n          className=\"absolute left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-all bg-[var(--fab-bg)] border-[4px] border-white ring-[2.5px] ring-slate-900 shadow-xl text-slate-900 z-50 cursor-pointer\"\r\n          style={{\r\n            top: -22,\r\n          }}\r\n          aria-label={fabOpen ? 'Fechar menu de registo' : 'Registar novo item'}\r\n          aria-expanded={fabOpen}\r\n        >\r\n          {fabOpen ? (\r\n            \r\n          ) : (\r\n            \r\n          )}"
  },
  {
    "className": "flex items-center gap-3 pl-2.5 pr-4 py-2 min-h-[44px] rounded-full bg-white border border-slate-200/80 shadow-md hover:shadow-lg active:scale-95 transition-transform cursor-pointer",
    "count": 1,
    "files": [
      "\\components\\Layout\\Layout.jsx"
    ],
    "sampleText": "{icon}\r\n      \r\n      {label}"
  },
  {
    "className": "flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'foto' ? 'bg-[var(--mod-nutricao-to)] border-[var(--mod-nutricao-to)]' : 'bg-white border-slate-200 text-slate-500",
    "count": 1,
    "files": [
      "\\components\\Nutrition\\MealRegistration.jsx"
    ],
    "sampleText": "setEntryMethod('foto')}\r\n                style={entryMethod === 'foto' ? { color: '#fff' } : undefined}\r\n                className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'foto' ? 'bg-[var(--mod-nutricao-to)] border-[var(--mod-nutricao-to)]' : 'bg-white border-slate-200 text-slate-500'}`}\r\n              >\r\n                 Foto (IA)"
  },
  {
    "className": "flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'manual' ? 'bg-[var(--mod-nutricao-to)] border-[var(--mod-nutricao-to)]' : 'bg-white border-slate-200 text-slate-500",
    "count": 1,
    "files": [
      "\\components\\Nutrition\\MealRegistration.jsx"
    ],
    "sampleText": "setEntryMethod('manual')}\r\n                style={entryMethod === 'manual' ? { color: '#fff' } : undefined}\r\n                className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'manual' ? 'bg-[var(--mod-nutricao-to)] border-[var(--mod-nutricao-to)]' : 'bg-white border-slate-200 text-slate-500'}`}\r\n              >\r\n                 Manual"
  },
  {
    "className": "text-[11px] text-slate-500 hover:text-red-500 flex items-center gap-1 transition",
    "count": 1,
    "files": [
      "\\components\\Nutrition\\MealRegistration.jsx"
    ],
    "sampleText": "Limpar todas"
  },
  {
    "className": "w-full text-[13px] font-bold rounded-xl py-2.5 flex items-center justify-center gap-1.5 border transition disabled:opacity-40",
    "count": 1,
    "files": [
      "\\components\\Nutrition\\MealRegistration.jsx"
    ],
    "sampleText": "Adicionar alimento"
  },
  {
    "className": "leading-none",
    "count": 1,
    "files": [
      "\\components\\Nutrition\\NutritionCalendar.jsx"
    ],
    "sampleText": "setSelectedDate(date)}\r\n                  className={`relative flex flex-col items-center justify-center w-10 h-10 rounded-xl text-xs transition ${\r\n                    isSelected ? 'bg-neutral-900 shadow-md' :\r\n                    'text-slate-600 hover:bg-slate-100'\r\n                  }`}\r\n                  style={isSelected ? { color: '#0f172a' } : undefined}\r\n                >\r\n                  {format(date, 'd')}\r\n                  {/* Altura fixa para os dias sem ponto de água não saltarem. */}\r\n                  \r\n                    \r\n                    {waterMet && }"
  },
  {
    "className": "range-chip flex-1 ${activeRange === r ? 'active' : '",
    "count": 1,
    "files": [
      "\\components\\Nutrition\\NutritionDashboard.jsx"
    ],
    "sampleText": "setActiveRange(r)}\r\n            className={`range-chip flex-1 ${activeRange === r ? 'active' : ''}`}\r\n          >\r\n            {r === 'hoje' ? 'Hoje' : r === 'semana' ? 'Esta Semana' : 'Este Mês'}"
  },
  {
    "className": "card rounded-2xl p-4 text-left transition ${isSelected ? 'shadow-md' : '",
    "count": 1,
    "files": [
      "\\components\\Nutrition\\NutritionDashboard.jsx"
    ],
    "sampleText": "setSelectedMacro(m.key)}\r\n              className={`card rounded-2xl p-4 text-left transition ${isSelected ? 'shadow-md' : ''}`}\r\n              style={{\r\n                border: isSelected ? '2px solid var(--accent)' : '1px solid var(--brd-700)',\r\n                boxShadow: isSelected ? '0 0 0 1px var(--accent)' : undefined\r\n              }}\r\n            >\r\n              \r\n                \r\n                {m.label}\r\n              \r\n              \r\n              {goal > 0 ? (\r\n                \r\n                  {over ? `${Math.abs(remaining).toFixed(0)} ${m.unit} acima` : `restam ${remaining.toFixed(0)} ${m.unit}`}\r\n                \r\n              ) : (\r\n                Sem meta\r\n              )}\r\n              \r\n              \r\n                {consumed.toFixed(0)}\r\n                 / {goal > 0 ? goal.toFixed(0) : '-'} {m.unit}\r\n              \r\n\r\n              {/* Barra de progresso do macro */}\r\n              \r\n                 0 ? Math.min(100, (consumed / goal) * 100) : 0}%`, \r\n                    backgroundColor: over ? '#ef4444' : m.color \r\n                  }} \r\n                />"
  },
  {
    "className": "w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition",
    "count": 1,
    "files": [
      "\\components\\Nutrition\\NutritionDashboard.jsx"
    ],
    "sampleText": "setMicrosExpanded(!microsExpanded)}\r\n          className=\"w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition\"\r\n        >\r\n          \r\n            \r\n            Micronutrientes · {activeRange === 'hoje' ? 'Hoje' : activeRange === 'semana' ? 'Semana' : 'Mês'}\r\n          \r\n          {microsExpanded ?  : }"
  },
  {
    "className": "card flex flex-col items-center justify-center rounded-2xl py-4 active:scale-95 transition disabled:opacity-50 border border-transparent hover:border-blue-500/30",
    "count": 1,
    "files": [
      "\\components\\Nutrition\\WaterTracker.jsx"
    ],
    "sampleText": "addWater(preset)}\r\n            disabled={isUpdating}\r\n            className=\"card flex flex-col items-center justify-center rounded-2xl py-4 active:scale-95 transition disabled:opacity-50 border border-transparent hover:border-blue-500/30\"\r\n          >\r\n            \r\n            {preset} ml"
  },
  {
    "className": "tap-44 -mr-2 flex items-center justify-center text-slate-400 active:text-red-500 hover:text-red-500 disabled:opacity-50 transition",
    "count": 1,
    "files": [
      "\\components\\Nutrition\\WaterTracker.jsx"
    ],
    "sampleText": "removeWater(w.id)}\r\n                    disabled={isUpdating}\r\n                    aria-label={`Remover registo de ${w.amount_ml} ml`}\r\n                    className=\"tap-44 -mr-2 flex items-center justify-center text-slate-400 active:text-red-500 hover:text-red-500 disabled:opacity-50 transition\"\r\n                  >"
  },
  {
    "className": "tap-h-44 px-3 rounded-xl text-[11px] font-bold shrink-0 disabled:opacity-50 transition active:scale-95",
    "count": 1,
    "files": [
      "\\components\\Nutrition\\WaterTracker.jsx"
    ],
    "sampleText": "Reativar"
  },
  {
    "className": "animate-spin",
    "count": 1,
    "files": [
      "\\components\\Perfil\\Perfil.jsx"
    ],
    "sampleText": "{isSaving ?  : null}\r\n      {isSaving ? 'A guardar...' : 'Guardar alterações'}"
  },
  {
    "className": "w-full border border-red-500/40 text-red-400 text-xs font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5 hover:bg-red-500/10 transition",
    "count": 1,
    "files": [
      "\\components\\Perfil\\Perfil.jsx"
    ],
    "sampleText": "Terminar sessão"
  },
  {
    "className": "w-11 h-6 rounded-full relative transition shrink-0",
    "count": 1,
    "files": [
      "\\components\\Perfil\\Perfil.jsx"
    ],
    "sampleText": "updateDraft('coach_can_set_nutrition_goals', !draft.coach_can_set_nutrition_goals)} type=\"button\"\r\n                aria-label={draft.coach_can_set_nutrition_goals ? 'Desativar autorização do Coach' : 'Ativar autorização do Coach'}\r\n                aria-pressed={!!draft.coach_can_set_nutrition_goals}\r\n                className=\"w-11 h-6 rounded-full relative transition shrink-0\"\r\n                style={{ background: draft.coach_can_set_nutrition_goals ? 'var(--mod-coach-to)' : 'rgb(64 64 64)' }}>"
  },
  {
    "className": "w-11 h-6 rounded-full relative transition shrink-0 disabled:opacity-60 ${draft.water_reminder_enabled ? 'bg-[var(--accent)]' : 'bg-neutral-700",
    "count": 1,
    "files": [
      "\\components\\Perfil\\Perfil.jsx"
    ],
    "sampleText": "Ação / Ícone"
  },
  {
    "className": "w-full border-2 border-dashed border-[var(--mod-coach-to)]/40 hover:border-[var(--mod-coach-to)]/70 hover:bg-[var(--mod-coach-to)]/10 text-[var(--mod-coach-to)] py-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50",
    "count": 1,
    "files": [
      "\\components\\Perfil\\Perfil.jsx"
    ],
    "sampleText": "{suggestingGoals ?  : }\r\n              {suggestingGoals ? 'A analisar histórico...' : 'Pedir ao Coach para definir objetivos'}"
  },
  {
    "className": "absolute top-3 right-3 text-slate-500 hover:text-white",
    "count": 1,
    "files": [
      "\\components\\Perfil\\Perfil.jsx"
    ],
    "sampleText": "{ setGoalsRationale(''); updateDraft('goals_rationale', null); }} className=\"absolute top-3 right-3 text-slate-500 hover:text-white\">"
  },
  {
    "className": "w-full bg-[var(--mod-corrida-to)] text-white font-bold text-sm rounded-2xl py-3.5 px-4 flex items-center justify-center gap-2 shadow-md hover:shadow-lg hover:opacity-95 active:scale-[0.98] transition",
    "count": 1,
    "files": [
      "\\components\\Run\\MissingMetricsBottomSheet.jsx"
    ],
    "sampleText": "{\n                onAddPhotos();\n                handleDismiss();\n              }}\n              className=\"w-full bg-[var(--mod-corrida-to)] text-white font-bold text-sm rounded-2xl py-3.5 px-4 flex items-center justify-center gap-2 shadow-md hover:shadow-lg hover:opacity-95 active:scale-[0.98] transition\"\n            >\n              \n              Carregar mais prints da app"
  },
  {
    "className": "w-full bg-white text-slate-800 font-bold text-sm rounded-2xl py-3.5 px-4 border border-slate-200 flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-[0.98] transition shadow-sm",
    "count": 1,
    "files": [
      "\\components\\Run\\MissingMetricsBottomSheet.jsx"
    ],
    "sampleText": "{\n                onGoManual();\n                handleDismiss();\n              }}\n              className=\"w-full bg-white text-slate-800 font-bold text-sm rounded-2xl py-3.5 px-4 border border-slate-200 flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-[0.98] transition shadow-sm\"\n            >\n              \n              Completar manualmente"
  },
  {
    "className": "w-full text-slate-500 font-semibold text-xs py-3 flex items-center justify-center gap-1.5 hover:text-slate-700 transition",
    "count": 1,
    "files": [
      "\\components\\Run\\MissingMetricsBottomSheet.jsx"
    ],
    "sampleText": "{\n                onProceedAnyway();\n                handleDismiss();\n              }}\n              className=\"w-full text-slate-500 font-semibold text-xs py-3 flex items-center justify-center gap-1.5 hover:text-slate-700 transition\"\n            >\n              Prosseguir sem estas métricas"
  },
  {
    "className": "tap-44 text-slate-400 hover:text-emerald-500 transition",
    "count": 1,
    "files": [
      "\\components\\Run\\RunAgenda.jsx"
    ],
    "sampleText": "handleToggleStatus(ev)} aria-label={done ? 'Marcar prova como agendada' : 'Marcar prova como concluída'} className=\"tap-44 text-slate-400 hover:text-emerald-500 transition\">\r\n              {done ?  : }"
  },
  {
    "className": "tap-44 text-slate-400 hover:text-[var(--accent)] transition",
    "count": 1,
    "files": [
      "\\components\\Run\\RunAgenda.jsx"
    ],
    "sampleText": "handleOpenForm(ev.id)} aria-label=\"Editar prova\" className=\"tap-44 text-slate-400 hover:text-[var(--accent)] transition\">"
  },
  {
    "className": "tap-44 text-slate-400 hover:text-red-500 transition",
    "count": 1,
    "files": [
      "\\components\\Run\\RunAgenda.jsx"
    ],
    "sampleText": "handleDeleteClick(ev.id)} aria-label=\"Eliminar prova\" className=\"tap-44 text-slate-400 hover:text-red-500 transition\">"
  },
  {
    "className": "border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg py-2 hover:bg-slate-50 transition",
    "count": 1,
    "files": [
      "\\components\\Run\\RunAgenda.jsx"
    ],
    "sampleText": "Cancelar"
  },
  {
    "className": "bg-[var(--accent)] text-neutral-950 text-xs font-bold rounded-lg py-2 flex items-center justify-center gap-1.5 disabled:opacity-50 transition",
    "count": 1,
    "files": [
      "\\components\\Run\\RunAgenda.jsx"
    ],
    "sampleText": "{isSubmitting ?  : } Guardar"
  },
  {
    "className": "flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition disabled:opacity-50",
    "count": 1,
    "files": [
      "\\components\\Run\\RunCard.jsx"
    ],
    "sampleText": "{isReanalyzing ?  : }\r\n                Reanalisar"
  },
  {
    "className": "range-chip flex-1 ${activeRange === r.k ? 'active' : '",
    "count": 1,
    "files": [
      "\\components\\Run\\RunDashboard.jsx"
    ],
    "sampleText": "setActiveRange(r.k)}\r\n            className={`range-chip flex-1 ${activeRange === r.k ? 'active' : ''}`}\r\n          >\r\n            {r.l}"
  },
  {
    "className": "text-[11px] text-slate-500 hover:text-red-400 transition",
    "count": 1,
    "files": [
      "\\components\\Run\\RunRegistration.jsx"
    ],
    "sampleText": "{ if (isFormDirty) setShowUnsavedModal(true); else onClose(); }} className=\"text-[11px] text-slate-500 hover:text-red-400 transition\">Cancelar"
  },
  {
    "className": "rounded-full px-3 py-1.5 text-[11px] font-medium transition border ${runKind === 'treino' ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-500",
    "count": 1,
    "files": [
      "\\components\\Run\\RunRegistration.jsx"
    ],
    "sampleText": "setRunKind('treino')}\r\n              style={runKind === 'treino' ? { color: '#fff' } : undefined}\r\n              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition border ${runKind === 'treino' ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-500'}`}\r\n            >\r\n              Treino"
  },
  {
    "className": "rounded-full px-3 py-1.5 text-[11px] font-medium transition border ${runKind === 'competicao' ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-500",
    "count": 1,
    "files": [
      "\\components\\Run\\RunRegistration.jsx"
    ],
    "sampleText": "setRunKind('competicao')}\r\n              style={runKind === 'competicao' ? { color: '#fff' } : undefined}\r\n              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition border ${runKind === 'competicao' ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-500'}`}\r\n            >\r\n              Competição"
  },
  {
    "className": "flex-1 aspect-square rounded-lg flex items-center justify-center text-[13px] font-bold transition-colors border shadow-sm ${runEffortRpe === i + 1 ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-400",
    "count": 1,
    "files": [
      "\\components\\Run\\RunRegistration.jsx"
    ],
    "sampleText": "setRunEffortRpe(runEffortRpe === i + 1 ? 0 : i + 1)}\r\n                  style={runEffortRpe === i + 1 ? { color: '#fff' } : undefined}\r\n                  className={`flex-1 aspect-square rounded-lg flex items-center justify-center text-[13px] font-bold transition-colors border shadow-sm ${runEffortRpe === i + 1 ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-400'}`}\r\n                >\r\n                  {i + 1}"
  },
  {
    "className": "flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'foto' ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-500",
    "count": 1,
    "files": [
      "\\components\\Run\\RunRegistration.jsx"
    ],
    "sampleText": "setEntryMethod('foto')}\r\n                  style={entryMethod === 'foto' ? { color: '#fff' } : undefined}\r\n                  className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'foto' ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-500'}`}\r\n                >\r\n                   Foto (IA)"
  },
  {
    "className": "flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'manual' ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-500",
    "count": 1,
    "files": [
      "\\components\\Run\\RunRegistration.jsx"
    ],
    "sampleText": "setEntryMethod('manual')}\r\n                  style={entryMethod === 'manual' ? { color: '#fff' } : undefined}\r\n                  className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'manual' ? 'bg-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]' : 'bg-white border-slate-200 text-slate-500'}`}\r\n                >\r\n                   Manual"
  },
  {
    "className": "absolute top-1 right-1 bg-slate-900/80 rounded-full p-1 hover:bg-red-500 transition",
    "count": 1,
    "files": [
      "\\components\\Run\\RunRegistration.jsx"
    ],
    "sampleText": "removePhoto(i)} style={{ color: '#fff' }} className=\"absolute top-1 right-1 bg-slate-900/80 rounded-full p-1 hover:bg-red-500 transition\">"
  },
  {
    "className": "text-[11px] text-slate-500 hover:text-red-400 flex items-center gap-1 transition",
    "count": 1,
    "files": [
      "\\components\\Run\\RunRegistration.jsx"
    ],
    "sampleText": "setRunPhotos([])} className=\"text-[11px] text-slate-500 hover:text-red-400 flex items-center gap-1 transition\">\r\n                       Limpar todos"
  },
  {
    "className": "text-[12px] text-[#f07167] font-semibold flex items-center gap-1 hover:underline",
    "count": 1,
    "files": [
      "\\components\\Run\\RunRegistration.jsx"
    ],
    "sampleText": "setHrZones([...hrZones, { zone: '', minutes: '' }])} \r\n                  type=\"button\" \r\n                  className=\"text-[12px] text-[#f07167] font-semibold flex items-center gap-1 hover:underline\"\r\n                >\r\n                   Adicionar zona"
  },
  {
    "className": "p-1 text-slate-400 hover:text-red-500",
    "count": 1,
    "files": [
      "\\components\\Run\\RunRegistration.jsx"
    ],
    "sampleText": "setHrZones(hrZones.filter((_, i) => i !== idx))} \r\n                      type=\"button\" \r\n                      className=\"p-1 text-slate-400 hover:text-red-500\"\r\n                    >"
  },
  {
    "className": "text-[11px] text-[var(--accent)] font-bold flex items-center gap-0.5",
    "count": 1,
    "files": [
      "\\components\\Run\\RunRegistration.jsx"
    ],
    "sampleText": "setSplits([...splits, { distance_km: '', minutes: '' }])} className=\"text-[11px] text-[var(--accent)] font-bold flex items-center gap-0.5\">\r\n                   Adicionar split"
  },
  {
    "className": "fixed bottom-20 right-5 z-[90] bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-full px-3.5 py-2.5 shadow-lg flex items-center gap-1.5 transition active:scale-95 animate-bounce",
    "count": 1,
    "files": [
      "\\components\\Run\\RunRegistration.jsx"
    ],
    "sampleText": "setShowMissingMetricsSheet(true)}\r\n          className=\"fixed bottom-20 right-5 z-[90] bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-full px-3.5 py-2.5 shadow-lg flex items-center gap-1.5 transition active:scale-95 animate-bounce\"\r\n        >\r\n          \r\n          Métricas em falta ({missingKeysList.length})"
  },
  {
    "className": "w-full font-bold text-[14px] rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-sm disabled:opacity-30",
    "count": 1,
    "files": [
      "\\components\\shared\\CoachButton.jsx"
    ],
    "sampleText": "{busy ? busyLabel : label}"
  },
  {
    "className": "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 transition disabled:opacity-60",
    "count": 1,
    "files": [
      "\\components\\shared\\ConfirmDeleteModal.jsx"
    ],
    "sampleText": "{isDeleting ?  : null}\n            {isDeleting ? 'A eliminar...' : 'Eliminar'}"
  },
  {
    "className": "inline-flex items-center justify-center rounded-full active:scale-90 transition",
    "count": 1,
    "files": [
      "\\components\\shared\\ExperienceLevelHelp.jsx"
    ],
    "sampleText": "setOpen(o => !o)}\r\n          aria-expanded={open}\r\n          aria-label={open ? 'Fechar ajuda sobre os níveis' : 'O que significa cada nível?'}\r\n          title=\"O que significa cada nível?\"\r\n          className=\"inline-flex items-center justify-center rounded-full active:scale-90 transition\"\r\n          style={{\r\n            color: 'var(--mod-coach-to)',\r\n            background: 'color-mix(in srgb, var(--mod-coach-to) 15%, transparent)',\r\n            width: 18,\r\n            height: 18,\r\n          }}\r\n        >"
  },
  {
    "className": "tap-44 shrink-0 -mt-2 -mr-1 flex items-center justify-center",
    "count": 1,
    "files": [
      "\\components\\shared\\ExperienceLevelHelp.jsx"
    ],
    "sampleText": "setOpen(false)}\r\n              aria-label=\"Fechar ajuda sobre os níveis\"\r\n              className=\"tap-44 shrink-0 -mt-2 -mr-1 flex items-center justify-center\"\r\n              style={{ color: bodyColor }}\r\n            >"
  },
  {
    "className": "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs bg-[var(--accent)] shadow-lg active:scale-95 transition disabled:opacity-60 text-white",
    "count": 1,
    "files": [
      "\\components\\shared\\UnsavedChangesModal.jsx"
    ],
    "sampleText": "{isSaving ?  : null}\n            {isSaving ? 'A guardar...' : 'Gravar e sair'}"
  },
  {
    "className": "w-full py-3 rounded-xl font-semibold text-xs border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 transition disabled:opacity-60",
    "count": 1,
    "files": [
      "\\components\\shared\\UnsavedChangesModal.jsx"
    ],
    "sampleText": "Sair sem gravar"
  },
  {
    "className": "w-full py-2.5 rounded-xl font-semibold text-xs text-slate-400 hover:text-slate-200 transition disabled:opacity-60",
    "count": 1,
    "files": [
      "\\components\\shared\\UnsavedChangesModal.jsx"
    ],
    "sampleText": "Cancelar"
  }
];