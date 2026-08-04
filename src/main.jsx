// Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DevForgeDashboard from "../DevForgeDashboard.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <DevForgeDashboard />
  </StrictMode>
);
