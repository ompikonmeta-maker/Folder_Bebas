import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/roboto-flex/full.css";
import "material-symbols/rounded.css";
import "./styles/tokens.css";
import "./styles/app.css";
import { App } from "./App";
import { DataProvider } from "./lib/data";
import { SnackProvider } from "./components/Snackbar";
import { initTheme } from "./lib/theme";

initTheme();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DataProvider>
      <SnackProvider>
        <App />
      </SnackProvider>
    </DataProvider>
  </React.StrictMode>,
);
