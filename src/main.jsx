import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DevForgeDashboard from "../DevForgeDashboard.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <DevForgeDashboard />
  </StrictMode>
);
