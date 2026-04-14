// Google Maps Places — uses the NEW Places API (required for keys created after March 2025).
// Uses google.maps.places.AutocompleteSuggestion + google.maps.places.Place

declare global {
  interface Window {
    google: any;
    __gmapsCallbacks?: (() => void)[];
    __gmapsLoaded?: boolean;
    __gmapsLoading?: boolean;
  }
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

function loadGoogleMapsScript(onReady: () => void) {
  if (!API_KEY) {
    console.warn('VITE_GOOGLE_MAPS_API_KEY is not set — Google Places will not work.');
    return;
  }
  if (window.__gmapsLoaded) { onReady(); return; }
  window.__gmapsCallbacks = window.__gmapsCallbacks ?? [];
  window.__gmapsCallbacks.push(onReady);
  if (window.__gmapsLoading) return;
  window.__gmapsLoading = true;

  const script = document.createElement('script');
  // Use the new Maps JS API bootstrap with callback
  script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&v=weekly&callback=__gmapsInit`;
  script.async = true;
  (window as any).__gmapsInit = () => {
    window.__gmapsLoaded = true;
    (window.__gmapsCallbacks ?? []).forEach(cb => cb());
    window.__gmapsCallbacks = [];
  };
  document.head.appendChild(script);
}

export interface GooglePlace {
  name: string;
  lat: number;
  lng: number;
}

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

/** Get autocomplete suggestions using the new Places API */
export function getPlacePredictions(
  input: string,
  callback: (predictions: PlacePrediction[]) => void
) {
  if (!input.trim()) { callback([]); return; }

  loadGoogleMapsScript(async () => {
    try {
      const { AutocompleteSuggestion } = await window.google.maps.importLibrary('places');
      const request = {
        input,
        includedRegionCodes: ['in'],
      };
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      const predictions: PlacePrediction[] = suggestions.map((s: any) => {
        const pp = s.placePrediction;
        return {
          placeId: pp.placeId,
          description: pp.text?.text ?? pp.toString(),
          mainText: pp.structuredFormat?.mainText?.text ?? pp.text?.text ?? '',
          secondaryText: pp.structuredFormat?.secondaryText?.text ?? '',
        };
      });
      callback(predictions);
    } catch (e) {
      console.error('Places AutocompleteSuggestion error:', e);
      callback([]);
    }
  });
}

/** Resolve a placeId to lat/lng using the new Place class */
export function getPlaceDetails(
  placeId: string,
  callback: (place: GooglePlace | null) => void
) {
  loadGoogleMapsScript(async () => {
    try {
      const { Place } = await window.google.maps.importLibrary('places');
      const place = new Place({ id: placeId, requestedLanguage: 'en' });
      await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });
      const loc = place.location;
      if (!loc) { callback(null); return; }
      callback({
        name: place.displayName || place.formattedAddress || placeId,
        lat: loc.lat(),
        lng: loc.lng(),
      });
    } catch (e) {
      console.error('Place details error:', e);
      callback(null);
    }
  });
}
