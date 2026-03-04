export interface PortfolioProject {
  category: string;
  slug: string;
  displayName: string;
  location?: string;
  priority?: number;
  coverImage: string | null;
  featuredImage: string | null;
  summaryVideo: string | null;
  galleryImages: string[];
}

export interface PortfolioIndex {
  categories: string[];
  projects: PortfolioProject[];
}
