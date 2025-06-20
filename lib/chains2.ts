import { z } from 'zod/v4'
import type { Definition, Node, NodeCompatability, ShapeOf, SupportedZodTypes } from './types'

function shapeOf<T extends SupportedZodTypes>(type: T) {
	type S = ShapeOf<T>
	switch (type.def.type) {
		case 'string': {
			return 'string' as S
		}
		case 'number': {
			return 'number' as S
		}
		case 'boolean': {
			return 'boolean' as S
		}
		case 'undefined': {
			return 'undefined' as S
		}
		case 'null': {
			return 'null' as S
		}
		case 'literal': {
			return `literal(${type.def.values[0]})` as S
		}
		case 'enum': {
			return `enum(${Object.values(type.def.entries).join(',')})` as S
		}
		case 'array': {
			return `array(${shapeOf(type.def.element)})` as S
		}
		case 'object': {
			return `object(${Object.entries(type.def.shape)
				.map(([key, value]) => `${key}:${shapeOf(value)}`)
				.join(',')})` as S
		}
		case 'union': {
			return `union(${type.def.options.map(option => shapeOf(option)).join(',')})` as S
		}
	}
}

// Simple enums
const Status = z.enum(['active', 'inactive', 'pending'])
const Role = z.enum(['user', 'admin', 'guest'])
const Color = z.enum(['red', 'blue', 'green', 'yellow'])

const SimpleSchema = z.object({
	// Basic primitives
	id: z.number(),
	name: z.string(),
	isEnabled: z.boolean(),

	// Enum
	status: Status,

	// Arrays of primitives
	tags: z.array(z.string()),
	scores: z.array(z.number()),
	flags: z.array(z.boolean()),

	// Union of primitives
	value: z.union([z.string(), z.number(), z.boolean()]),

	// Union with null/undefined
	optional: z.union([z.string(), z.null(), z.undefined()]),

	// Literal values
	type: z.literal('user'),
	version: z.union([z.literal('1'), z.literal('2'), z.literal('3')]),

	// Array of enums
	roles: z.array(Role),

	// Union of arrays
	data: z.union([z.array(z.string()), z.array(z.number())]),

	// Complex union with literals
	config: z.union([z.literal('auto'), z.literal('manual'), z.boolean(), z.number()]),

	// Nested object with primitives
	settings: z.object({
		theme: Color,
		count: z.number(),
		enabled: z.boolean(),
		items: z.array(z.string()),
		mode: z.union([z.literal('light'), z.literal('dark'), z.null()])
	}),

	// Array of simple objects
	entries: z.array(
		z.object({
			key: z.string(),
			value: z.union([z.string(), z.number()]),
			active: z.boolean()
		})
	),

	// Union of different structures
	result: z.union([
		z.string(),
		z.array(z.string()),
		z.object({
			success: z.boolean(),
			message: z.string()
		})
	])
})

console.log(shapeOf(z.string()))
console.log(shapeOf(z.number()))
console.log(shapeOf(z.boolean()))
console.log(shapeOf(z.undefined()))
console.log(shapeOf(z.null()))
console.log(shapeOf(z.literal('test')))
console.log(shapeOf(z.enum(['test', 'test2'])))
console.log(shapeOf(SimpleSchema))

const complex = function getNodeCompatabilities<
	Type extends SupportedZodTypes,
	Definitions extends Record<string, Definition>
>({
	type,
	definitions
}: {
	type: Type
	definitions: Definitions
}) {
	const nodeCompatabilities = Object.values(definitions)
		.filter(({ output }) => {
			return JSON.stringify(shapeOf(output)) === JSON.stringify(shapeOf(type))
		})
		.map(({ definition }) => definition)

	return nodeCompatabilities
}

export function createChain<Nodes extends Record<string, Node>>(nodes: Nodes) {
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
		return z.object({
			node: z.literal(name),
			input: z.object(
				Object.defineProperties(
					{},
					Object.fromEntries(
						Object.keys(input).map(key => [
							key,
							{
								enumerable: true,
								configurable: false,
								get() {
									return compatabilities[name]?.[key]?.schema
								}
							}
						])
					)
				)
			)
		})
	}

	const definitions = Object.fromEntries(
		Object.entries(nodes).map(([name, node]) => [
			name,
			{
				definition: createNodeDefinition({ name, input: node.input }),
				output: node.output
			}
		])
	) as {
		[K in keyof Nodes]: Definition<K & string, Nodes[K]['input'], Nodes>
	}

	const compatabilities = Object.fromEntries(
		Object.entries(nodes).map(([name, node]) => {
			return [
				name,
				Object.fromEntries(
					Object.entries(node.input).map(([key, arg]) => {
						return [
							key,
							{
								shape: shapeOf(arg),
								schema: z.union(getNodeCompatabilities({ type: arg, definitions }))
							}
						]
					})
				)
			]
		})
	) as {
		[K in keyof Nodes]: {
			[I in keyof Nodes[K]['input']]: {
				shape: ShapeOf<Nodes[K]['input'][I]>
				schema: z.ZodUnion<NodeCompatability<Nodes[K]['input'][I], Nodes>>
			}
		}
	}
}
