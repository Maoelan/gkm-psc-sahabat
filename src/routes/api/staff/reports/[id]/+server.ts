import { json } from "@sveltejs/kit";
import {
  getOfficerReport,
  ReportServiceError,
} from "../../../../../lib/server/reports";
import {
  requireStaffApi,
  requireCsrf,
} from "../../../../../lib/server/staff-api";
import {
  mutate,
  seal,
  api,
  BackendError,
} from "../../../../../lib/server/convex";
import { z } from "zod";

export async function DELETE({ cookies, params, request, locals }) {
  const staff = await requireStaffApi(cookies, ["admin"]);
  if (staff instanceof Response) return staff;
  const rejected = requireCsrf(request, staff);
  if (rejected) return rejected;
  const payload = await request.json().catch(() => null);
  const parsed = z
    .object({
      confirmation: z.string().max(80),
      reason: z.string().trim().min(3).max(500),
    })
    .safeParse(payload);
  if (!parsed.success)
    return json(
      {
        error: "Isi kode laporan dan alasan penghapusan sedikitnya 3 karakter.",
      },
      { status: 422 },
    );
  try {
    return json(
      await mutate(api.reports.remove, {
        staffSessionId: staff.sessionId,
        referenceCode: params.id,
        confirmation: parsed.data.confirmation,
        reason: seal(parsed.data.reason, "deletion_reason"),
        requestId: locals.requestId,
      }),
    );
  } catch (error) {
    return json(
      {
        error:
          error instanceof BackendError
            ? error.message
            : "Laporan belum dapat dihapus.",
      },
      { status: error instanceof BackendError ? error.status : 503 },
    );
  }
}

export async function GET({ cookies, params }) {
  const staff = await requireStaffApi(cookies, ["petugas", "admin"]);
  if (staff instanceof Response) return staff;
  try {
    return json({
      report: await getOfficerReport(staff, params.id),
    });
  } catch (error) {
    if (error instanceof ReportServiceError) {
      return json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return json({ error: "Laporan tidak dapat dimuat." }, { status: 503 });
  }
}
