import type { Node } from '@rubriclab/shapes'
import type { z } from 'zod/v4'
import type { $ZodType, $ZodTypes } from 'zod/v4/core'

type GetExecutor<Nodes extends Record<string, Node>> = <Key extends keyof Nodes>(
	key: Key
) => (input: z.infer<Nodes[Key]['input']>) => Promise<z.infer<Nodes[Key]['output']>>

export function createDrill<Nodes extends Record<string, Node>>(nodes: Nodes) {
	async function drill<Node extends keyof Nodes>(
		{
			node,
			input
		}: {
			node: Node
			input: unknown
		},
		getExecutor: GetExecutor<Nodes>
	): Promise<z.infer<Nodes[Node]['output']>> {
		const nodeMatch = nodes[node] ?? (undefined as never)

		return getExecutor(node as keyof Nodes)(
			(await _drill(input, nodeMatch.input)) as z.infer<Nodes[typeof node]['input']>
		)

		async function _drill(
			payload: unknown,
			shape: $ZodType,
			context?: Record<string, unknown>
		): Promise<unknown> {
			if (typeof payload === 'string' && payload.startsWith('$$.') && context) {
				if (payload in context) {
					return context[payload]
				}
			}
			const def = (shape as $ZodTypes)._zod.def
			if (def.type === 'custom' && def.extended.type === 'scoped') {
				const { inner } = def.extended
				return async (
					context: {
						[K in keyof typeof def.extended.scope.context]: z.infer<
							(typeof def.extended.scope.context)[K]
						>
					}
				) => await _drill(payload, inner, context)
			}
			if (payload instanceof Object && 'node' in payload && 'input' in payload) {
				const nodeMatch = nodes[payload.node as keyof Nodes] ?? (undefined as never)
				return getExecutor(payload.node as keyof Nodes)(
					(await _drill(payload.input, nodeMatch.input, context)) as z.infer<(typeof nodeMatch)['input']>
				)
			}
			switch (def.type) {
				case 'array': {
					if (!Array.isArray(payload)) {
						throw 'bad array'
					}

					return await Promise.all(
						payload.map(async element => await _drill(element, def.element, context))
					)
				}
				case 'object': {
					if (!(payload instanceof Object)) throw 'bad object'
					return Object.fromEntries(
						await Promise.all(
							Object.entries(payload).map(async ([key, field]) => {
								return [key, await _drill(field, def.shape[key] ?? (undefined as never), context)]
							})
						)
					)
				}
				default: {
					return payload
				}
			}
		}
	}

	return { drill }
}
