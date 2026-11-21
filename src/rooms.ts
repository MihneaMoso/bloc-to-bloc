/** Shared room/grid geometry for the 3D world and the 2D fallback. */
export const FLOORS = 4;
export const ROOMS_PER_FLOOR = 8;
export const FLOOR_HEIGHT = 3.3;
export const GROUND_Y = 0.55;
export const ROOM_W = 5.4;
export const ROOM_D = 5.4;
export const CELL = 1;
export const GRID = 5; // 5 x 5 cells per room

export interface RoomDef {
  id: number;
  floor: number;
  index: number;
  cx: number;
  cz: number;
  y: number;
  label: string;
}

const XS = [-9, -3, 3, 9];
const ZS = [-4.6, 4.6];

export const ROOMS: RoomDef[] = Array.from({ length: FLOORS * ROOMS_PER_FLOOR }, (_, id) => {
  const floor = Math.floor(id / ROOMS_PER_FLOOR);
  const index = id % ROOMS_PER_FLOOR;
  const col = index % 4;
  const row = Math.floor(index / 4);
  return {
    id, floor, index,
    cx: XS[col], cz: ZS[row],
    y: GROUND_Y + floor * FLOOR_HEIGHT,
    label: `E${floor + 1}-${index + 1}`,
  };
});

export function floorY(floor: number): number {
  return GROUND_Y + floor * FLOOR_HEIGHT;
}

/** Cell offsets within a room, centred on the room. */
export const CELL_OFFSETS = Array.from({ length: GRID * GRID }, (_, i) => ({
  x: (i % GRID) - (GRID - 1) / 2,
  z: Math.floor(i / GRID) - (GRID - 1) / 2,
}));

export function cellKey(roomId: number, cellX: number, cellZ: number): string {
  return `${roomId}:${cellX}:${cellZ}`;
}

export function cellWorld(room: RoomDef, cellX: number, cellZ: number): { x: number; y: number; z: number } {
  return { x: room.cx + cellX * CELL, y: room.y, z: room.cz + cellZ * CELL };
}

export function findRoom(roomId: number): RoomDef | undefined {
  return ROOMS.find((r) => r.id === roomId);
}
