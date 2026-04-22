import React, { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isWithinInterval, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface CalendarViewProps {
  projects: any[];
}

export default function CalendarView({ projects }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = React.useState(new Date());

  const calendarData = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const calendarDays = eachDayOfInterval({
      start: startDate,
      end: endDate,
    });

    return { calendarDays, monthStart, monthEnd };
  }, [currentDate]);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const getProjectsForDay = useMemo(() => 
    (day: Date) => {
      return projects.filter(p => {
        if (!p.startDate || !p.endDate) return false;
        const start = parseISO(p.startDate);
        const end = parseISO(p.endDate);
        return isWithinInterval(day, { start, end });
      });
    },
    [projects]
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary text-white rounded-2xl shadow-lg shadow-primary-shadow">
            <CalendarIcon size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: es })}
            </h2>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Cronograma de Obras</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={prevMonth}
            className="p-3 hover:bg-white dark:hover:bg-slate-700 rounded-2xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400"
          >
            <ChevronLeft size={24} />
          </button>
          <button 
            onClick={() => setCurrentDate(new Date())}
            className="px-6 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
          >
            Hoy
          </button>
          <button 
            onClick={nextMonth}
            className="p-3 hover:bg-white dark:hover:bg-slate-700 rounded-2xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
          <div key={day} className="py-4 text-center text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-[120px]">
        {calendarData.calendarDays.map((day, idx) => {
          const dayProjects = getProjectsForDay(day);
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, calendarData.monthStart);

          return (
            <div 
              key={idx} 
              className={cn(
                "p-2 border-r border-b border-slate-100 dark:border-slate-800 transition-colors relative group",
                !isCurrentMonth && "bg-slate-50/30 dark:bg-slate-800/10",
                isToday && "bg-primary/5 dark:bg-primary/10"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  "text-xs font-bold w-7 h-7 flex items-center justify-center rounded-lg transition-all",
                  isToday ? "bg-primary text-white shadow-lg shadow-primary-shadow" : "text-slate-400 dark:text-slate-500",
                  isCurrentMonth && !isToday && "text-slate-700 dark:text-slate-300"
                )}>
                  {format(day, 'd')}
                </span>
                {dayProjects.length > 0 && (
                  <span className="text-[10px] font-black text-primary uppercase tracking-tighter">
                    {dayProjects.length} {dayProjects.length === 1 ? 'Obra' : 'Obras'}
                  </span>
                )}
              </div>

              <div className="space-y-1 overflow-y-auto max-h-[80px] scrollbar-hide">
                {dayProjects.slice(0, 3).map((p, pIdx) => (
                  <div 
                    key={p.id}
                    className={cn(
                      "px-2 py-1 rounded-md text-[9px] font-bold truncate transition-all cursor-pointer",
                      p.status === 'In Progress' ? "bg-blue-500/10 text-blue-600 border border-blue-500/20" :
                      p.status === 'Completed' ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" :
                      p.status === 'On Hold' ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" :
                      "bg-slate-500/10 text-slate-600 border border-slate-500/20"
                    )}
                  >
                    {p.name}
                  </div>
                ))}
                {dayProjects.length > 3 && (
                  <div className="text-[8px] font-black text-slate-400 text-center uppercase tracking-widest pt-1">
                    + {dayProjects.length - 3} más
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
