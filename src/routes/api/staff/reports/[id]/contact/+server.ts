import { json } from "@sveltejs/kit";
import { requireStaffApi } from "../../../../../../lib/server/staff-api";
import {
  mutate,
  api,
  unseal,
  BackendError,
} from "../../../../../../lib/server/convex";
export async function GET({ cookies, params, locals }) {
  const staff = await requireStaffApi(cookies, ["admin", "petugas"]);
  if (staff instanceof Response) return staff;
  try {
    const contact = await mutate(api.reports.contact, {
      staffSessionId: staff.sessionId,
      referenceCode: params.id,
      requestId: locals.requestId,
    });
    return json({
      contact: contact ? unseal(contact, "contact_details") : null,
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof BackendError
            ? error.message
            : "Kontak belum dapat dibuka.",
      },
      { status: error instanceof BackendError ? error.status : 503 },
    );
  }
}
