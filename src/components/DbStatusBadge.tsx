import React, { useEffect, useState } from 'react';
import { subscribeConnectionStatus } from '../services/firebase';

interface DbStatusBadgeProps {
  className?: string;
}

export const DbStatusBadge: React.FC<DbStatusBadgeProps> = ({ className = '' }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeConnectionStatus((connected) => {
      setIsConnected(connected);
    });
    return () => unsub();
  }, []);

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all shadow-sm ${
        isConnected
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
      } ${className}`}
      title={
        isConnected
          ? 'Connessione al Realtime Database Firebase attiva e funzionante'
          : 'In connessione al Realtime Database (sincronizzazione locale attiva)'
      }
    >
      <span className="relative flex h-2.5 w-2.5">
        {isConnected && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        )}
        <span
          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
            isConnected ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'
          }`}
        ></span>
      </span>
      <span>{isConnected ? 'DB Connesso' : 'Connessione DB...'}</span>
    </div>
  );
};
