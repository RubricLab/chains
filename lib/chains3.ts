import { z } from 'zod/v4'
import type {
	Definition,
	Node,
	NodeCompatability,
	ShapeOf,
	SupportedZodPrimitives,
	SupportedZodTypes
} from './types'

function shapeOf<Type extends SupportedZodTypes>(type: Type): ShapeOf<Type> {
	switch (type.def.type) {
		case 'string': {
			return 'string' as ShapeOf<Type>
		}
		case 'number': {
			return 'number' as ShapeOf<Type>
		}
		case 'boolean': {
			return 'boolean' as ShapeOf<Type>
		}
		case 'undefined': {
			return 'undefined' as ShapeOf<Type>
		}
		case 'null': {
			return 'null' as ShapeOf<Type>
		}
		case 'literal': {
			return `literal(${type.def.values[0]})` as ShapeOf<Type>
		}
		case 'enum': {
			return `enum(${Object.values(type.def.entries).join(',')})` as ShapeOf<Type>
		}
		case 'array': {
			return `array(${shapeOf(type.def.element)})` as ShapeOf<Type>
		}
		case 'object': {
			return `object(${Object.entries(type.def.shape)
				.map(([key, value]) => `${key}:${shapeOf(value)}`)
				.join(',')})` as ShapeOf<Type>
		}
		case 'union': {
			return `union(${type.def.options.map(option => shapeOf(option)).join(',')})` as ShapeOf<Type>
		}
	}
}

function getCompatableNodes({
	shape,
	definitions
}: {
	shape: SupportedZodTypes
	definitions: Record<
		string,
		{
			definition: ReturnType<typeof createNodeDefinition>
			output: SupportedZodTypes
		}
	>
}) {
	return Object.values(definitions)
		.filter(({ output }) => shapeOf(shape) === shapeOf(output))
		.map(({ definition }) => definition)
}

const compatabilities = new Map<ShapeOf<SupportedZodTypes>, SupportedZodTypes[]>()

function getCompatabilities(shape: SupportedZodTypes) {
	const compatable = compatabilities.get(shapeOf(shape))
	if (!compatable) {
		throw `No compatable entry point for ${shapeOf(shape)}`
	}
	function getInnerCompatabilities() {
		if (shape instanceof z.ZodArray || shape instanceof z.ZodObject || shape instanceof z.ZodUnion) {
			switch (shape.def.type) {
				case 'array':
					return z.array(getCompatabilities(shape.def.element))
				case 'object':
					return z.object(
						Object.fromEntries(
							Object.entries(shape.def.shape).map(([key, shape]) => [key, getCompatabilities(shape)])
						)
					)
				case 'union':
					return z.union(shape.def.options.map(getCompatabilities))
			}
		}
	}

	const innerCompatabilities = getInnerCompatabilities()

	return innerCompatabilities ? z.union([...compatable, innerCompatabilities]) : z.union(compatable)
}

// ex z.number(), z.object({node: 'add', input: z.object({a: z.number(), b: z.number()})})
function upsertCompatability({
	shape,
	node
}: { shape: SupportedZodTypes; node: ReturnType<typeof createNodeDefinition> }) {
	const current = compatabilities.get(shapeOf(shape))

	if (current) {
		if (!current.includes(node)) {
			compatabilities.set(shapeOf(shape), [...current, node])
			console.log('append')
		} else {
			console.log('nothing')
		}
	} else {
		compatabilities.set(shapeOf(shape), [node])
		console.log('set')
	}
}

function createNodeDefinition<
	Name extends string,
	Input extends Record<string, SupportedZodTypes>
>({
	name,
	input
}: {
	name: Name
	input: Input
}) {
	return z.strictObject({
		node: z.literal(name),
		get input() {
			return z.strictObject(
				Object.fromEntries(
					Object.entries(input).map(([key, shape]) => [key, z.union(getCompatabilities(shape))])
				)
			)
		}
	})
}

export function createChain<Nodes extends Record<string, Node>>(nodes: Nodes) {
	const definitions = Object.fromEntries(
		Object.entries(nodes).map(([name, { input, output }]) => [
			name,
			{
				definition: createNodeDefinition({ name, input }),
				output
			}
		])
	)

	for (const [_, node] of Object.entries(nodes)) {
		for (const [_, shape] of Object.entries(node.input)) {
			const compatableNodes = getCompatableNodes({ shape, definitions })
			for (const node of compatableNodes) {
				upsertCompatability({ shape, node })
			}

			function getInnerCompatableNodes() {
				if (
					shape instanceof z.ZodObject ||
					shape instanceof z.ZodArray ||
					shape instanceof z.ZodUnion
				) {
					switch (shape.def.type) {
						case 'array': {
							const element = shape.def.element

							const compatableNodes = getCompatableNodes({ shape: element, definitions })

							for (const node of compatableNodes) {
								upsertCompatability({ shape: element, node })
							}
							break
						}
						case 'object': {
							for (const field of Object.values(shape.def.shape)) {
								const compatableNodes = getCompatableNodes({ shape: field, definitions })

								for (const node of compatableNodes) {
									upsertCompatability({ shape: field, node })
								}
							}
							break
						}
						case 'union': {
							for (const option of shape.def.options) {
								const compatableNodes = getCompatableNodes({ shape: option, definitions })

								for (const node of compatableNodes) {
									upsertCompatability({ shape: option, node })
								}
							}
						}
					}
				}
			}

			getInnerCompatableNodes()
		}
	}

	const ccc = {}

	compatabilities.forEach((v, k) => {
		ccc[k as string] = z.union(v)
	})

	return { definitions, compatabilities: ccc }
}

const test = createChain({
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
	parseInt: {
		input: {
			string: z.string()
		},
		output: z.number()
	}
})

const registry = z.registry<{ id: string }>()

Object.values(test.definitions).map(d => {
	d.definition.register(registry, { id: d.definition.def.shape.node.def.values[0] })
})

Object.entries(test.compatabilities).map(([k, v]) => {
	v.register(registry, { id: k })
})

console.dir(
	z.toJSONSchema(z.union(Object.values(test.definitions).map(({ definition }) => definition)), {
		metadata: registry
	}),
	{
		depth: null
	}
)
