import { z } from 'zod/v4'
import type { Node, NodeCompatability, NodeDefinition, SupportedZodTypes } from './types2'

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
	const ShapeCache = new Map<string, SupportedZodTypes>()
	const producers: Record<string, ReturnType<typeof createDefinition>[]> = {}

	function pushProducer({
		output,
		definition
	}: { output: SupportedZodTypes; definition: ReturnType<typeof createDefinition> }) {
		const key = shapeOf(output)
		producers[key] = producers[key] ?? []
		producers[key].push(definition)
	}

	function walk(type: SupportedZodTypes): void {
		if (!ShapeCache.has(shapeOf(type))) ShapeCache.set(shapeOf(type), type)

		if (type instanceof z.ZodArray) walk(type.def.element)
		if (type instanceof z.ZodObject) Object.values(type.def.shape).forEach(walk)
		if (type instanceof z.ZodUnion) type.def.options.forEach(walk)
	}

	function createDefinition<
		Name extends string,
		Input extends Node['input'],
		Nodes extends Record<string, Node>
	>({ name, input }: { name: Name; input: Input }): NodeDefinition<Name, Input, Nodes> {
		return z.strictObject({
			node: z.literal(name),
			get input() {
				return z.strictObject(
					Object.fromEntries(
						Object.entries(input).map(([key, type]) => {
							return [key, getCompatible(type)]
						})
					) as unknown as Record<keyof Input, z.ZodUnion<NodeCompatability<Input[keyof Input], Nodes>>>
				)
			}
		}) as unknown as NodeDefinition<Name, Input, Nodes>
	}

	const definitions = Object.fromEntries(
		Object.entries(nodes).map(([name, { input, output }]) => [
			name,
			{
				definition: createDefinition({ name, input }),
				input,
				output
			}
		])
	) as unknown as {
		[K in keyof Nodes]: {
			definition: ReturnType<typeof createDefinition<K & string, Nodes[K]['input'], Nodes>>
			input: Nodes[K]['input']
			output: Nodes[K]['output']
		}
	}

	for (const { definition, input, output } of Object.values(definitions)) {
		walk(output)
		for (const field of Object.values(input)) walk(field)
		pushProducer({ output, definition })
	}

	const compatibilities: Record<string, SupportedZodTypes> = {}

	function getCompatible(type: SupportedZodTypes) {
		return compatibilities[shapeOf(type)]
	}

	function getSchema(type: SupportedZodTypes) {
		const branches: SupportedZodTypes[] = producers[shapeOf(type)] ?? []

		if (type instanceof z.ZodArray) {
			branches.push(z.array(getCompatible(type.def.element)))
		}
		if (type instanceof z.ZodObject) {
			branches.push(
				z.strictObject(
					Object.fromEntries(
						Object.entries(type.def.shape).map(([key, field]) => [key, getCompatible(field)])
					)
				)
			)
		}
		if (type instanceof z.ZodUnion) {
			branches.push(z.union(type.def.options.map(getCompatible)))
		}

		return z.union(branches)
	}

	ShapeCache.forEach((type, key) => {
		compatibilities[key] = z.lazy(() => getSchema(type)) as unknown as SupportedZodTypes
	})

	return { definitions, compatibilities }
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
	},
	log: {
		input: {
			text: z.object({
				value: z.union([z.string(), z.number()]),
				thing: z.union([z.string(), z.number()])
			})
		},
		output: z.undefined()
	}
})

const registry = z.registry<{ id: string }>()

Object.values(test.definitions).map(d => {
	d.definition.register(registry, { id: d.definition.def.shape.node.def.values[0] })
})

Object.entries(test.compatibilities).map(([k, v]) => {
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
