import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  msg: string;
  type: 'success' | 'error' | 'info';
}

interface ConfirmState {
  msg: string;
  resolve: (v: boolean) => void;
}

interface ToastCtx {
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  confirm: (msg: string) => Promise<boolean>;
}

const Ctx = createContext<ToastCtx>({ toast: () => {}, confirm: () => Promise.resolve(false) });

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const idRef = useRef(0);

  const toast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const confirm = useCallback((msg: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ msg, resolve });
    });
  }, []);

  const handleConfirm = (value: boolean) => {
    if (confirmState) {
      confirmState.resolve(value);
      setConfirmState(null);
    }
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.msg}
          </div>
        ))}
      </div>
      {confirmState && (
        <div className="confirm-overlay" onClick={() => handleConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-body">{confirmState.msg}</div>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-cancel" onClick={() => handleConfirm(false)}>取消</button>
              <button className="confirm-btn confirm-ok" onClick={() => handleConfirm(true)}>确定</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
