export type XlsxCell = string | number | null | undefined;

export type XlsxSheet = {
	name: string;
	title: string;
	note: string;
	headers: string[];
	rows: XlsxCell[][];
	widths?: number[];
};

export const XLSX_MIME_TYPE =
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const textEncoder = new TextEncoder();

function escapeXml(value: string) {
	return value
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function columnName(index: number) {
	let value = index + 1;
	let name = '';
	while (value > 0) {
		const remainder = (value - 1) % 26;
		name = String.fromCharCode(65 + remainder) + name;
		value = Math.floor((value - 1) / 26);
	}
	return name;
}

function inlineStringCell(reference: string, value: string, style: number) {
	return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function cellXml(reference: string, value: XlsxCell, style: number) {
	if (value === null || value === undefined || value === '') {
		return `<c r="${reference}" s="${style}"/>`;
	}
	if (typeof value === 'number' && Number.isFinite(value)) {
		return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
	}
	return inlineStringCell(reference, String(value), style);
}

function sheetXml(sheet: XlsxSheet) {
	const columnCount = Math.max(sheet.headers.length, 1);
	const lastColumn = columnName(columnCount - 1);
	const lastRow = 4 + sheet.rows.length;
	const dimension = `A1:${lastColumn}${lastRow}`;
	const widths = Array.from(
		{ length: columnCount },
		(_, index) => Math.min(42, Math.max(10, sheet.widths?.[index] ?? 16))
	);

	const columns = widths
		.map(
			(width, index) =>
				`<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
		)
		.join('');

	const headerRow = `<row r="4" ht="32" customHeight="1">${sheet.headers
		.map((header, index) => inlineStringCell(`${columnName(index)}4`, header, 1))
		.join('')}</row>`;

	const dataRows = sheet.rows
		.map((row, rowIndex) => {
			const rowNumber = rowIndex + 5;
			const cells = Array.from({ length: columnCount }, (_, columnIndex) =>
				cellXml(`${columnName(columnIndex)}${rowNumber}`, row[columnIndex], 0)
			).join('');
			return `<row r="${rowNumber}">${cells}</row>`;
		})
		.join('');

	const merges =
		columnCount > 1
			? `<mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells>`
			: '';

	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="${dimension}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${columns}</cols>
<sheetData>
<row r="1" ht="28" customHeight="1">${inlineStringCell('A1', sheet.title, 2)}</row>
<row r="2" ht="30" customHeight="1">${inlineStringCell('A2', sheet.note, 3)}</row>
<row r="3"/>
${headerRow}
${dataRows}
</sheetData>
<autoFilter ref="A4:${lastColumn}${lastRow}"/>
${merges}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
}

function workbookXml(sheets: XlsxSheet[]) {
	const sheetEntries = sheets
		.map(
			(sheet, index) =>
				`<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
		)
		.join('');
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>
<sheets>${sheetEntries}</sheets>
<calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`;
}

function workbookRelsXml(sheets: XlsxSheet[]) {
	const sheetRels = sheets
		.map(
			(_, index) =>
				`<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
		)
		.join('');
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetRels}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function contentTypesXml(sheets: XlsxSheet[]) {
	const sheetOverrides = sheets
		.map(
			(_, index) =>
				`<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
		)
		.join('');
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheetOverrides}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="10"/><name val="Aptos"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FF07324B"/><name val="Aptos Display"/><family val="2"/></font>
<font><i/><sz val="9"/><color rgb="FF526678"/><name val="Aptos"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF07324B"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF7D7"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFCFDBDC"/></left><right style="thin"><color rgb="FFCFDBDC"/></right><top style="thin"><color rgb="FFCFDBDC"/></top><bottom style="thin"><color rgb="FFCFDBDC"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function corePropertiesXml() {
	const timestamp = new Date().toISOString();
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>LAPOR AMAN - Rekap laporan</dc:title>
<dc:creator>LAPOR AMAN</dc:creator>
<cp:lastModifiedBy>LAPOR AMAN</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`;
}

const appPropertiesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>LAPOR AMAN</Application>
<AppVersion>1.0</AppVersion>
</Properties>`;

const crcTable = (() => {
	const table = new Uint32Array(256);
	for (let index = 0; index < 256; index += 1) {
		let value = index;
		for (let bit = 0; bit < 8; bit += 1) {
			value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[index] = value >>> 0;
	}
	return table;
})();

function crc32(data: Uint8Array) {
	let crc = 0xffffffff;
	for (const byte of data) {
		crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: Uint8Array[]) {
	const total = parts.reduce((length, part) => length + part.length, 0);
	const output = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.length;
	}
	return output;
}

function zipStore(files: { name: string; data: string }[]) {
	const now = new Date();
	const dosTime =
		(now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
	const dosDate =
		((Math.max(1980, now.getFullYear()) - 1980) << 9) |
		((now.getMonth() + 1) << 5) |
		now.getDate();

	const localParts: Uint8Array[] = [];
	const centralParts: Uint8Array[] = [];
	let offset = 0;

	for (const file of files) {
		const nameBytes = textEncoder.encode(file.name);
		const data = textEncoder.encode(file.data);
		const checksum = crc32(data);

		const local = new Uint8Array(30 + nameBytes.length);
		const localView = new DataView(local.buffer);
		localView.setUint32(0, 0x04034b50, true);
		localView.setUint16(4, 20, true);
		localView.setUint16(6, 0x0800, true);
		localView.setUint16(8, 0, true);
		localView.setUint16(10, dosTime, true);
		localView.setUint16(12, dosDate, true);
		localView.setUint32(14, checksum, true);
		localView.setUint32(18, data.length, true);
		localView.setUint32(22, data.length, true);
		localView.setUint16(26, nameBytes.length, true);
		localView.setUint16(28, 0, true);
		local.set(nameBytes, 30);

		const central = new Uint8Array(46 + nameBytes.length);
		const centralView = new DataView(central.buffer);
		centralView.setUint32(0, 0x02014b50, true);
		centralView.setUint16(4, 20, true);
		centralView.setUint16(6, 20, true);
		centralView.setUint16(8, 0x0800, true);
		centralView.setUint16(10, 0, true);
		centralView.setUint16(12, dosTime, true);
		centralView.setUint16(14, dosDate, true);
		centralView.setUint32(16, checksum, true);
		centralView.setUint32(20, data.length, true);
		centralView.setUint32(24, data.length, true);
		centralView.setUint16(28, nameBytes.length, true);
		centralView.setUint16(30, 0, true);
		centralView.setUint16(32, 0, true);
		centralView.setUint16(34, 0, true);
		centralView.setUint16(36, 0, true);
		centralView.setUint32(38, 0, true);
		centralView.setUint32(42, offset, true);
		central.set(nameBytes, 46);

		localParts.push(local, data);
		centralParts.push(central);
		offset += local.length + data.length;
	}

	const centralDirectory = concatBytes(centralParts);
	const end = new Uint8Array(22);
	const endView = new DataView(end.buffer);
	endView.setUint32(0, 0x06054b50, true);
	endView.setUint16(4, 0, true);
	endView.setUint16(6, 0, true);
	endView.setUint16(8, files.length, true);
	endView.setUint16(10, files.length, true);
	endView.setUint32(12, centralDirectory.length, true);
	endView.setUint32(16, offset, true);
	endView.setUint16(20, 0, true);

	return concatBytes([...localParts, centralDirectory, end]);
}

export function createXlsx(sheets: XlsxSheet[]) {
	if (sheets.length === 0) throw new Error('Minimal satu sheet diperlukan.');
	const files = [
		{ name: '[Content_Types].xml', data: contentTypesXml(sheets) },
		{ name: '_rels/.rels', data: rootRelsXml },
		{ name: 'docProps/app.xml', data: appPropertiesXml },
		{ name: 'docProps/core.xml', data: corePropertiesXml() },
		{ name: 'xl/workbook.xml', data: workbookXml(sheets) },
		{ name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml(sheets) },
		{ name: 'xl/styles.xml', data: stylesXml },
		...sheets.map((sheet, index) => ({
			name: `xl/worksheets/sheet${index + 1}.xml`,
			data: sheetXml(sheet)
		}))
	];
	return zipStore(files);
}
