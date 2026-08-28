import type {
  GastronomyShowroom,
  RoomConceptPatch,
  RoomConceptResult,
  RoomPreset,
  ShowroomAiManifest,
} from "./gastronomyShowroom";

type PresetSeed = readonly [RoomPreset, string, ShowroomAiManifest["presets"][number]["theme"], string];

const PRESET_SEEDS: readonly PresetSeed[] = [
  ["takeaway", "Take-away", "gastronomy", "Gastronomie"],
  ["restaurant", "Restaurant", "gastronomy", "Gastronomie"],
  ["cafe", "Café", "gastronomy", "Gastronomie"],
  ["beautySalon", "Beauty Salon & Kosmetik", "beauty", "Beauty & Personal Care"],
  ["barber", "Coiffeur & Barber Shop", "beauty", "Beauty & Personal Care"],
  ["physio", "Physiotherapie & Medizinische Massage", "beauty", "Beauty & Personal Care"],
  ["cinema", "Kino · Foyer & Eingangshalle", "culture", "Kultur & Events"],
  ["museum", "Museum", "culture", "Kultur & Events"],
  ["eventHall", "Konferenz- & Eventhalle", "culture", "Kultur & Events"],
  ["outdoorShop", "Sportgeschäft & Outdoor Shop", "sport", "Sport & Freizeit"],
  ["mountainStation", "Skigebiet & Bergbahn", "sport", "Sport & Freizeit"],
  ["fitnessCenter", "Premium Fitnesscenter", "sport", "Sport & Freizeit"],
  ["fashionStore", "Modegeschäft", "retail", "Retail & Shopping"],
  ["electronicsStore", "Elektronikfachmarkt", "retail", "Retail & Shopping"],
  ["shoppingMall", "Einkaufszentrum", "retail", "Retail & Shopping"],
  ["corporateLobby", "Empfang & Lobby", "corporate", "Corporate & Gebäude"],
  ["corporateMeeting", "Meeting & Collaboration", "corporate", "Corporate & Gebäude"],
  ["corporateCanteen", "Mitarbeitendenrestaurant", "corporate", "Corporate & Gebäude"],
  ["hotelLobby", "Hotellobby", "hospitality", "Hospitality & Wellness"],
  ["spaWellness", "Spa & Wellness", "hospitality", "Hospitality & Wellness"],
  ["guestSuite", "Gästezimmer & Suite", "hospitality", "Hospitality & Wellness"],
  ["stationTerminal", "Bahnhof & Terminal", "mobility", "Mobilität & Infrastruktur"],
  ["trafficControl", "Verkehrsleitzentrale", "mobility", "Mobilität & Infrastruktur"],
  ["mobilityHub", "Parkhaus & Mobilitätshub", "mobility", "Mobilität & Infrastruktur"],
  ["clinicReception", "Klinikempfang", "health", "Gesundheit & Pflege"],
  ["waitingTreatment", "Warte- & Behandlungsbereich", "health", "Gesundheit & Pflege"],
  ["careCenter", "Pflegezentrum", "health", "Gesundheit & Pflege"],
  ["campusFoyer", "Campus & Foyer", "education", "Bildung & Wissen"],
  ["classroom", "Unterrichtsraum", "education", "Bildung & Wissen"],
  ["libraryZone", "Bibliothek & Lernzone", "education", "Bildung & Wissen"],
  ["productionHall", "Produktionshalle", "industry", "Industrie & Logistik"],
  ["logisticsCenter", "Logistikzentrum", "industry", "Industrie & Logistik"],
  ["industrialControl", "Leitstand", "industry", "Industrie & Logistik"],
  ["realEstateLounge", "Immobilien-Lounge", "realestate", "Immobilien & Showrooms"],
  ["modelApartment", "Musterwohnung", "realestate", "Immobilien & Showrooms"],
  ["brandShowroom", "Marken- & Messe-Showroom", "realestate", "Immobilien & Showrooms"],
];

export interface LazyGastronomyShowroom extends GastronomyShowroom {
  load(): Promise<GastronomyShowroom | null>;
  isReady(): boolean;
}

const emptyConceptResult = (): RoomConceptResult => ({
  applied: false,
  degradedFurnishingIds: [],
  clampedFurnishingIds: [],
  degradedStructureKeys: [],
  clampedStructureKeys: [],
});

export function mountLazyGastronomyShowroom(): LazyGastronomyShowroom {
  let active: GastronomyShowroom | null = null;
  let loading: Promise<GastronomyShowroom | null> | null = null;
  let destroyed = false;
  let selectedPreset: RoomPreset = "restaurant";
  const queuedActions: Array<(showroom: GastronomyShowroom) => void> = [];
  const cleanups: Array<() => void> = [];

  const fallbackManifest = (preset = selectedPreset): ShowroomAiManifest => ({
    presets: PRESET_SEEDS.map(([id, label, theme, themeLabel]) => ({
      id,
      label,
      theme,
      themeLabel,
    })),
    selectedPreset: preset,
    furnishings: [],
    displayWalls: [],
    structureSlots: [],
  });

  const load = (): Promise<GastronomyShowroom | null> => {
    if (active) return Promise.resolve(active);
    if (destroyed) return Promise.resolve(null);
    if (!loading) {
      document.body.classList.add("is-showroom-module-loading");
      loading = import("./gastronomyShowroom")
        .then(({ mountGastronomyShowroom }) => {
          if (destroyed) return null;
          active = mountGastronomyShowroom();
          queuedActions.splice(0).forEach((action) => action(active!));
          return active;
        })
        .catch((error: unknown) => {
          console.error("SwissCompact showroom lazy load failed", error);
          loading = null;
          return null;
        })
        .finally(() => {
          document.body.classList.remove("is-showroom-module-loading");
        });
    }
    return loading;
  };

  const queue = (action: (showroom: GastronomyShowroom) => void): void => {
    if (active) {
      action(active);
      return;
    }
    queuedActions.push(action);
    void load();
  };

  const root = document.querySelector<HTMLElement>("[data-showroom]");
  if (root && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void load();
    }, { rootMargin: "700px 0px", threshold: 0.01 });
    observer.observe(root);
    cleanups.push(() => observer.disconnect());
  }

  const intentTargets = Array.from(document.querySelectorAll<HTMLElement>([
    "[data-showroom-funnel-trigger]",
    "[data-showroom-saved-rooms-open]",
    "[data-sales-assistant-trigger]",
    "[data-sales-assistant-open]",
  ].join(",")));
  const handleIntent = (): void => { void load(); };
  intentTargets.forEach((target) => {
    target.addEventListener("pointerenter", handleIntent, { passive: true });
    target.addEventListener("focusin", handleIntent, { passive: true });
    target.addEventListener("touchstart", handleIntent, { passive: true });
    cleanups.push(() => {
      target.removeEventListener("pointerenter", handleIntent);
      target.removeEventListener("focusin", handleIntent);
      target.removeEventListener("touchstart", handleIntent);
    });
  });

  return {
    load,
    isReady: () => Boolean(active),
    destroy() {
      destroyed = true;
      queuedActions.length = 0;
      cleanups.splice(0).forEach((cleanup) => cleanup());
      active?.destroy();
      active = null;
    },
    goToRoom(preset) {
      selectedPreset = preset;
      queue((showroom) => showroom.goToRoom(preset));
    },
    getRoomManifest(preset) {
      if (preset) selectedPreset = preset;
      return active?.getRoomManifest(preset) ?? fallbackManifest(preset);
    },
    applyRoomConcept(preset: RoomPreset, patch: RoomConceptPatch) {
      selectedPreset = preset;
      if (active) return active.applyRoomConcept(preset, patch);
      queue((showroom) => showroom.applyRoomConcept(preset, patch));
      return emptyConceptResult();
    },
  };
}
