import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { App } from "./App";
import { Toaster } from "@/components/ui/sonner";
import "./styles.css";

const queryClient = new QueryClient({});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster richColors />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
