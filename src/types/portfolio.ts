export interface PortfolioProject {
  category: string;
  slug: string;
  displayName: string;
  coverImage: string | null;
  featuredImage: string | null;
  summaryVideo: string | null;
  galleryImages: string[];
}

export interface PortfolioIndex {
  categories: string[];
  projects: PortfolioProject[];
}
