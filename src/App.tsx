import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AdminProvider, useAdmin } from "@/context/AdminContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ScrollToTop from "./components/ScrollToTop";

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AdminProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
