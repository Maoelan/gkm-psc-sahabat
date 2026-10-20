import { db } from './db';
import type { ServiceMode } from '../service-mode';

type ScheduleRow = {
	weekday: number;
	opens_at: string;
	closes_at: string;
	timezone: string;
};

type ExceptionRow = {
	is_closed: boolean;
	opens_at: string | null;
	closes_at: string | null;
};

function zonedParts(date: Date, timeZone = 'Asia/Makassar') {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', {
			timeZone,
			weekday: 'short',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(date)
			.map((part) => [part.type, part.value])
	);
	const weekdayMap: Record<string, number> = {
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6,
		Sun: 7
	};
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		weekday: weekdayMap[parts.weekday ?? ''] ?? 0,
		minute: Number(parts.hour) * 60 + Number(parts.minute)
	};
}

function minutes(value: string) {
	const [hours, mins] = value.split(':').map(Number);
	return hours * 60 + mins;
}

/** Fungsi murni agar batas jadwal dapat diuji tanpa database. */
export function modeFromSchedule(
	minute: number,
	weekday: number,
	schedule: ScheduleRow | undefined,
	exception?: ExceptionRow
): ServiceMode {
	if (exception?.is_closed) return 'ai';
	if (exception?.opens_at && exception.closes_at) {
		return minute >= minutes(exception.opens_at) && minute < minutes(exception.closes_at)
			? 'operator'
			: 'ai';
	}
	if (!schedule) return 'ai';
	return minute >= minutes(schedule.opens_at) && minute < minutes(schedule.closes_at)
		? 'operator'
		: 'ai';
}

export async function getServiceModeAt(date = new Date()): Promise<ServiceMode> {
	const parts = zonedParts(date);
	try {
		const schedule = await db.query<ScheduleRow>(
			`SELECT weekday, opens_at::text, closes_at::text, timezone
			 FROM service_schedules
			 WHERE weekday = $1
			   AND effective_from <= $2
			   AND (effective_to IS NULL OR effective_to >= $2)
			 ORDER BY effective_from DESC
			 LIMIT 1`,
			[parts.weekday, parts.date]
		);
		const exception = await db.query<ExceptionRow>(
			`SELECT is_closed, opens_at::text, closes_at::text
			 FROM schedule_exceptions
			 WHERE date = $1`,
			[parts.date]
		);
		return modeFromSchedule(parts.minute, parts.weekday, schedule.rows[0], exception.rows[0]);
	} catch {
		return 'unavailable';
	}
}
