import type { NightRecord } from "../inventory-repo";
import { type AllotmentEdit, editAllotment } from "./edit-allotment";
export function openAllotment(
  record: NightRecord,
  edit: AllotmentEdit,
  openedAt: number,
): NightRecord {
  return { ...editAllotment(record, edit), stopped: false, openedAt };
}
