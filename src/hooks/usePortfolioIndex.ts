import { useQuery } from "@tanstack/react-query";
import type { PortfolioIndex } from "@/types/portfolio";

export function usePortfolioIndex() {
  return useQuery<PortfolioIndex>({
    queryKey: ["portfolio-index"],
    queryFn: async () => {
      const res = await fetch("/portfolio/index.json");
      if (!res.ok) throw new Error("Failed to load portfolio index");
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });
}
