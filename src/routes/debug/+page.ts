import { getModels, getFrontierCandidates } from '$lib/remote/models.remote';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
	const [models, frontierSnapshot] = await Promise.all([getModels(), getFrontierCandidates()]);
	return { models, frontierSnapshot };
};
