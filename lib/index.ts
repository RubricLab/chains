import { z } from 'zod/v4'

type SupportedZodTypes =
	| z.ZodString
	| z.ZodNumber
	| z.ZodBoolean
	| z.ZodUndefined
	| z.ZodVoid
	| z.ZodObject<Record<string, SupportedZodTypes>>
	| z.ZodArray<SupportedZodTypes>

type GenericNode = {
	input: Record<string, SupportedZodTypes>
	output: SupportedZodTypes
}

type ShapeOf<T extends SupportedZodTypes> = T extends z.ZodString
	? 'string'
	: T extends z.ZodNumber
		? 'number'
		: T extends z.ZodBoolean
			? 'boolean'
			: T extends z.ZodUndefined
				? 'undefined'
				: T extends z.ZodVoid
					? 'void'
					: T extends z.ZodObject<infer InnerShape extends Record<string, SupportedZodTypes>>
						? { [K in keyof InnerShape]: ShapeOf<InnerShape[K]> }
						: T extends z.ZodArray<infer InnerShape extends SupportedZodTypes>
							? ShapeOf<InnerShape>[]
							: never

function shapeOf<Shape extends SupportedZodTypes>(shape: Shape): ShapeOf<SupportedZodTypes> {
	switch (shape.def.type) {
		case 'object': {
			return Object.fromEntries(
				Object.entries(shape.def.shape).map(([key, value]) => {
					return [key, shapeOf(value)]
				})
			) as ShapeOf<Shape>
		}
		case 'array': {
			return [shapeOf(shape.def.element)] as ShapeOf<Shape>
		}
		case 'number': {
			return 'number' as ShapeOf<Shape>
		}
		case 'string': {
			return 'string' as ShapeOf<Shape>
		}
		case 'boolean': {
			return 'boolean' as ShapeOf<Shape>
		}
		case 'undefined': {
			return 'undefined' as ShapeOf<Shape>
		}
		case 'void': {
			return 'void' as ShapeOf<Shape>
		}
	}
}

export function createChain<Nodes extends Record<string, GenericNode>>(nodes: Nodes) {
	function createDefinitions<Name extends string, Input extends Record<string, SupportedZodTypes>>({
		name,
		input
	}: { name: Name; input: Input }) {
		return z.object({
			node: z.literal(name as Name extends string ? Name : never),
			input: z.object(
				Object.defineProperties(
					{},
					Object.fromEntries(
						Object.entries(input).map(([key, arg]) => [
							key,
							{
								enumerable: true,
								configurable: false,
								get() {
									return getCompatability({
										node: name,
										key
									})
								}
							}
						])
					)
				)
			) as z.ZodObject<{
				[K in keyof Input]: ReturnType<typeof getCompatability<Name, K extends string ? K : never>>
			}>
		})
	}

	type Definition = {
		definition: z.ZodObject
		output: SupportedZodTypes
	}

	function compatableWith<
		Type extends SupportedZodTypes,
		Definitions extends Record<string, Definition>
	>({ type, definitions }: { type: Type; definitions: Definitions }) {
		const shape = shapeOf(type)
		return Object.entries(definitions)
			.filter(([_, definition]) => shapeOf(definition.output) === shape)
			.map(([name, definition]) => definition.definition) as {
			[K in keyof Definitions]: ReturnType<
				typeof shapeOf<Definitions[K]['output']>
			> extends typeof shape
				? Definitions[K]['definition']
				: never
		}[keyof Definitions][]
	}

	const definitions = Object.fromEntries(
		Object.entries(nodes).map(([name, node]) => [
			name,
			{
				definition: createDefinitions({ name, input: node.input }),
				output: node.output
			}
		])
	) as {
		[K in keyof Nodes]: {
			definition: ReturnType<typeof createDefinitions<K extends string ? K : never, Nodes[K]['input']>>
			output: Nodes[K]['output']
		}
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
								zod: z.union([arg, ...compatableWith({ type: arg, definitions })])
							}
						]
					})
				)
			]
		})
	) as {
		[K in keyof Nodes]: {
			[K2 in keyof Nodes[K]['input']]: {
				shape: ShapeOf<Nodes[K]['input'][K2]>
				zod: z.ZodUnion<
					[
						Nodes[K]['input'][K2],
						...ReturnType<typeof compatableWith<Nodes[K]['input'][K2], typeof definitions>>
					]
				>
			}
		}
	}

	function getCompatability<Node extends string, Key extends string>({
		node,
		key
	}: {
		node: Node
		key: Key
	}) {
		console.log(node, key)
		return compatabilities[node][key].zod
	}

	return {
		definitions,
		compatabilities
	}
}
