import { z } from 'zod/v4'
import type {
	Definition,
	Node,
	NodeCompatability,
	ShapeOf,
	SupportedZodPrimitives,
	SupportedZodTypes
} from './types'

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

export function createChain<Nodes extends Record<string, Node>>(nodes: Nodes) {
	const Shapes = new Map<string, SupportedZodTypes[]>()

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
						Object.entries(input).map(([key, shape]) => {
							const compatable = compatabilities[shapeOf(shape)]
							if (!compatable) {
								throw `No entry point for shape "${shapeOf(shape)}". Ensure there is a node that outputs "${shapeOf(shape)}" or disable "strict mode"`
							}
							return [key, compatable]
						})
					)
				)
			}
		})
	}

	function upsertCompatability({
		shape,
		node
	}: {
		shape: SupportedZodTypes
		node: SupportedZodTypes | ReturnType<typeof createNodeDefinition>
	}) {
		const current = Shapes.get(shapeOf(shape))

		if (current) {
			if (!current.includes(node)) {
				Shapes.set(shapeOf(shape), [...current, node])
			}
		} else {
			Shapes.set(shapeOf(shape), [node])
		}
	}

	const definitions = Object.fromEntries(
		Object.entries(nodes).map(([name, { input, output }]) => [
			name,
			{
				definition: createNodeDefinition({ name, input }),
				output
			}
		])
	)

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

							for (const node of getCompatableNodes({ shape: element, definitions })) {
								upsertCompatability({ shape: element, node })
							}

							break
						}
						case 'object': {
							for (const field of Object.values(shape.def.shape)) {
								for (const node of getCompatableNodes({ shape: field, definitions })) {
									upsertCompatability({ shape: field, node })
								}
							}
							break
						}
						case 'union': {
							for (const option of shape.def.options) {
								for (const node of getCompatableNodes({ shape: option, definitions })) {
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

	const compatabilities = {}

	Shapes.forEach((v, k) => {
		compatabilities[k] = z.union(v)
	})

	return { definitions, compatabilities }
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
