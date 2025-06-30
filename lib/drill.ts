import type { z } from 'zod/v4'
import type { Node } from './types'

type InferredInput<Input extends Node['input']> = { [K in keyof Input]: z.infer<Input[K]> }

type Execute<Input extends Node['input'], Output extends Node['output']> = (
	input: InferredInput<Input>
) => Promise<z.infer<Output>>

export function createDrill<Nodes extends Record<string, Node>>(_nodes: Nodes) {
	async function drill(
		payload: unknown,
		getExecutor: <NodeKey extends keyof Nodes>(
			key: NodeKey
		) => Execute<Nodes[NodeKey]['input'], Nodes[NodeKey]['output']>
	): Promise<unknown> {
		if (Array.isArray(payload)) {
			return await Promise.all(payload.map(async element => await drill(element, getExecutor)))
		}
		if (payload instanceof Object) {
			if ('node' in payload && 'input' in payload) {
				const node = payload.node as keyof Nodes
				return getExecutor(payload.node as keyof Nodes)(
					(await drill(payload.input, getExecutor)) as InferredInput<Nodes[typeof node]['input']>
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
