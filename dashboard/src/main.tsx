
  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import "./styles/globals.css";
  import "./index.css";
  import { ThemeProvider } from "./components/theme-provider";
  import { DeviceStateProvider } from "./contexts/DeviceStateContext";
  import { AuthProvider } from "./contexts/AuthContext";

  createRoot(document.getElementById("root")!).render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <DeviceStateProvider>
          <App />
        </DeviceStateProvider>
      </AuthProvider>
    </ThemeProvider>
  );
  