
  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import "./styles/globals.css";
  import "./index.css";
  import { ThemeProvider } from "./components/theme-provider";
  import { DeviceStateProvider } from "./contexts/DeviceStateContext";

  createRoot(document.getElementById("root")!).render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <DeviceStateProvider>
        <App />
      </DeviceStateProvider>
    </ThemeProvider>
  );
  