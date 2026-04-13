import React from 'react';
import { BellRing } from 'lucide-react';

interface TopbarNotificationButtonProps {
  unreadCount?: number;
  onClick?: () => void;
}

const TopbarNotificationButton: React.FC<TopbarNotificationButtonProps> = ({ unreadCount = 0, onClick }) => (
  <button
    className="relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-primary/10 dark:hover:bg-primary/20 transition"
    title="Notificaciones"
    onClick={onClick}
    style={{ pointerEvents: 'auto' }}
  >
    <BellRing size={22} className="text-primary" />
    {unreadCount > 0 && (
      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-primary text-white text-[9px] font-black rounded-full flex items-center justify-center">
        {unreadCount > 9 ? '9+' : unreadCount}
      </span>
    )}
  </button>
);

export default TopbarNotificationButton;
