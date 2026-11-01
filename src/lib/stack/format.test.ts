import { describe, expect, it } from 'vite-plus/test';
import { formatCost, formatIntelligence, formatPricePerM } from './format';

describe('formatPricePerM', () => {
	it('renders an en dash when the price is unpublished', () => {
		expect(formatPricePerM(null)).toBe('—');
	});

	it('always shows at least two decimals', () => {
		expect(formatPricePerM(2.2)).toBe('$2.20');
		expect(formatPricePerM(10)).toBe('$10.00');
		expect(formatPricePerM(1.75)).toBe('$1.75');
	});

	it('keeps up to three decimals for sub-cent prices', () => {
		expect(formatPricePerM(0.011)).toBe('$0.011');
		expect(formatPricePerM(0.275)).toBe('$0.275');
		expect(formatPricePerM(0.1)).toBe('$0.10');
	});

	it('formats zero as a zero price', () => {
		expect(formatPricePerM(0)).toBe('$0.00');
	});
});

describe('formatCost', () => {
	it('renders zero as $0.00', () => {
		expect(formatCost(0)).toBe('$0.00');
	});

	it('renders positive sub-cent costs as <$0.01', () => {
		expect(formatCost(0.004)).toBe('<$0.01');
		expect(formatCost(0.0099)).toBe('<$0.01');
	});

	it('renders the boundary and above with two decimals', () => {
		expect(formatCost(0.01)).toBe('$0.01');
		expect(formatCost(0.0380225)).toBe('$0.04');
		expect(formatCost(3.80225)).toBe('$3.80');
		expect(formatCost(120)).toBe('$120.00');
	});
});

describe('formatIntelligence', () => {
	it('renders an en dash when the index is unpublished', () => {
		expect(formatIntelligence(null)).toBe('—');
	});

	it('renders one decimal place', () => {
		expect(formatIntelligence(54.2)).toBe('54.2');
		expect(formatIntelligence(27.8)).toBe('27.8');
		expect(formatIntelligence(36.24)).toBe('36.2');
		expect(formatIntelligence(27.84)).toBe('27.8');
	});
});
