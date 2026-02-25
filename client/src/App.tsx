import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import Invoice from "./pages/Invoice";
import SharedInvoice from "./pages/SharedInvoice";
import ClientPortal from "./pages/ClientPortal";
import CreateInvoice from "./pages/CreateInvoice";
import EditInvoice from "./pages/EditInvoice";
import Leads from "./pages/Leads";
import Clients from "./pages/Clients";
import Invoices from "./pages/Invoices";
import Calendar from "./pages/Calendar";
import Settings from "./pages/Settings";
import Tasks from "./pages/Tasks";
import Subscriptions from "./pages/Subscriptions";
import Login from "./pages/Login";

function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  return (
    <Switch>
      {/* Auth */}
      <Route path={"/login"} component={Login} />

      {/* Public client-facing routes — no sidebar */}
      <Route path={"/client/:slug"} component={ClientPortal} />
      <Route path={"/client/:slug/invoice/:invoiceNumber"} component={Invoice} />
      <Route path={"/i/:token"} component={SharedInvoice} />

      {/* Admin routes — wrapped in sidebar layout */}
      <Route>
        {() => (
          <AdminLayout>
            <Switch>
              <Route path={"/"} component={Home} />
              <Route path={"/clients"} component={Clients} />
              <Route path={"/invoices"} component={Invoices} />
              <Route path={"/leads"} component={Leads} />
              <Route path={"/calendar"} component={Calendar} />
              <Route path={"/tasks"} component={Tasks} />
              <Route path={"/subscriptions"} component={Subscriptions} />
              <Route path={"/settings"} component={Settings} />
              <Route path={"/invoice/new"} component={CreateInvoice} />
              <Route path={"/invoice/:invoiceNumber/edit"} component={EditInvoice} />
              <Route path={"/invoice/:invoiceNumber"} component={Invoice} />
              <Route component={NotFound} />
            </Switch>
          </AdminLayout>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
