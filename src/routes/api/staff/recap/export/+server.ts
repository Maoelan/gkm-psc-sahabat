import { buildRecapWorkbook } from '../../../../../lib/server/export';
import { getRecapExportRows } from '../../../../../lib/server/reports';
import { requireStaffApi } from '../../../../../lib/server/staff-api';

export async function GET({ cookies, locals }) {
	const staff = await requireStaffApi(cookies, ['bidan_pic', 'admin']);
	if (staff instanceof Response) return staff;
	try {
		const rows = await getRecapExportRows(staff, locals.requestId);
		const workbook = buildRecapWorkbook(rows);
		return new Response(workbook.bytes as BodyInit, {
			headers: {
				'Content-Type': workbook.contentType,
				'Content-Disposition': `attachment; filename="${workbook.filename}"`,
				'Cache-Control': 'no-store'
			}
		});
	} catch {
		return new Response('Rekap tidak dapat diekspor.', {
			status: 503,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' }
		});
	}
}
