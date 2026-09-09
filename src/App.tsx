import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AdminProvider, useAdmin } from "@/context/AdminContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ScrollToTop from "./components/ScrollToTop";
import TermsAndConditions from "./pages/TermsAndConditions";

const About = lazy(() => import("./pages/About"));
const Services = lazy(() => import("./pages/Services"));
const ServiceDetail = lazy(() => import("./pages/ServiceDetail"));
const PortfolioListing = lazy(() => import("./pages/PortfolioListing"));
const PortfolioProject = lazy(() => import("./pages/PortfolioProject"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogDetail = lazy(() => import("./pages/BlogDetail"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Contact = lazy(() => import("./pages/Contact"));
const Properties = lazy(() => import("./pages/Properties"));
const InteriorDesign = lazy(() => import("./pages/Index_InteriorDesign"));
const Construction = lazy(() => import("./pages/Index_Construction"));
const PropertyAdd = lazy(() => import("./pages/PropertyAdd"));
const PropertyEdit = lazy(() => import("./pages/PropertyEdit"));
const PropertyDetail = lazy(() => import("./pages/PropertyDetail"));
const SoldProperties = lazy(() => import("./pages/SoldProperties"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminReview = lazy(() => import("./pages/AdminReview"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Profile = lazy(() => import("./pages/Profile"));
// Lazy so the Interior tool's bundle (and jsPDF/xlsx) only loads for the
// people who actually open it, not every visitor to the marketing site.
const InteriorApp = lazy(() => import("./interior/InteriorApp"));

// Redirects to /admin login if not admin, preserving intended destination
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin } = useAdmin();
  const location = useLocation();
  if (!isAdmin) return <Navigate to="/admin" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
};

const queryClient = new QueryClient();

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
  </div>
);

// Sends signed-out visitors to /login, remembering where they were headed so
// they land there after signing in. Waits for the stored token to be checked
// first, otherwise a refresh would bounce a signed-in user straight out.
const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
      <AuthProvider>
      <AdminProvider>
        <Suspense fallback={<Loading />}>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/about" element={<About />} />
            <Route path="/services" element={<Services />} />
            <Route path="/services/:slug" element={<ServiceDetail />} />
            <Route path="/services/property-search" element={<Navigate to="/properties" replace />} />
            <Route path="/portfolio" element={<PortfolioListing />} />
            {/* Redirect old slug to new slug */}
            <Route
              path="/portfolio/interiors/minimal-bedroom"
              element={<Navigate to="/portfolio/interiors/aparna-sarovar-zenith" replace />}
            />
            <Route path="/portfolio/:category/:projectSlug" element={<PortfolioProject />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogDetail />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/properties" element={<Properties />} />
            <Route path="/interior-design" element={<InteriorDesign />} />
            <Route path="/construction-home" element={<Construction />} />
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/admin/review" element={<AdminRoute><AdminReview /></AdminRoute>} />
            <Route path="/properties/add" element={<PropertyAdd />} />
            <Route path="/properties/sold" element={<SoldProperties />} />
            <Route path="/properties/:id/edit" element={<AdminRoute><PropertyEdit /></AdminRoute>} />
            <Route path="/properties/:id" element={<PropertyDetail />} />

            {/* Interior Quotation tool — account area */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/profile"
              element={<RequireAuth><Profile /></RequireAuth>}
            />
            <Route
              path="/interior/*"
              element={<RequireAuth><InteriorApp /></RequireAuth>}
            />

            <Route path="*" element={<NotFound />} />
            <Route path="/terms" element={<TermsAndConditions />} />
          </Routes>
        </Suspense>
      </AdminProvider>
      </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
