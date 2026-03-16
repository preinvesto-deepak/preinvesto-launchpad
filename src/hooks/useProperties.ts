import { useState, useEffect, useCallback } from "react";
import SEED_PROPERTIES, { type Property } from "@/data/propertiesSeed";

const STORAGE_KEY = "preinvesto_properties";

function loadProperties(): Property[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: Property[] = JSON.parse(stored);
      // Merge: keep user-added, update seeds
      const userAdded = parsed.filter((p) => !p.id.startsWith("seed-"));
      const seedIds = new Set(SEED_PROPERTIES.map((s) => s.id));
      const existingSeeds = parsed.filter((p) => seedIds.has(p.id));
      // Use seeds from data, but keep stored seeds if they exist
      const mergedSeeds = SEED_PROPERTIES.map(
        (s) => existingSeeds.find((e) => e.id === s.id) || s
      );
      return [...userAdded, ...mergedSeeds];
    }
  } catch {
    // ignore
  }
  return [...SEED_PROPERTIES];
}

export function useProperties() {
  const [properties, setProperties] = useState<Property[]>(loadProperties);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(properties));
  }, [properties]);

  const addProperty = useCallback((property: Omit<Property, "id" | "createdAt">) => {
    const newProp: Property = {
      ...property,
      id: `user-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setProperties((prev) => [newProp, ...prev]);
    return newProp;
  }, []);

  return { properties, addProperty };
}
