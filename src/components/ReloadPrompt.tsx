import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export default function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ', r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 max-w-sm animate-fade-in flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <h3 className="text-sm font-bold text-[#004183]">
          {offlineReady ? 'App lista para uso sin conexión' : '¡Nueva Actualización Disponible!'}
        </h3>
        <button onClick={close} className="text-slate-400 hover:text-slate-600 transition cursor-pointer">
          <X size={16} />
        </button>
      </div>
      
      <p className="text-xs text-slate-500">
        {offlineReady
          ? 'La aplicación se ha guardado y funcionará sin internet.'
          : 'He realizado cambios en el código de la app. Pulsa actualizar para ver la nueva versión.'}
      </p>

      {needRefresh && (
        <button
          onClick={() => updateServiceWorker(true)}
          className="w-full bg-[#004183] hover:bg-blue-800 text-white text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-2 transition shadow-sm cursor-pointer"
        >
          <RefreshCw size={14} />
          Actualizar App Ahora
        </button>
      )}
    </div>
  );
}
