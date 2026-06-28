import { useEffect } from "react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { restoreStoredSession } from "@/shared/model/sessionActions";
import { reduxStore } from "@/store/reduxStore";
import { loadStorage } from "@/utils/storage";

function RestoreStoredSession() {
  useEffect(() => {
    const storedSession = loadStorage();
    if (!storedSession) return;
    restoreStoredSession(storedSession);
  }, []);

  return null;
}

export function AppProviders({ children }) {
  return (
    <Provider store={reduxStore}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <RestoreStoredSession />
            {children}
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </Provider>
  );
}
