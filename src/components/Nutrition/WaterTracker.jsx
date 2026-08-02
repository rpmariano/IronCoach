import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { Droplets, Plus, Minus, GlassWater, Info, Trash2 } from 'lucide-react';

const WATER_PRESETS = [200, 250, 300];

export default function WaterTracker() {
  const { profile, waterLogs, session } = useAppStore();
  const [isUpdating, setIsUpdating] = useState(false);

  // Goal from profile
  const goal = profile?.water_goal_ml || 2000;

  // Filter logs for today
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayLogs = useMemo(() => {
    return waterLogs.filter(log => {
      const logDate = new Date(log.created_at).toISOString().slice(0, 10);
      return logDate === todayStr;
    });
  }, [waterLogs, todayStr]);

  // Calculate total consumed today
  const consumed = useMemo(() => {
    return todayLogs.reduce((acc, log) => acc + log.amount_ml, 0);
  }, [todayLogs]);

  const percentage = Math.min(100, Math.round((consumed / goal) * 100));

  // Determine glasses (based on 250ml avg glass)
  const totalGlassesGoal = Math.max(8, Math.ceil(goal / 250));
  const glassesConsumed = Math.floor(consumed / 250);

  const addWater = async (amount) => {
    if (isUpdating || !session?.user?.id) return;
    setIsUpdating(true);
    try {
      const newLog = {
        user_id: session.user.id,
        amount_ml: amount,
        date: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString()
      };
      const { data, error } = await supabase.from('water_logs').insert(newLog).select().single();
      if (error) throw error;
      
      // Update store directly for immediate feedback
      useAppStore.setState(state => ({
        waterLogs: [data, ...state.waterLogs]
      }));
    } catch (err) {
      console.error('Error adding water:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const removeWater = async (logId) => {
    if (isUpdating || todayLogs.length === 0) return;
    
    // Default to last log if no id provided (for the minus button)
    let targetLogId = logId;
    if (!targetLogId) {
      const lastLog = [...todayLogs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      if (!lastLog) return;
      targetLogId = lastLog.id;
    }

    setIsUpdating(true);
    try {
      const { error } = await supabase.from('water_logs').delete().eq('id', targetLogId);
      if (error) throw error;

      // Update store
      useAppStore.setState(state => ({
        waterLogs: state.waterLogs.filter(log => log.id !== targetLogId)
      }));
    } catch (err) {
      console.error('Error removing water:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6 fade-in pb-8">
      {/* Progress Circle & Totals */}
      <div className="card rounded-2xl p-6 flex flex-col items-center justify-center text-center">
        <Droplets size={32} style={{ color: 'var(--blue)' }} className="mb-3" />
        <h2 className="text-sm font-semibold text-slate-500 mb-1">Água consumida hoje</h2>
        <div className="flex items-baseline gap-1 mb-2">
          <span className="text-4xl font-black text-slate-800">{consumed}</span>
          <span className="text-sm font-bold text-slate-500">/ {goal} ml</span>
        </div>
        
        {/* Simple Progress Bar */}
        <div className="w-full max-w-xs h-3 bg-slate-200 rounded-full mt-4 overflow-hidden relative">
          <div 
            className="absolute top-0 left-0 bottom-0 rounded-full transition-all duration-500"
            style={{ width: `${percentage}%`, backgroundColor: 'var(--blue)' }}
          />
        </div>
        <p className="text-[10px] font-bold mt-2" style={{ color: 'var(--blue)' }}>{percentage}% do objetivo diário</p>
      </div>

      {/* Quick Add Buttons */}
      <div className="grid grid-cols-3 gap-3">
        {WATER_PRESETS.map(preset => (
          <button 
            key={preset}
            onClick={() => addWater(preset)}
            disabled={isUpdating}
            className="card flex flex-col items-center justify-center rounded-2xl py-4 active:scale-95 transition disabled:opacity-50 border border-transparent hover:border-blue-500/30"
          >
            <Droplets size={20} style={{ color: 'var(--blue)' }} className="mb-1" />
            <span className="text-sm font-bold text-slate-700">{preset} ml</span>
          </button>
        ))}
      </div>

      {/* History List */}
      {todayLogs.length > 0 && (
        <div className="card rounded-2xl p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Registos de hoje</h2>
          <div className="space-y-1.5">
            {[...todayLogs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(w => (
              <div key={w.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                <span className="text-xs font-semibold text-slate-700">{w.amount_ml} ml</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">
                    {new Date(w.created_at).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'})}
                  </span>
                  <button 
                    onClick={() => removeWater(w.id)}
                    disabled={isUpdating}
                    aria-label={`Remover registo de ${w.amount_ml} ml`}
                    className="tap-44 -mr-2 flex items-center justify-center text-slate-400 active:text-red-500 hover:text-red-500 disabled:opacity-50 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      <div className="card rounded-xl p-3 bg-blue-50/50 border border-blue-100 flex gap-2">
        <Info size={16} style={{ color: 'var(--blue)' }} className="shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Para atingires a tua meta de <b>{goal} ml</b>, precisas de beber <b>{totalGlassesGoal} copos</b> de 250ml ao longo do dia.
        </p>
      </div>
    </div>
  );
}
