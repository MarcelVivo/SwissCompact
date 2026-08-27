// The only static artifact duplicated here is the 36 room-preset IDs
// (stable, low-drift, needed for the JSON schema enum). Human-readable
// labels/theme names are NOT duplicated — those are volatile/editorial and
// live only in src/ui/gastronomyShowroom.ts, flowing to the model fresh
// every request via the frontend's live getRoomManifest() call instead of a
// stale prompt-baked copy.
//
// Keep in sync with the RoomPreset union in
// src/ui/gastronomyShowroom.ts (search "export type RoomPreset").
export const SHOWROOM_ROOM_PRESET_IDS = [
  "takeaway",
  "restaurant",
  "cafe",
  "beautySalon",
  "barber",
  "physio",
  "cinema",
  "museum",
  "eventHall",
  "outdoorShop",
  "mountainStation",
  "fitnessCenter",
  "fashionStore",
  "electronicsStore",
  "shoppingMall",
  "corporateLobby",
  "corporateMeeting",
  "corporateCanteen",
  "hotelLobby",
  "spaWellness",
  "guestSuite",
  "stationTerminal",
  "trafficControl",
  "mobilityHub",
  "clinicReception",
  "waitingTreatment",
  "careCenter",
  "campusFoyer",
  "classroom",
  "libraryZone",
  "productionHall",
  "logisticsCenter",
  "industrialControl",
  "realEstateLounge",
  "modelApartment",
  "brandShowroom",
] as const;

export type ShowroomRoomPresetId = (typeof SHOWROOM_ROOM_PRESET_IDS)[number];

export function isShowroomRoomPresetId(value: unknown): value is ShowroomRoomPresetId {
  return typeof value === "string" && (SHOWROOM_ROOM_PRESET_IDS as readonly string[]).includes(value);
}
