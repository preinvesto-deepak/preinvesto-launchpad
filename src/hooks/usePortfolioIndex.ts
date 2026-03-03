import { useQuery } from "@tanstack/react-query";
import type { PortfolioIndex } from "@/types/portfolio";

export function usePortfolioIndex() {
  return useQuery<PortfolioIndex>({
    queryKey: ["portfolio-index"],
    queryFn: async () => {
      const res = await fetch("/portfolio/index.json");
      if (!res.ok) throw new Error("Failed to load portfolio index");
      const data: PortfolioIndex = await res.json();
      // Sort by priority (lower first), then by displayName
      data.projects.sort((a, b) => {
        const pa = a.priority ?? 999;
        const pb = b.priority ?? 999;
        if (pa !== pb) return pa - pb;
        return a.displayName.localeCompare(b.displayName);
      });
      return data;
    },
    staleTime: 1000 * 60 * 10,
  });
}
