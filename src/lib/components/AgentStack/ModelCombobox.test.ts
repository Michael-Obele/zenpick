import { describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'svelte/server';
import ModelCombobox from './ModelCombobox.svelte';
import type { StackModel, StackPricing } from '$lib/stack/plans';

const SONNET: StackPricing = {
	inputPricePerM: 2,
	outputPricePerM: 10,
	cachedReadPerM: 0.2
};
const LUNA: StackPricing = {
	inputPricePerM: 0.1,
	outputPricePerM: 0.5,
	cachedReadPerM: 0.01
};

function model(
	id: string,
	name: string,
	provider: string,
	pricing: StackPricing,
	intelligence: number | null
): StackModel {
	return { id, name, provider, pricing, contextWindow: 200_000, intelligence };
}

const models = [
	model('claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic', SONNET, 45),
	model('gpt-6-luna', 'GPT-6 Luna', 'OpenAI', LUNA, 27.8)
];

/** SSR body with hydration comments stripped and whitespace collapsed. */
function text(): string {
	return render(ModelCombobox, {
		props: {
			id: 'pair-main',
			label: 'Main agent',
			models,
			value: models[0],
			onPick: () => {}
		}
	})
		.body.replaceAll(/<!--[\s\S]*?-->/g, '')
		.replace(/\s+/g, ' ');
}

describe('ModelCombobox', () => {
	it('renders a visible label bound to the trigger', () => {
		const body = text();

		expect(body).toContain('<label for="pair-main"');
		expect(body).toContain('>Main agent</label>');
		expect(body).toContain('id="pair-main"');
	});

	it('leaves the accessible name to the label and visible model name', () => {
		const body = text();

		expect(body).toMatch(/aria-haspopup="dialog"/);
		expect(body).toMatch(/aria-expanded="false"/);
		expect(body).not.toMatch(/role="combobox"/);
		expect(body).not.toMatch(/aria-label="Main agent"/);
		expect(body).toContain('Claude Sonnet 5.5');
	});

	it('does not pick a model on render', () => {
		const onPick = vi.fn();
		render(ModelCombobox, {
			props: {
				id: 'pair-sub',
				label: 'Sub-agents',
				models,
				value: null,
				onPick
			}
		});

		expect(onPick).not.toHaveBeenCalled();
	});
});
