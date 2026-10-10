import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import {
	DEBUG_FORMATS,
	DEBUG_SECTION_IDS,
	debugSearchSchema,
	sectionLabel,
	type DebugSection
} from './sections';

describe('debugSearchSchema', () => {
	it('defaults to overview / html when params are absent', () => {
		const out = v.parse(debugSearchSchema, {});
		expect(out).toEqual({ section: 'overview', format: 'html' });
	});

	it('accepts every declared section and format', () => {
		for (const section of DEBUG_SECTION_IDS) {
			expect(v.parse(debugSearchSchema, { section }).section).toBe(section);
		}
		for (const format of DEBUG_FORMATS) {
			expect(v.parse(debugSearchSchema, { format }).format).toBe(format);
		}
	});

	it('falls back to the defaults for unknown values', () => {
		const out = v.parse(debugSearchSchema, { section: 'nope', format: 'xml' });
		expect(out).toEqual({ section: 'overview', format: 'html' });
	});

	it('keeps only the schema-defined keys (URL params are validated, not passed through)', () => {
		const out = v.parse(debugSearchSchema, { section: 'pricing', format: 'md' });
		expect(out).toEqual({ section: 'pricing', format: 'md' });
	});
});

describe('sectionLabel', () => {
	it('returns the human label for a known section', () => {
		expect(sectionLabel('overview')).toBe('Models Overview');
		expect(sectionLabel('matching')).toBe('Matching & Coverage');
	});

	it('falls back to the id for an unknown section', () => {
		expect(sectionLabel('bogus' as DebugSection)).toBe('bogus');
	});
});
