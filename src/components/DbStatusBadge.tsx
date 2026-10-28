import React, { useEffect, useState } from 'react';
import { subscribeNetworkStatus } from '../services/networkSync';

interface DbStatusBadgeProps {
  className?: string;
}

export const DbStatusBadge: React.FC<DbStatusBadgeProps> = ({ className = '' }) => {
  const [status, setStatus] = useState<{
    connected: boolean;
    type: 'firebase' | 'webrtc' | 'local' | 'connecting';
    details?: string;
  }>({
    connected: false,
    type: 'connecting'
  });

  useEffect(() => {
    const unsub = subscribeNetworkStatus((st) => {
      setStatus(st);
    });
    return () => unsub();
  }, []);

  const isGreen = status.connected;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all shadow-sm ${
        isGreen
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
      } ${className}`}
      title={
        isGreen
          ? `Sincronizzazione attiva (${status.details || status.type})`
          : 'Inizializzazione canali (WebRTC P2P + Firebase)...'
      }
    >
      <span className="relative flex h-2.5 w-2.5">
        {isGreen && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        )}
        <span
          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
            isGreen ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'
          }`}
        ></span>
      </span>
      <span>{isGreen ? (status.details ? `Rete: ${status.details}` : 'Rete Connessa') : 'Connessione Rete...'}</span>
    </div>
  );
};
