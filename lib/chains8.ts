import { z } from 'zod/v4'
import type { Node, NodeDefinition, SupportedZodTypes } from './types2'

function shapeOf<Type extends SupportedZodTypes>(type: Type) {
	switch (type.def.type) {
		case 'string': {
			return 'string'
		}
		case 'number': {
			return 'number'
		}
		case 'boolean': {
			return 'boolean'
		}
		case 'undefined': {
			return 'undefined'
		}
		case 'null': {
			return 'null'
		}
		case 'literal': {
			return `literal(${type.def.values[0]})`
		}
		case 'enum': {
			return `enum(${Object.values(type.def.entries).join(',')})`
		}
		case 'array': {
			return `array(${shapeOf(type.def.element)})`
		}
		case 'object': {
			return `object(${Object.entries(type.def.shape)
				.map(([key, value]) => `${key}:${shapeOf(value)}`)
				.join(',')})`
		}
		case 'union': {
			return `union(${type.def.options.map(option => shapeOf(option)).join(',')})`
		}
	}
}

type AdditionalCompatability = { type: SupportedZodTypes; compatibiliies: SupportedZodTypes[] }

export function createChain<
	Nodes extends Record<string, Node>,
	Strict extends boolean = false,
	AdditionalCompatabilities extends AdditionalCompatability[] = []
>(
	nodes: Nodes,
	config?: { strict?: Strict; additionalCompatabilities?: AdditionalCompatabilities }
) {
	const strict = config?.strict || false
	const additionalCompatabilities = config?.additionalCompatabilities || []

	function createDefinition<Name extends string, Input extends Node['input']>({
		name,
		input
	}: { name: Name; input: Input }) {
		return z.strictObject({
			node: z.literal(name),
			get input() {
				return z.strictObject(
					Object.fromEntries(
						Object.entries(input).map(([key, type]) => {
							return [key, getCompatible(type)]
						})
					)
				)
			}
		})
	}

	const definitions = Object.fromEntries(
		Object.entries(nodes).map(([name, { input, output }]) => [
			name,
			{
				definition: createDefinition({ name, input }),
				output
			}
		])
	) as {
		[K in keyof Nodes]: {
			definition: NodeDefinition<K & string, Nodes[K]['input'], Nodes, Strict>
			output: Nodes[K]['output']
		}
	}

	const compatibilities: Record<string, SupportedZodTypes | z.ZodLazy<SupportedZodTypes>> = {}

	function getCompatible<Type extends SupportedZodTypes>(type: Type) {
		return compatibilities[shapeOf(type)]
	}

	function getAdditionalCompatabilities(type: SupportedZodTypes) {
		return (
			additionalCompatabilities.find(
				additionalCompatability => shapeOf(additionalCompatability.type) === shapeOf(type)
			)?.compatibiliies || []
		)
	}

	function getCompatibleDefinitions(type: SupportedZodTypes) {
		return Object.values(definitions)
			.filter(({ output }) => shapeOf(output) === shapeOf(type))
			.map(({ definition }) => definition)
	}

	function getInnerCompatabilities(type: SupportedZodTypes) {
		if (type.def.type === 'array') return [z.array(getCompatible(type.def.element))]
		if (type.def.type === 'object')
			return [
				z.strictObject(
					Object.fromEntries(
						Object.entries(type.def.shape).map(([key, field]) => [key, getCompatible(field)])
					)
				)
			]

		if (type.def.type === 'union') return [z.union(type.def.options.map(getCompatible))]
		return []
	}

	function getSchema(type: SupportedZodTypes) {
		const branches = [
			...getCompatibleDefinitions(type),
			...getInnerCompatabilities(type),
			...getAdditionalCompatabilities(type),
			...(strict ? [] : [type])
		]

		if (branches.length === 0) throw `No node produces shape "${shapeOf(type)}".`
		if (branches.length === 1) return branches[0]

		return z.union(branches)
	}

	function walk(type: SupportedZodTypes) {
		compatibilities[shapeOf(type)] = z.lazy(() => getSchema(type))

		if (type instanceof z.ZodArray) walk(type.def.element)
		if (type instanceof z.ZodObject) for (const field of Object.values(type.def.shape)) walk(field)
		if (type instanceof z.ZodUnion) for (const option of type.def.options) walk(option)
	}

	for (const { input, output } of Object.values(nodes)) {
		walk(output)
		for (const field of Object.values(input)) walk(field)
	}

	return {
		definitions,
		compatibilities
	}
}

const test = createChain(
	{
		add: {
			input: {
				number1: z.number(),
				number2: z.number()
			},
			output: z.number()
		},
		subtract: {
			input: {
				number1: z.number(),
				number2: z.number()
			},
			output: z.number()
		},
		stringify: {
			input: {
				number: z.number()
			},
			output: z.string()
		},
		concatenate: {
			input: {
				strings: z.array(z.string())
			},
			output: z.string()
		},
		split: {
			input: {
				string: z.string()
			},
			output: z.array(z.string())
		},
		parseInt: {
			input: {
				string: z.string()
			},
			output: z.number()
		},
		produceString: {
			input: {},
			output: z.string()
		},
		log: {
			input: {
				thing: z.array(
					z.array(
						z.array(
							z.array(
								z.array(
									z.array(
										z.array(
											z.array(
												z.array(
													z.array(
														z.array(
															z.array(z.array(z.array(z.array(z.array(z.array(z.array(z.array(z.string()))))))))
														)
													)
												)
											)
										)
									)
								)
							)
						)
					)
				)
			},
			output: z.string()
		}
	},
	{
		strict: true,
		additionalCompatabilities: [
			{
				type: z.number(),
				compatibiliies: [z.literal('NUMBERINPUT')]
			}
		]
	}
)
