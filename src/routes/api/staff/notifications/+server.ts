import { json } from "@sveltejs/kit";
import { requireStaffApi } from "../../../../lib/server/staff-api";
import { query, api } from "../../../../lib/server/convex";
export async function GET({ cookies }) {
  const staff = await requireStaffApi(cookies, ["admin", "petugas"]);
  if (staff instanceof Response) return staff;
  try {
    return json({
      reports: await query(api.reports.notifications, {
        staffSessionId: staff.sessionId,
      }),
    });
  } catch {
    return json({ error: "Notifikasi belum dapat dimuat." }, { status: 503 });
  }
}
