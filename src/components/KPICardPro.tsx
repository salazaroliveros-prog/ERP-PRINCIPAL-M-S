import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

interface KPICardProProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: 'up' | 'down';
  trendValue?: string;
  color: string;
  data?: { value: number }[]; // Sparkline data
}

export const KPICardPro: React.FC<KPICardProProps> = ({ title, value, icon: Icon, trend, trendValue, color, data }) => {
  return (
    <motion.div 
      whileHover={{ y: -2 }}
      className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden relative"
    >
      <div className="flex justify-between items-start z-10">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
          <h4 className="text-xl font-black text-slate-900 dark:text-white mt-1">{value}</h4>
        </div>
        <div className={cn("p-2 rounded-xl text-white", color)}>
          <Icon size={16} />
        </div>
      </div>
      
      {data && (
        <div className="h-12 w-full mt-2 -mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <Area type="monotone" dataKey="value" stroke={color.includes('primary') ? '#2563eb' : '#10b981'} fill={color.includes('primary') ? '#dbeafe' : '#d1fae5'} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {trend && (
        <div className={cn("text-[9px] font-bold mt-2", trend === 'up' ? "text-emerald-500" : "text-rose-500")}>
          {trend === 'up' ? '▲' : '▼'} {trendValue}
        </div>
      )}
    </motion.div>
  );
};
