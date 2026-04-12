import React, { useEffect, useState } from 'react';
import { sendNotification } from '../lib/notifications';
import { getMitigationSuggestions } from '../lib/utils';
import { listProjects } from '../lib/projectsApi';
import { listSubcontracts } from '../lib/subcontractsApi';
import { dispatchDueReminderNotifications } from '../lib/reminders';

export const NotificationManager: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [subcontracts, setSubcontracts] = useState<any[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [projectsItems, subcontractsItems] = await Promise.all([
          listProjects(),
          listSubcontracts({ status: 'Active' }),
        ]);
        if (cancelled) return;

        setProjects(projectsItems.filter((p: any) => p.status === 'In Progress'));
        setSubcontracts(subcontractsItems);
        setIsReady(true);
      } catch (error) {
        if (!cancelled) {
          console.error('Error loading data in NotificationManager:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const notifiedKey = `notified_${todayStr}`;
    const notifiedItems = JSON.parse(localStorage.getItem(notifiedKey) || '{}');
    let hasNewNotifications = false;

    // 1. Check for expiring subcontracts (within 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    subcontracts.forEach((sub: any) => {
      if (sub.endDate && sub.status !== 'Finished') {
        const endDate = new Date(sub.endDate);
        const subId = `sub_exp_${sub.id}`;
        
        if (endDate <= sevenDaysFromNow && endDate >= now && !notifiedItems[subId]) {
          sendNotification(
            'Subcontrato por Vencer',
            `El subcontrato con ${sub.contractor} para la obra ${sub.projectName} vence el ${sub.endDate}.`,
            'subcontract'
          );
          notifiedItems[subId] = true;
          hasNewNotifications = true;
        }
      }
    });

    // 2. Check for financial deviations in active projects (> 15%)
    projects.forEach((p: any) => {
      if (p.status === 'In Progress') {
        const financialProgress = p.budget > 0 ? (p.spent / p.budget) * 100 : 0;
        const physicalProgress = p.physicalProgress || 0;
        const deviation = financialProgress - physicalProgress;
        const projectId = `proj_dev_crit_${p.id}`;

        if (deviation > 15 && !notifiedItems[projectId]) {
          const suggestions = getMitigationSuggestions(deviation);
          const body = `La obra ${p.name} tiene una desviación crítica del ${deviation.toFixed(1)}%. Sugerencia: ${suggestions[0] || 'Revisar costos inmediatamente.'}`;
          
          sendNotification(
            'Alerta de Desviación Financiera',
            body,
            'project'
          );
          notifiedItems[projectId] = true;
          hasNewNotifications = true;
        }
      }
    });

    if (hasNewNotifications) {
      localStorage.setItem(notifiedKey, JSON.stringify(notifiedItems));
    }
  }, [projects, subcontracts, isReady]);

  useEffect(() => {
    if (!isReady) return;

    let active = true;

    const runReminderCheck = async () => {
      if (!active) return;
      try {
        await dispatchDueReminderNotifications(new Date());
      } catch (error) {
        console.error('Error dispatching calendar reminders:', error);
      }
    };

    void runReminderCheck();
    const reminderTimer = window.setInterval(() => {
      void runReminderCheck();
    }, 30000);

    return () => {
      active = false;
      window.clearInterval(reminderTimer);
    };
  }, [isReady]);

  return null; // This component doesn't render anything
};
