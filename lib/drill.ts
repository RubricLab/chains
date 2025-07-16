import type { z } from 'zod/v4'
import type { Node } from '../lib2/types'

export function createDrill<Nodes extends Record<string, Node>>(_nodes: Nodes) {
	async function drill(
		payload: unknown,
		getExecutor: <Key extends keyof Nodes>(
			key: Key
		) => (input: z.infer<Nodes[Key]['input']>) => Promise<z.infer<Nodes[Key]['output']>>
	): Promise<unknown> {
		if (Array.isArray(payload)) {
			return await Promise.all(payload.map(async element => await drill(element, getExecutor)))
		}
		if (payload instanceof Object) {
			if ('node' in payload && 'input' in payload) {
				const node = payload.node as keyof Nodes
				return getExecutor(payload.node as keyof Nodes)(
					(await drill(payload.input, getExecutor)) as z.infer<Nodes[typeof node]['input']>
				)
			}

			return Object.fromEntries(
				await Promise.all(
					Object.entries(payload).map(async ([key, field]) => [key, await drill(field, getExecutor)])
				)
			)
		}

		return payload
	}

	return { drill }
}
