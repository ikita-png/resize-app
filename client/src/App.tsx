import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const { data: passwordRequired, isLoading: loadingRequired } = trpc.auth.isPasswordRequired.useQuery();
  const { data: authStatus, isLoading: loadingAuth, refetch } = trpc.auth.checkAuth.useQuery();

  useEffect(() => {
    if (loadingRequired || loadingAuth) return;

    // If password is not required, allow access
    if (!passwordRequired?.required) {
      setIsAuthenticated(true);
      return;
    }

    // Check if authenticated
    setIsAuthenticated(authStatus?.authenticated ?? false);
  }, [passwordRequired, authStatus, loadingRequired, loadingAuth]);

  // Loading state
  if (isAuthenticated === null || loadingRequired || loadingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return (
      <Login
        onLoginSuccess={() => {
          refetch();
          setIsAuthenticated(true);
        }}
      />
    );
  }

  // Authenticated - show app
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
      // switchable
      >
        <TooltipProvider>
          <Toaster />
          <AuthWrapper>
            <Router />
          </AuthWrapper>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
